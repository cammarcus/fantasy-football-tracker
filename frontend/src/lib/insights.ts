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

// Positions each flex slot accepts. ESPN: RB/WR/TE, WR/TE, RB/WR, OP (superflex), DP (IDP).
// Sleeper: FLEX, SUPER_FLEX, REC_FLEX, WRRB_FLEX, IDP_FLEX.
const FLEX_SLOT_POSITIONS: Record<string, Set<string>> = {
  "RB/WR/TE": new Set(["RB", "WR", "TE"]),
  "WR/TE": new Set(["WR", "TE"]),
  "RB/WR": new Set(["RB", "WR"]),
  OP: new Set(["QB", "RB", "WR", "TE"]),
  DP: new Set(["DT", "DE", "LB", "DL", "CB", "S", "DB"]),
  FLEX: new Set(["RB", "WR", "TE"]),
  SUPER_FLEX: new Set(["QB", "RB", "WR", "TE"]),
  REC_FLEX: new Set(["WR", "TE"]),
  WRRB_FLEX: new Set(["WR", "RB"]),
  IDP_FLEX: new Set(["DL", "LB", "DB"]),
};

export interface FlexSwap {
  league: League;
  flex: Player; // plays earlier, should move to the positional slot
  positional: Player; // plays later, should move to flex
  flexKickoff: string;
  positionalKickoff: string;
}

// Kickoff time for a player's game, only if it hasn't started (started games lock the player).
function upcomingKickoff(player: Player, nfl: NflIndex): number | null {
  const game = nfl.game(player.nfl_team);
  if (!game || game.state !== "scheduled") return null;
  return new Date(game.kickoff).getTime();
}

// A flex starter who plays before a positional starter they could swap with. Putting the later player
// in flex keeps the most options open: if a late player is ruled out, any flex-eligible player can
// still replace them, not just one at their position.
export function flexSwaps(leagues: League[], nfl: NflIndex | null): FlexSwap[] {
  if (!nfl) return [];
  const swaps: FlexSwap[] = [];
  for (const league of leagues) {
    const me = myTeam(league);
    if (!me) continue;
    const starters = me.roster.filter(isStarter);
    const positional = starters.filter((p) => !FLEX_SLOT_POSITIONS[p.slot]);
    // Earliest flex players first: they gain the most from moving.
    const flex = starters
      .filter((p) => FLEX_SLOT_POSITIONS[p.slot])
      .map((p) => ({ player: p, kickoff: upcomingKickoff(p, nfl) }))
      .filter((f): f is { player: Player; kickoff: number } => f.kickoff !== null)
      .sort((a, b) => a.kickoff - b.kickoff);
    const used = new Set<string>();
    for (const f of flex) {
      const allowed = FLEX_SLOT_POSITIONS[f.player.slot];
      let best: { player: Player; kickoff: number } | null = null;
      for (const p of positional) {
        if (used.has(p.player_id)) continue;
        // The flex player must fit the positional slot, and the positional player must fit the flex.
        if (normalizePosition(p.slot) !== normalizePosition(f.player.position)) continue;
        if (!allowed.has(normalizePosition(p.position))) continue;
        const kickoff = upcomingKickoff(p, nfl);
        if (kickoff === null || kickoff <= f.kickoff) continue;
        if (!best || kickoff > best.kickoff) best = { player: p, kickoff };
      }
      if (!best) continue;
      used.add(best.player.player_id);
      swaps.push({
        league,
        flex: f.player,
        positional: best.player,
        flexKickoff: nfl.game(f.player.nfl_team)!.kickoff,
        positionalKickoff: nfl.game(best.player.nfl_team)!.kickoff,
      });
    }
  }
  return swaps;
}
