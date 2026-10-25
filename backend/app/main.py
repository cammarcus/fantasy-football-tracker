import asyncio
import os

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .espn_client import get_espn_leagues, get_espn_waivers
from .models import LeaguesRequest, LeaguesResponse, NflWeek, RankingsWeek, WaiversRequest, WaiversResponse
from .nfl_client import get_nfl_week
from .rankings_client import get_rankings
from .sleeper_client import get_nfl_state, get_sleeper_leagues, get_sleeper_waivers

app = FastAPI(title="Fantasy Football Tracker")

# Comma-separated list of frontend origins allowed to call the API.
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/nfl/week", response_model=NflWeek)
async def nfl_week(refresh_injuries: bool = False) -> NflWeek:
    """This week's NFL games, bye teams and injury reports. No credentials needed."""
    return await get_nfl_week(refresh_injuries)


@app.get("/api/rankings", response_model=RankingsWeek)
async def rankings(season: int | None = None, week: int | None = None) -> RankingsWeek:
    """Each expert's positional ranks for a week (default: the current week). No credentials needed."""
    return await get_rankings(season, week)


async def _resolve_season(season: int | None) -> int:
    if season is not None:
        return season
    async with httpx.AsyncClient(timeout=20) as client:
        return int((await get_nfl_state(client))["season"])


def _merge(results: list[tuple[list, list]]) -> tuple[list, list]:
    items, errors = [], []
    for loaded, failed in results:
        items.extend(loaded)
        errors.extend(failed)
    return items, errors


@app.post("/api/leagues", response_model=LeaguesResponse)
async def get_leagues(req: LeaguesRequest) -> LeaguesResponse:
    season = await _resolve_season(req.season)
    leagues, errors = _merge(
        await asyncio.gather(
            *(get_espn_leagues(creds, season) for creds in req.espn),
            *(get_sleeper_leagues(creds, season) for creds in req.sleeper),
        )
    )
    return LeaguesResponse(leagues=leagues, errors=errors)


@app.post("/api/waivers", response_model=WaiversResponse)
async def get_waivers(req: WaiversRequest) -> WaiversResponse:
    season = await _resolve_season(req.season)
    waivers, errors = _merge(
        await asyncio.gather(
            *(get_espn_waivers(creds, season, req.position, req.limit) for creds in req.espn),
            *(get_sleeper_waivers(creds, season, req.position, req.limit) for creds in req.sleeper),
        )
    )
    return WaiversResponse(waivers=waivers, errors=errors)
