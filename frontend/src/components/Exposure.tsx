"use client";

import { useState } from "react";
import { ownedPlayers, startedCount } from "@/lib/insights";
import type { League } from "@/lib/types";
import GameLine from "./GameLine";
import { LeagueLabel } from "./LineupCheck";
import { useNfl } from "./NflContext";
import { InjuryTag } from "./RosterTable";

export default function Exposure({ leagues }: { leagues: League[] }) {
  const [multiOnly, setMultiOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { nfl } = useNfl();
  const leagueCount = leagues.filter((l) => l.my_team_id).length;
  const all = ownedPlayers(leagues, nfl);
  const players = multiOnly ? all.filter((p) => p.placements.length > 1) : all;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Player exposure</h2>
          <p className="text-sm text-zinc-500">
            {all.length} players across {leagueCount} teams. One player&apos;s week swings every league you have him in.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={multiOnly} onChange={(e) => setMultiOnly(e.target.checked)} />
          Only players in 2+ leagues
        </label>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-zinc-500">You don&apos;t have any player in more than one league.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 font-medium">Leagues</th>
                <th className="px-3 py-2 font-medium">Starting</th>
                <th className="w-1/3 px-3 py-2 font-medium">Share of your teams</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {players.map((p) => {
                const owned = p.placements.length;
                const started = startedCount(p);
                const open = expanded === p.key;
                return (
                  <ExposureRow
                    key={p.key}
                    open={open}
                    onToggle={() => setExpanded(open ? null : p.key)}
                    cells={
                      <>
                        <td className="px-3 py-2">
                          <span className="font-medium">{p.name}</span>
                          <InjuryTag status={p.injuryStatus} />
                          <span className="ml-2 text-xs text-zinc-500">
                            {p.position} · {p.nflTeam}
                          </span>
                          <GameLine team={p.nflTeam} />
                        </td>
                        <td className="px-3 py-2 tabular-nums">{owned}</td>
                        <td className="px-3 py-2 tabular-nums">{started}</td>
                        <td className="px-3 py-2">
                          <ShareBar owned={owned} started={started} total={leagueCount} />
                        </td>
                      </>
                    }
                    detail={
                      <ul className="space-y-1">
                        {p.placements.map(({ league, player, started: s }) => (
                          <li key={`${league.platform}:${league.league_id}`} className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-xs font-medium text-zinc-500">
                              {s ? player.slot : player.slot === "BE" ? "Bench" : player.slot}
                            </span>
                            <LeagueLabel league={league} />
                          </li>
                        ))}
                      </ul>
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExposureRow({
  open,
  onToggle,
  cells,
  detail,
}: {
  open: boolean;
  onToggle: () => void;
  cells: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900" aria-expanded={open}>
        {cells}
      </tr>
      {open && (
        <tr className="bg-zinc-50/60 dark:bg-zinc-900/40">
          <td colSpan={4} className="px-3 py-2">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}

function ShareBar({ owned, started, total }: { owned: number; started: number; total: number }) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        title={`On ${owned} of ${total} teams, starting in ${started}`}
      >
        <div className="absolute inset-y-0 left-0 bg-zinc-300 dark:bg-zinc-600" style={{ width: pct(owned) }} />
        <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: pct(started) }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-zinc-500">{Math.round((owned / total) * 100)}%</span>
    </div>
  );
}
