import asyncio
import time

import httpx

from .models import FreeAgent, League, LeagueError, LeagueWaivers, Matchup, Player, SleeperCredentials, Team
from .teams import normalize_team

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"
PLAYERS_TTL_SECONDS = 24 * 60 * 60

# Positions that can fill each of Sleeper's flex roster slots.
FLEX_SLOT_POSITIONS = {
    "FLEX": {"RB", "WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"},
    "REC_FLEX": {"WR", "TE"},
    "WRRB_FLEX": {"WR", "RB"},
    "IDP_FLEX": {"DL", "LB", "DB"},
}

# Sleeper asks clients to fetch the full player database at most once a day.
_players_cache: dict = {"data": None, "fetched_at": 0.0}
_players_lock = asyncio.Lock()


async def get_nfl_state(client: httpx.AsyncClient) -> dict:
    resp = await client.get(f"{SLEEPER_BASE_URL}/state/nfl")
    resp.raise_for_status()
    return resp.json()


async def _get_players(client: httpx.AsyncClient) -> dict:
    async with _players_lock:
        if _players_cache["data"] is None or time.time() - _players_cache["fetched_at"] > PLAYERS_TTL_SECONDS:
            resp = await client.get(f"{SLEEPER_BASE_URL}/players/nfl", timeout=60)
            resp.raise_for_status()
            _players_cache["data"] = resp.json()
            _players_cache["fetched_at"] = time.time()
        return _players_cache["data"]


async def _resolve_user_id(client: httpx.AsyncClient, creds: SleeperCredentials) -> str:
    if creds.user_id:
        return creds.user_id
    if not creds.username:
        raise ValueError("Sleeper username or user_id is required")
    resp = await client.get(f"{SLEEPER_BASE_URL}/user/{creds.username}")
    resp.raise_for_status()
    user = resp.json()
    if not user:
        raise ValueError(f"Sleeper user '{creds.username}' not found")
    return user["user_id"]


def _to_player(player_id: str, slot: str, players: dict) -> Player:
    p = players.get(player_id, {})
    name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or player_id
    return Player(
        player_id=player_id,
        name=name,
        position=p.get("position") or "?",
        nfl_team=normalize_team(p.get("team")),
        slot=slot,
        injury_status=p.get("injury_status"),
    )


def _build_roster(roster: dict, starter_slots: list[str], players: dict) -> list[Player]:
    starters = roster.get("starters") or []
    reserve = set(roster.get("reserve") or [])
    taxi = set(roster.get("taxi") or [])

    result = [
        _to_player(pid, slot, players)
        for pid, slot in zip(starters, starter_slots)
        if pid and pid != "0"  # "0" marks an empty starting slot
    ]
    for pid in roster.get("players") or []:
        if pid in starters:
            continue
        slot = "IR" if pid in reserve else "TAXI" if pid in taxi else "BE"
        result.append(_to_player(pid, slot, players))
    return result


async def _load_league(
    client: httpx.AsyncClient, league: dict, user_id: str, week: int, players: dict
) -> League:
    league_id = league["league_id"]
    users_resp, rosters_resp, matchups_resp = await asyncio.gather(
        client.get(f"{SLEEPER_BASE_URL}/league/{league_id}/users"),
        client.get(f"{SLEEPER_BASE_URL}/league/{league_id}/rosters"),
        client.get(f"{SLEEPER_BASE_URL}/league/{league_id}/matchups/{week}"),
    )
    for resp in (users_resp, rosters_resp, matchups_resp):
        resp.raise_for_status()

    users = {u["user_id"]: u for u in users_resp.json()}
    starter_slots = [s for s in league.get("roster_positions", []) if s not in ("BN", "IR", "TAXI")]

    teams = []
    my_team_id = None
    for roster in rosters_resp.json():
        owner = users.get(roster.get("owner_id"), {})
        settings = roster.get("settings", {})
        team_id = str(roster["roster_id"])
        if roster.get("owner_id") == user_id or user_id in (roster.get("co_owners") or []):
            my_team_id = team_id
        teams.append(
            Team(
                team_id=team_id,
                name=(owner.get("metadata") or {}).get("team_name") or owner.get("display_name") or f"Team {team_id}",
                owner=owner.get("display_name", "Unowned"),
                wins=settings.get("wins", 0),
                losses=settings.get("losses", 0),
                ties=settings.get("ties", 0),
                points_for=round(settings.get("fpts", 0) + settings.get("fpts_decimal", 0) / 100, 2),
                points_against=round(settings.get("fpts_against", 0) + settings.get("fpts_against_decimal", 0) / 100, 2),
                roster=_build_roster(roster, starter_slots, players),
            )
        )

    # Sleeper returns one row per roster; rows sharing a matchup_id play each other.
    pairs: dict[int, list[dict]] = {}
    for row in matchups_resp.json():
        if row.get("matchup_id") is not None:
            pairs.setdefault(row["matchup_id"], []).append(row)
    matchups = []
    for rows in pairs.values():
        home = rows[0]
        away = rows[1] if len(rows) > 1 else None
        matchups.append(
            Matchup(
                week=week,
                home_team_id=str(home["roster_id"]),
                away_team_id=str(away["roster_id"]) if away else None,
                home_score=home.get("points") or 0,
                away_score=(away.get("points") or 0) if away else 0,
            )
        )

    return League(
        platform="sleeper",
        league_id=league_id,
        name=league["name"],
        season=int(league["season"]),
        current_week=week,
        my_team_id=my_team_id,
        teams=teams,
        matchups=matchups,
    )


