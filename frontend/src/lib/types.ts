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

export interface NflGame {
  game_id: string;
  kickoff: string;
  state: "scheduled" | "in_progress" | "final";
  status_detail: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}

export interface InjuryReport {
  name: string;
  team: string;
  position: string;
  status: string;
  comment: string | null;
  updated: string | null;
}

export interface NflWeek {
  season: number;
  week: number;
  games: NflGame[];
  bye_teams: string[];
  injuries: InjuryReport[];
  injuries_updated_at: string;
}

export interface Analyst {
  id: string;
  name: string;
  source: string;
}

export interface PlayerRanking {
  name: string;
  position: string;
  nfl_team: string;
  ranks: Record<string, number>;
}

export interface RankingsWeek {
  season: number;
  week: number;
  analysts: Analyst[];
  players: PlayerRanking[];
}
