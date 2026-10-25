"""Weekly expert rankings. ESPN publishes each analyst's positional ranks through the same
undocumented fantasy API the leagues use; the "leaguedefaults" league needs no login.

Rankings are the same for every user, so they're cached and shared like the NFL data.
"""

import json

import httpx
from espn_api.football.constant import POSITION_MAP, PRO_TEAM_MAP

from .models import Analyst, PlayerRanking, RankingsWeek
from .nfl_client import _Cache
from .sleeper_client import get_nfl_state
from .teams import normalize_team

# League 3 is ESPN's default PPR league. The player info view is heavy (~6 KB per player even
# without stats), so stats are filtered out with a split type that never matches.
ESPN_DEFAULT_LEAGUE_URL = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leaguedefaults/3"
)
ESPN_PLAYER_LIMIT = 1100  # ranked players reach ~900th by ownership (kickers, defenses)
RANKINGS_TTL_SECONDS = 30 * 60  # analysts update ranks through the week

# rankSourceId -> analyst, matched against ESPN's published weekly tables (2026 season).
# Source 0 is a placeholder that always ranks 0. An unknown ID still shows, labeled by number.
ESPN_ANALYSTS = {
    3: "Karabell",
    5: "Cockcroft",
    6: "Yates",
    7: "Clay",
    9: "Bowen",
    10: "Dopp",
    11: "Moody",
    12: "Loza",
}

_rankings_cache = _Cache()


async def _load_espn(client: httpx.AsyncClient, season: int, week: int) -> tuple[list[Analyst], list[PlayerRanking]]:
    # Only PPR has every analyst; standard and superflex are one analyst each.
    fantasy_filter = {
        "players": {
            "limit": ESPN_PLAYER_LIMIT,
            "sortPercOwned": {"sortPriority": 1, "sortAsc": False},
            "filterRanksForScoringPeriodIds": {"value": [week]},
            "filterRanksForRankTypes": {"value": ["PPR"]},
            "filterStatsForSplitTypeIds": {"value": [99]},
        }
    }
    resp = await client.get(
        ESPN_DEFAULT_LEAGUE_URL.format(season=season),
        params={"view": "kona_player_info", "scoringPeriodId": week},
        headers={"x-fantasy-filter": json.dumps(fantasy_filter)},
        timeout=60,
    )
    resp.raise_for_status()

    seen: dict[str, Analyst] = {}
    players = []
    for entry in resp.json().get("players", []):
        player = entry.get("player", {})
        ranks, slot = {}, None
        for r in player.get("rankings", {}).get(str(week), []):
            source, rank = r.get("rankSourceId"), r.get("rank")
            if not source or not rank or r.get("rankType") != "PPR":
                continue
            analyst_id = f"espn:{source}"
            if analyst_id not in seen:
                seen[analyst_id] = Analyst(
                    id=analyst_id, name=ESPN_ANALYSTS.get(source, f"Analyst {source}"), source="ESPN"
                )
            ranks[analyst_id] = rank
            slot = r.get("slotId")
        if not ranks:
            continue
        players.append(
            PlayerRanking(
                name=player.get("fullName", ""),
                position=POSITION_MAP.get(slot, ""),
                nfl_team=normalize_team(PRO_TEAM_MAP.get(player.get("proTeamId"))),
                ranks=ranks,
            )
        )
    return sorted(seen.values(), key=lambda a: a.name), players


async def get_rankings(season: int | None = None, week: int | None = None) -> RankingsWeek:
    async with httpx.AsyncClient(timeout=20) as client:
        if season is None or week is None:
            state = await get_nfl_state(client)
            season = season or int(state["season"])
            week = week or max(int(state.get("display_week") or state.get("week") or 1), 1)
        _, (analysts, players) = await _rankings_cache.get(
            (season, week), RANKINGS_TTL_SECONDS, lambda: _load_espn(client, season, week)
        )
    return RankingsWeek(season=season, week=week, analysts=analysts, players=players)
