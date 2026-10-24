"""NFL-wide data (schedule, byes, injuries) from ESPN's public, unauthenticated endpoints.

These endpoints are undocumented, so responses are cached and shared across all
users to keep request volume low.
"""

import asyncio
import time
from datetime import datetime, timezone

import httpx

from .models import InjuryReport, NflGame, NflWeek
from .sleeper_client import get_nfl_state
from .teams import normalize_team

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries"
PRO_SCHEDULE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}"

GAMES_TTL_SECONDS = 60  # live game status changes quickly
INJURIES_TTL_SECONDS = 10 * 60  # the feed is ~9 MB, so fetch it sparingly
INJURIES_MIN_REFRESH_SECONDS = 60  # floor for a user-requested refresh
BYES_TTL_SECONDS = 24 * 60 * 60

# Sleeper season_type -> ESPN seasontype
SEASON_TYPES = {"pre": 1, "regular": 2, "post": 3}

GAME_STATES = {"pre": "scheduled", "in": "in_progress", "post": "final"}

# The injury feed covers every position; only these matter for fantasy rosters.
FANTASY_POSITIONS = {"QB", "RB", "FB", "WR", "TE", "PK", "K"}


class _Cache:
    def __init__(self) -> None:
        self.entries: dict = {}
        self.lock = asyncio.Lock()

    async def get(self, key, ttl: float, load, force_after: float | None = None):
        """Return the cached value for key, reloading it when older than ttl.

        force_after: reload anyway if the entry is at least this old (for manual refreshes).
        """
        async with self.lock:
            entry = self.entries.get(key)
            age = time.time() - entry[0] if entry else None
            if entry is None or age > ttl or (force_after is not None and age > force_after):
                self.entries[key] = (time.time(), await load())
            return self.entries[key]


_games_cache = _Cache()
_injuries_cache = _Cache()
_byes_cache = _Cache()


async def _load_games(client: httpx.AsyncClient, season: int, week: int, season_type: int) -> list[NflGame]:
    resp = await client.get(SCOREBOARD_URL, params={"dates": season, "week": week, "seasontype": season_type})
    resp.raise_for_status()

    games = []
    for event in resp.json().get("events", []):
        comp = event["competitions"][0]
        teams = {c["homeAway"]: c for c in comp["competitors"]}
        status = comp.get("status", {}).get("type", {})
        games.append(
            NflGame(
                game_id=event["id"],
                kickoff=event["date"],
                state=GAME_STATES.get(status.get("state"), "scheduled"),
                status_detail=status.get("shortDetail", ""),
                home_team=normalize_team(teams["home"]["team"]["abbreviation"]),
                away_team=normalize_team(teams["away"]["team"]["abbreviation"]),
                home_score=int(teams["home"].get("score") or 0),
                away_score=int(teams["away"].get("score") or 0),
            )
        )
    return games


async def _load_byes(client: httpx.AsyncClient, season: int) -> dict[str, int]:
    resp = await client.get(PRO_SCHEDULE_URL.format(season=season), params={"view": "proTeamSchedules_wl"})
    resp.raise_for_status()
    return {
        normalize_team(t["abbrev"]): t["byeWeek"]
        for t in resp.json().get("settings", {}).get("proTeams", [])
        if t.get("id") and t.get("byeWeek")
    }


async def _load_injuries(client: httpx.AsyncClient) -> list[InjuryReport]:
    resp = await client.get(INJURIES_URL, timeout=60)
    resp.raise_for_status()

    reports = []
    for team in resp.json().get("injuries", []):
        for item in team.get("injuries", []):
            athlete = item.get("athlete", {})
            if athlete.get("position", {}).get("abbreviation") not in FANTASY_POSITIONS:
                continue
            reports.append(
                InjuryReport(
                    name=athlete.get("displayName", ""),
                    team=normalize_team(athlete.get("team", {}).get("abbreviation")),
                    position=athlete.get("position", {}).get("abbreviation", ""),
                    status=item.get("status", ""),
                    comment=item.get("shortComment") or None,
                    updated=item.get("date") or None,
                )
            )
    return reports


async def get_nfl_week(refresh_injuries: bool = False) -> NflWeek:
    async with httpx.AsyncClient(timeout=20) as client:
        state = await get_nfl_state(client)
        season = int(state["season"])
        week = max(int(state.get("display_week") or state.get("week") or 1), 1)
        season_type = SEASON_TYPES.get(state.get("season_type"), 2)

        (_, games), (_, byes), (injuries_at, injuries) = await asyncio.gather(
            _games_cache.get((season, week, season_type), GAMES_TTL_SECONDS,
                             lambda: _load_games(client, season, week, season_type)),
            _byes_cache.get(season, BYES_TTL_SECONDS, lambda: _load_byes(client, season)),
            _injuries_cache.get("all", INJURIES_TTL_SECONDS, lambda: _load_injuries(client),
                                force_after=INJURIES_MIN_REFRESH_SECONDS if refresh_injuries else None),
        )

    return NflWeek(
        season=season,
        week=week,
        games=games,
        bye_teams=sorted(t for t, bye in byes.items() if bye == week) if season_type == 2 else [],
        injuries=injuries,
        injuries_updated_at=datetime.fromtimestamp(injuries_at, tz=timezone.utc).isoformat(),
    )
