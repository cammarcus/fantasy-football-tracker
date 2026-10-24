// Mirrors backend/app/models.py.

export type Platform = "espn" | "sleeper";

export interface Player {
  player_id: string;
  name: string;
  position: string;
  nfl_team: string;
  slot: string;
  injury_status: string | null;
}

export interface Team {
  team_id: string;
  name: string;
  owner: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  roster: Player[];
}

export interface Matchup {
  week: number;
  home_team_id: string;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
}

export interface League {
  platform: Platform;
  league_id: string;
  name: string;
  season: number;
  current_week: number;
  my_team_id: string | null;
  teams: Team[];
  matchups: Matchup[];
}

export interface LeagueError {
  platform: Platform;
  league_id: string | null;
  message: string;
}

export interface LeaguesResponse {
  leagues: League[];
  errors: LeagueError[];
}

export interface FreeAgent {
  player_id: string;
  name: string;
  position: string;
  nfl_team: string;
  injury_status: string | null;
  percent_owned: number | null;
  projected_points: number | null;
  trending_adds: number | null;
}

export interface LeagueWaivers {
  platform: Platform;
  league_id: string;
  name: string;
  players: FreeAgent[];
}

export interface WaiversResponse {
  waivers: LeagueWaivers[];
  errors: LeagueError[];
}
