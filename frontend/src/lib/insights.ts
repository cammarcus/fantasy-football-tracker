// Cross-league insights, computed from the /api/leagues response on the client.

import { BENCH_SLOTS, myTeam } from "./format";
import { effectiveInjuryStatus, NflIndex, normalizeName } from "./nfl";
import type { InjuryReport, League, Player } from "./types";

export type Severity = "out" | "risk";

// Statuses that mean the player won't (or likely won't) play this week.
const OUT_STATUSES = new Set([
  "OUT",
  "INJURY_RESERVE",
  "INJURED_RESERVE",
  "IR",
  "SUSPENSION",
  "SUS",
  "PUP",
  "NA",
  "DNR",
  "COV",
  "DOUBTFUL",
]);
const RISK_STATUSES = new Set(["QUESTIONABLE", "DAY_TO_DAY"]);

export function injurySeverity(status: string | null): Severity | null {
  if (!status) return null;
  const key = status.toUpperCase().replace(/\s+/g, "_");
  if (OUT_STATUSES.has(key)) return "out";
  if (RISK_STATUSES.has(key)) return "risk";
  return null;
}

export interface Placement {
  league: League;
  player: Player;
  started: boolean;
}

export interface OwnedPlayer {
  key: string;
  name: string;
  position: string;
  nflTeam: string;
  injuryStatus: string | null;
  placements: Placement[];
}

export interface LineupAlert {
  league: League;
  player: Player;
  severity: Severity;
  reason: "bye" | "injury";
  status: string | null;
  report: InjuryReport | undefined;
}

function normalizePosition(position: string): string {
  return position === "D/ST" ? "DEF" : position;
}

// ESPN and Sleeper use different player IDs, so players are matched by name.
// Defenses are named differently ("Titans D/ST" vs "Tennessee Titans"), so they match on NFL team.
export function playerKey(p: Player): string {
  const position = normalizePosition(p.position);
  if (position === "DEF") return `DEF:${p.nfl_team}`;
  return `${normalizeName(p.name)}:${position}`;
}

export function isStarter(p: Player): boolean {
  return !BENCH_SLOTS.has(p.slot);
}

export function ownedPlayers(leagues: League[], nfl: NflIndex | null): OwnedPlayer[] {
  const byKey = new Map<string, OwnedPlayer>();
  for (const league of leagues) {
    const me = myTeam(league);
    if (!me) continue;
    for (const player of me.roster) {
      const key = playerKey(player);
      let owned = byKey.get(key);
      if (!owned) {
        owned = {
          key,
          name: player.name,
          position: normalizePosition(player.position),
          nflTeam: player.nfl_team,
          injuryStatus: effectiveInjuryStatus(player, nfl),
          placements: [],
        };
        byKey.set(key, owned);
      }
      owned.placements.push({ league, player, started: isStarter(player) });
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.placements.length - a.placements.length ||
      startedCount(b) - startedCount(a) ||
      a.name.localeCompare(b.name),
  );
}

export function startedCount(p: OwnedPlayer): number {
  return p.placements.filter((pl) => pl.started).length;
}

// Started in at least one league but sitting on the bench (BE) in another.
// IR and taxi spots don't count: those players can't be started there anyway.
export function startSitMismatches(owned: OwnedPlayer[]): OwnedPlayer[] {
  return owned.filter(
    (p) => p.placements.some((pl) => pl.started) && p.placements.some((pl) => pl.player.slot === "BE"),
  );
}

// Starters who won't play (bye, out) or might not (questionable).
export function lineupAlerts(leagues: League[], nfl: NflIndex | null): LineupAlert[] {
  const alerts: LineupAlert[] = [];
  for (const league of leagues) {
    const me = myTeam(league);
    if (!me) continue;
    for (const player of me.roster) {
      if (!isStarter(player)) continue;
      const report = nfl?.injury(player);
      const status = effectiveInjuryStatus(player, nfl);
      if (nfl?.onBye(player.nfl_team)) {
        alerts.push({ league, player, severity: "out", reason: "bye", status, report });
        continue;
      }
      const severity = injurySeverity(status);
      if (severity) alerts.push({ league, player, severity, reason: "injury", status, report });
    }
  }
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "out" ? -1 : 1));
}
