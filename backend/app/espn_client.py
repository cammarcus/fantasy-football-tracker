import asyncio

import httpx
from espn_api.football import League as EspnLeague
from espn_api.requests.espn_requests import ESPNAccessDenied, ESPNInvalidLeague, ESPNUnknownError

from .models import EspnCredentials, FreeAgent, League, LeagueError, LeagueWaivers, Matchup, Player, Team
from .teams import normalize_team

ESPN_FAN_URL = "https://fan.api.espn.com/apis/v2/fans/{swid}"
ESPN_FOOTBALL_ABBREV = "FFL"


def _safe_error_message(e: Exception) -> str:
    """Describe an error without echoing credentials back to the caller.

    httpx errors include the request URL, which contains the SWID, so only
    errors whose messages are known to be credential-free are passed through.
    """
    if isinstance(e, (ESPNAccessDenied, ESPNInvalidLeague, ESPNUnknownError)):
        return str(e)
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code in (401, 403):
            return "ESPN rejected the credentials. Check that SWID and espn_s2 are correct and not expired."
        return f"ESPN returned HTTP {e.response.status_code}"
    if isinstance(e, httpx.TimeoutException):
        return "ESPN took too long to respond"
    return f"Unexpected error ({type(e).__name__})"


def _normalize_swid(swid: str) -> str:
    swid = swid.strip().strip('"')
    return swid if swid.startswith("{") else "{" + swid + "}"


async def discover_leagues(creds: EspnCredentials) -> list[dict]:
    """Ask ESPN's fan profile which football leagues this account belongs to.

    Returns [{"league_id", "season", "team_id"}]. This endpoint is unofficial.
    """
    swid = _normalize_swid(creds.swid)
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            ESPN_FAN_URL.format(swid=swid),
            params={"displayHiddenPrefs": "true", "context": "fantasy", "useCookieAuth": "true"},
            cookies={"SWID": swid, "espn_s2": creds.espn_s2},
        )
        resp.raise_for_status()

    leagues = []
    for pref in resp.json().get("preferences", []):
        entry = pref.get("metaData", {}).get("entry", {})
        if entry.get("abbrev") != ESPN_FOOTBALL_ABBREV:
            continue
        group = (entry.get("groups") or [{}])[0]
        if group.get("groupId"):
            leagues.append(
                {"league_id": int(group["groupId"]), "season": entry.get("seasonId"), "team_id": entry.get("entryId")}
            )
    return leagues


def _owner_name(team) -> str:
    if not team.owners:
        return "Unowned"
    o = team.owners[0]
    full = f"{o.get('firstName', '')} {o.get('lastName', '')}".strip()
    return o.get("displayName") or full or "Unknown"


def _injury_status(player) -> str | None:
    # espn-api returns [] when the field is missing; ACTIVE/NORMAL mean healthy.
    status = player.injuryStatus
    if not isinstance(status, str) or status in ("ACTIVE", "NORMAL"):
        return None
    return status


def _load_league(league_id: int, season: int, swid: str, espn_s2: str, team_id: int | None) -> League:
    # espn-api is synchronous; this runs in a worker thread.
    lg = EspnLeague(league_id=league_id, year=season, espn_s2=espn_s2, swid=swid)

    my_team_id = team_id
    if my_team_id is None:
        my_team_id = next(
            (t.team_id for t in lg.teams if any(o.get("id") == swid for o in t.owners)),
            None,
        )

    teams = [
        Team(
            team_id=str(t.team_id),
            name=t.team_name,
            owner=_owner_name(t),
            wins=t.wins,
            losses=t.losses,
            ties=t.ties,
            points_for=round(t.points_for, 2),
            points_against=round(t.points_against, 2),
            roster=[
                Player(
                    player_id=str(p.playerId),
                    name=p.name,
                    position=p.position,
                    nfl_team=normalize_team(p.proTeam),
                    slot=p.lineupSlot,
                    injury_status=_injury_status(p),
                )
                for p in t.roster
            ],
        )
        for t in lg.teams
    ]

    week = lg.current_week
    matchups = [
        Matchup(
            week=week,
            home_team_id=str(m.home_team.team_id) if m.home_team else "",
            away_team_id=str(m.away_team.team_id) if m.away_team else None,
            home_score=m.home_score,
            away_score=m.away_score,
        )
        for m in lg.scoreboard(week)
    ]

    return League(
        platform="espn",
        league_id=str(league_id),
        name=lg.settings.name,
        season=season,
        current_week=week,
        my_team_id=str(my_team_id) if my_team_id is not None else None,
        teams=teams,
        matchups=matchups,
    )


def _load_waivers(
    league_id: int, season: int, swid: str, espn_s2: str, team_id: int | None, position: str | None, limit: int
) -> LeagueWaivers:
    # espn-api is synchronous; this runs in a worker thread.
    lg = EspnLeague(league_id=league_id, year=season, espn_s2=espn_s2, swid=swid)
    if position:
        position = "D/ST" if position.upper() in ("DEF", "DST", "D/ST") else position.upper()

    players = [
        FreeAgent(
            player_id=str(p.playerId),
            name=p.name,
            position=p.position,
            nfl_team=normalize_team(p.proTeam),
            injury_status=_injury_status(p),
            percent_owned=p.percent_owned,
            projected_points=round(p.projected_points, 2),
        )
        for p in lg.free_agents(size=limit, position=position)
    ]
    return LeagueWaivers(platform="espn", league_id=str(league_id), name=lg.settings.name, players=players)


async def _run_per_league(creds: EspnCredentials, season: int, load, *extra_args) -> tuple[list, list[LeagueError]]:
    """Find the account's leagues, then call load(league_id, season, swid, espn_s2, team_id, *extra_args) for each."""
    swid = _normalize_swid(creds.swid)

    if creds.league_ids:
        targets = [{"league_id": lid, "season": season, "team_id": None} for lid in creds.league_ids]
    else:
        try:
            targets = [t for t in await discover_leagues(creds) if t["season"] == season]
        except httpx.HTTPError as e:
            # The fan API answers 404 for a SWID it doesn't know, which is almost always a copy mistake.
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 404:
                message = "ESPN didn't recognize that SWID. Copy it again from fantasy.espn.com while logged in."
            else:
                message = f"Could not discover ESPN leagues: {_safe_error_message(e)}"
            return [], [LeagueError(platform="espn", message=message)]
        if not targets:
            return [], [
                LeagueError(
                    platform="espn",
                    message=f"No ESPN football leagues found for {season}. Check that SWID and espn_s2 are correct.",
                )
            ]

    results = await asyncio.gather(
        *(
            asyncio.to_thread(load, t["league_id"], season, swid, creds.espn_s2, t["team_id"], *extra_args)
            for t in targets
        ),
        return_exceptions=True,
    )

    loaded, errors = [], []
    for target, result in zip(targets, results):
        if isinstance(result, Exception):
            errors.append(
                LeagueError(platform="espn", league_id=str(target["league_id"]), message=_safe_error_message(result))
            )
        else:
            loaded.append(result)
    return loaded, errors


async def get_espn_leagues(creds: EspnCredentials, season: int) -> tuple[list[League], list[LeagueError]]:
    return await _run_per_league(creds, season, _load_league)


async def get_espn_waivers(
    creds: EspnCredentials, season: int, position: str | None, limit: int
) -> tuple[list[LeagueWaivers], list[LeagueError]]:
    return await _run_per_league(creds, season, _load_waivers, position, limit)
