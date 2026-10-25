// Looks up league players in the week's expert rankings.

import { playerKey } from "./insights";
import type { PlayerRef } from "./nfl";
import type { Analyst, PlayerRanking, RankingsWeek } from "./types";

export interface RankingsIndex {
  week: RankingsWeek;
  analyst(id: string): Analyst | undefined;
  get(player: PlayerRef): PlayerRanking | undefined;
}

// Rankings use ESPN's names; playerKey matches them to Sleeper players the same way exposure does.
export function buildRankingsIndex(week: RankingsWeek): RankingsIndex {
  const analysts = new Map(week.analysts.map((a) => [a.id, a]));
  const byKey = new Map(week.players.map((p) => [playerKey(p), p]));
  return {
    week,
    analyst: (id) => analysts.get(id),
    get: (player) => byKey.get(playerKey(player)),
  };
}

export function averageRank(ranking: PlayerRanking): number {
  const ranks = Object.values(ranking.ranks);
  return ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
}
