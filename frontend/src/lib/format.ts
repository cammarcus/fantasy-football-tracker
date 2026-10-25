import type { League, Matchup, Team } from "./types";

const INJURY_SHORT: Record<string, string> = {
  QUESTIONABLE: "Q",
  DOUBTFUL: "D",
  OUT: "O",
  INJURY_RESERVE: "IR",
  IR: "IR",
  PUP: "PUP",
  SUSPENSION: "SUS",
  SUS: "SUS",
  NA: "NA",
  DNR: "DNR",
  COV: "COV",
  DAY_TO_DAY: "DTD",
  INJURED_RESERVE: "IR",
};

// ESPN fantasy uses QUESTIONABLE / INJURY_RESERVE, Sleeper uses Questionable / IR,
// and ESPN's injury report uses Questionable / Injured Reserve / Active.
export function injuryLabel(status: string | null): string | null {
  if (!status) return null;
  const key = status.toUpperCase().replace(/\s+/g, "_");
  if (key === "ACTIVE" || key === "NORMAL") return null;
  return INJURY_SHORT[key] ?? status;
}

export function record(team: Team): string {
  return team.ties ? `${team.wins}-${team.losses}-${team.ties}` : `${team.wins}-${team.losses}`;
}

export function points(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export function myTeam(league: League): Team | undefined {
  return league.teams.find((t) => t.team_id === league.my_team_id);
}

export interface MyMatchup {
  matchup: Matchup;
  myScore: number;
  opponent: Team | undefined;
  opponentScore: number;
}

export function myMatchup(league: League): MyMatchup | null {
  const id = league.my_team_id;
  if (!id) return null;
  const matchup = league.matchups.find((m) => m.home_team_id === id || m.away_team_id === id);
  if (!matchup) return null;
  const home = matchup.home_team_id === id;
  const opponentId = home ? matchup.away_team_id : matchup.home_team_id;
  return {
    matchup,
    myScore: home ? matchup.home_score : matchup.away_score,
    opponent: league.teams.find((t) => t.team_id === opponentId),
    opponentScore: home ? matchup.away_score : matchup.home_score,
  };
}

export function standings(league: League): Team[] {
  return [...league.teams].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || b.points_for - a.points_for,
  );
}

export const BENCH_SLOTS = new Set(["BE", "IR", "TAXI"]);

export const PLATFORM_LABEL = { espn: "ESPN", sleeper: "Sleeper" } as const;

// Where to change the lineup: the app is read-only.
export function leagueUrl(league: League): string {
  if (league.platform === "sleeper") return `https://sleeper.com/leagues/${league.league_id}`;
  const team = league.my_team_id ? `&teamId=${league.my_team_id}` : "";
  return `https://fantasy.espn.com/football/team?leagueId=${league.league_id}${team}`;
}
