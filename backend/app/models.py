from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["espn", "sleeper"]


# --- Credentials supplied by the user ---


class EspnCredentials(BaseModel):
    swid: str
    espn_s2: str
    # Optional explicit list; otherwise leagues are discovered from the account.
    league_ids: list[int] | None = None


class SleeperCredentials(BaseModel):
    # Either works; username is looked up to get the user_id.
    username: str | None = None
    user_id: str | None = None


class LeaguesRequest(BaseModel):
    season: int | None = None  # defaults to the current NFL season
    espn: list[EspnCredentials] = []
    sleeper: list[SleeperCredentials] = []


class WaiversRequest(LeaguesRequest):
    position: str | None = None  # QB, RB, WR, TE, K, DEF (D/ST also accepted)
    limit: int = Field(25, ge=1, le=100)  # players per league


# --- Unified league data, same shape for every platform ---


class Player(BaseModel):
    player_id: str
    name: str
    position: str
    nfl_team: str
    slot: str  # lineup slot, e.g. QB, FLEX, BE, IR
    injury_status: str | None = None


class Team(BaseModel):
    team_id: str
    name: str
    owner: str
    wins: int
    losses: int
    ties: int
    points_for: float
    points_against: float
    roster: list[Player]


class Matchup(BaseModel):
    week: int
    home_team_id: str
    away_team_id: str | None  # None for a bye
    home_score: float
    away_score: float


class League(BaseModel):
    platform: Platform
    league_id: str
    name: str
    season: int
    current_week: int
    my_team_id: str | None
    teams: list[Team]
    matchups: list[Matchup]  # current week


class LeagueError(BaseModel):
    platform: Platform
    league_id: str | None = None
    message: str


class LeaguesResponse(BaseModel):
    leagues: list[League]
    errors: list[LeagueError]


# --- Waiver wire ---


class FreeAgent(BaseModel):
    player_id: str
    name: str
    position: str
    nfl_team: str
    injury_status: str | None = None
    percent_owned: float | None = None  # ESPN only
    projected_points: float | None = None  # ESPN only, this week
    trending_adds: int | None = None  # Sleeper only, adds across all Sleeper leagues in the last 24h


class LeagueWaivers(BaseModel):
    platform: Platform
    league_id: str
    name: str
    players: list[FreeAgent]


class WaiversResponse(BaseModel):
    waivers: list[LeagueWaivers]
    errors: list[LeagueError]
