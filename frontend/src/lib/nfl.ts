// Joins league players to NFL-wide data: this week's game, byes and the latest injury report.

import type { InjuryReport, NflGame, NflWeek } from "./types";

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

// "Kenneth Walker III", "A.J. Brown" and "Amon-Ra St. Brown" all normalize the same way on every platform.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((part) => part && !SUFFIXES.has(part))
    .join(" ");
}

function normalizePosition(position: string): string {
  if (position === "D/ST") return "DEF";
  if (position === "PK") return "K";
  return position;
}

export interface PlayerRef {
  name: string;
  position: string;
  nfl_team: string;
}

export interface NflIndex {
  week: NflWeek;
  game(team: string): NflGame | undefined;
  onBye(team: string): boolean;
  injury(player: PlayerRef): InjuryReport | undefined;
}

export function buildNflIndex(week: NflWeek): NflIndex {
  const gamesByTeam = new Map<string, NflGame>();
  for (const g of week.games) {
    gamesByTeam.set(g.home_team, g);
    gamesByTeam.set(g.away_team, g);
  }
  const byes = new Set(week.bye_teams);

  // Match on name + team first; fall back to name + position for players whose team
  // differs between sources (e.g. a recent trade).
  const byTeam = new Map<string, InjuryReport>();
  const byPosition = new Map<string, InjuryReport>();
  for (const r of week.injuries) {
    const name = normalizeName(r.name);
    byTeam.set(`${name}:${r.team}`, r);
    byPosition.set(`${name}:${normalizePosition(r.position)}`, r);
  }

  return {
    week,
    game: (team) => gamesByTeam.get(team),
    onBye: (team) => byes.has(team),
    injury: (p) => {
      if (normalizePosition(p.position) === "DEF") return undefined;
      const name = normalizeName(p.name);
      return byTeam.get(`${name}:${p.nfl_team}`) ?? byPosition.get(`${name}:${normalizePosition(p.position)}`);
    },
  };
}

// The injury report is fresher than league data (Sleeper's player list is cached for a day),
// so prefer it when the player appears there.
export function effectiveInjuryStatus(player: PlayerRef & { injury_status: string | null }, nfl: NflIndex | null) {
  const report = nfl?.injury(player);
  return report ? report.status : player.injury_status || null;
}

export function gameLine(team: string, nfl: NflIndex | null): string | null {
  if (!nfl || team === "FA") return null;
  if (nfl.onBye(team)) return "BYE";
  const g = nfl.game(team);
  if (!g) return null;
  const home = g.home_team === team;
  const opponent = home ? `vs ${g.away_team}` : `@ ${g.home_team}`;
  if (g.state === "final") {
    const [us, them] = home ? [g.home_score, g.away_score] : [g.away_score, g.home_score];
    return `${us > them ? "W" : us < them ? "L" : "T"} ${us}-${them} ${opponent}`;
  }
  if (g.state === "in_progress") return `Live · ${g.status_detail} ${opponent}`;
  const kickoff = new Date(g.kickoff).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return `${kickoff} ${opponent}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