async def get_sleeper_leagues(
    creds: SleeperCredentials, season: int | None = None
) -> tuple[list[League], list[LeagueError]]:
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            user_id, week, leagues = await _get_user_leagues(client, creds, season)
            players = await _get_players(client) if leagues else {}
        except (httpx.HTTPError, ValueError) as e:
            return [], [LeagueError(platform="sleeper", message=str(e))]

        results = await asyncio.gather(
            *(_load_league(client, lg, user_id, week, players) for lg in leagues),
            return_exceptions=True,
        )
    return _split_results(leagues, results)


async def get_sleeper_waivers(
    creds: SleeperCredentials, season: int | None, position: str | None, limit: int
) -> tuple[list[LeagueWaivers], list[LeagueError]]:
    if position:
        position = "DEF" if position.upper() in ("DEF", "DST", "D/ST") else position.upper()

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            _, _, leagues = await _get_user_leagues(client, creds, season)
            if not leagues:
                return [], []
            players, trending = await asyncio.gather(_get_players(client), _get_trending_adds(client))
        except (httpx.HTTPError, ValueError) as e:
            return [], [LeagueError(platform="sleeper", message=str(e))]

        results = await asyncio.gather(
            *(_load_waivers(client, lg, players, trending, position, limit) for lg in leagues),
            return_exceptions=True,
        )
    return _split_results(leagues, results)


async def _get_user_leagues(
    client: httpx.AsyncClient, creds: SleeperCredentials, season: int | None
) -> tuple[str, int, list[dict]]:
    state = await get_nfl_state(client)
    season = season or int(state["season"])
    week = max(int(state.get("display_week") or state.get("week") or 1), 1)
    user_id = await _resolve_user_id(client, creds)
    resp = await client.get(f"{SLEEPER_BASE_URL}/user/{user_id}/leagues/nfl/{season}")
    resp.raise_for_status()
    return user_id, week, resp.json() or []


def _split_results(leagues: list[dict], results: list) -> tuple[list, list[LeagueError]]:
    loaded, errors = [], []
    for lg, result in zip(leagues, results):
        if isinstance(result, Exception):
            errors.append(LeagueError(platform="sleeper", league_id=lg["league_id"], message=str(result)))
        else:
            loaded.append(result)
    return loaded, errors


async def _get_trending_adds(client: httpx.AsyncClient) -> dict[str, int]:
    resp = await client.get(
        f"{SLEEPER_BASE_URL}/players/nfl/trending/add", params={"lookback_hours": 24, "limit": 300}
    )
    resp.raise_for_status()
    return {row["player_id"]: row["count"] for row in resp.json()}


def _eligible_positions(roster_positions: list[str]) -> set[str]:
    positions = set()
    for slot in roster_positions:
        positions.update(FLEX_SLOT_POSITIONS.get(slot, {slot}))
    return positions - {"BN", "IR", "TAXI"}


async def _load_waivers(
    client: httpx.AsyncClient,
    league: dict,
    players: dict,
    trending: dict[str, int],
    position: str | None,
    limit: int,
) -> LeagueWaivers:
    resp = await client.get(f"{SLEEPER_BASE_URL}/league/{league['league_id']}/rosters")
    resp.raise_for_status()
    rostered = {pid for roster in resp.json() for pid in (roster.get("players") or [])}
    eligible = _eligible_positions(league.get("roster_positions", []))

    candidates = []
    for pid, p in players.items():
        pos = p.get("position")
        # Skip rostered players, players with no NFL team (except team defenses), and positions the league doesn't use.
        if pid in rostered or pos not in eligible or (not p.get("team")) or (position and pos != position):
            continue
        if pos != "DEF" and not p.get("active"):
            continue
        candidates.append((pid, p))

    # Most-added across Sleeper first, then Sleeper's own relevance ranking.
    candidates.sort(key=lambda c: (-trending.get(c[0], 0), c[1].get("search_rank") or 9_999_999))

    return LeagueWaivers(
        platform="sleeper",
        league_id=league["league_id"],
        name=league["name"],
        players=[
            FreeAgent(
                player_id=pid,
                name=_to_player(pid, "FA", players).name,
                position=p["position"],
                nfl_team=normalize_team(p["team"]),
                injury_status=p.get("injury_status"),
                trending_adds=trending.get(pid),
            )
            for pid, p in candidates[:limit]
        ],
    )
