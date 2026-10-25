"use client";

import { useState } from "react";
import { OwnedPlayer, ownedPlayers, startedCount } from "@/lib/insights";
import type { League } from "@/lib/types";
import GameLine from "./GameLine";
import { LeagueLabel } from "./LineupCheck";
import { useNfl } from "./NflContext";
import { InjuryTag } from "./RosterTable";

export default function Exposure({ leagues }: { leagues: League[] }) {
  const [multiOnly, setMultiOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { nfl } = useNfl();
  const myLeagues = leagues.filter((l) => l.my_team_id);
  const leagueCount = myLeagues.length;
  const all = ownedPlayers(leagues, nfl);
  const players = multiOnly ? all.filter((p) => p.placements.length > 1) : all;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Player exposure</h2>
          <p className="text-sm text-zinc-500">
            {all.length} players across {leagueCount} teams. One player&apos;s week swings every league you have them in.
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span>One dot per league:</span>
            <span className="flex items-center gap-1">
              <Dot state="start" /> Starting
            </span>
            <span className="flex items-center gap-1">
              <Dot state="bench" /> Bench
            </span>
            <span className="flex items-center gap-1">
              <Dot state="none" /> Not on team
            </span>
          </p>
        </div>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={multiOnly} onChange={(e) => setMultiOnly(e.target.checked)} />
          Only players in 2+ leagues
        </label>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-zinc-500">You don&apos;t have any player in more than one league.</p>
      ) : (
        // A list, not a table: four columns don't fit a phone. Tap a player for each league.
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {players.map((p) => {
            const owned = p.placements.length;
            const started = startedCount(p);
            const open = expanded === p.key;
            return (
              <li key={p.key}>
                <button
                  onClick={() => setExpanded(open ? null : p.key)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    <InjuryTag status={p.injuryStatus} />
                    <span className="ml-2 text-xs text-zinc-500">
                      {p.position} · {p.nflTeam}
                    </span>
                    <GameLine team={p.nflTeam} />
                  </span>
                  <span className="shrink-0 space-y-1">
                    <LeagueDots player={p} leagues={myLeagues} />
                    <span className="block text-right text-xs tabular-nums text-zinc-500">
                      {started} of {owned} starting
                    </span>
                  </span>
                </button>
                {open && (
                  <ul className="space-y-1 bg-zinc-50/60 px-3 py-2 dark:bg-zinc-900/40">
                    {p.placements.map(({ league, player, started: s }) => (
                      <li key={`${league.platform}:${league.league_id}`} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs font-medium text-zinc-500">
                          {s ? player.slot : player.slot === "BE" ? "Bench" : player.slot}
                        </span>
                        <LeagueLabel league={league} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type DotState = "start" | "bench" | "none";

// One hue, more invested = more ink: starting is solid, bench is a pale fill with an outline that
// clears the surface (a bright bench fill read as "starting" on white), "not on team" is a gray ring.
// Starting matches the app's "Starting" text color. Contrast checked with the dataviz validator.
const DOT_CLASS: Record<DotState, string> = {
  start: "bg-emerald-700 dark:bg-emerald-400",
  bench: "bg-emerald-200 ring-[1.5px] ring-inset ring-emerald-600 dark:bg-emerald-800 dark:ring-0",
  none: "ring-[1.5px] ring-inset ring-zinc-400 dark:ring-zinc-600",
};

function Dot({ state, title }: { state: DotState; title?: string }) {
  return <span title={title} className={`block size-2.5 shrink-0 rounded-full ${DOT_CLASS[state]}`} />;
}

// One dot per league, always in the same order, so each column is one league down the whole list.
function LeagueDots({ player, leagues }: { player: OwnedPlayer; leagues: League[] }) {
  const owned = player.placements.length;
  const started = startedCount(player);
  return (
    <span
      role="img"
      aria-label={`On ${owned} of ${leagues.length} teams, starting in ${started}`}
      className="flex justify-end gap-1"
    >
      {leagues.map((league) => {
        const placement = player.placements.find((pl) => pl.league === league);
        const state: DotState = !placement ? "none" : placement.started ? "start" : "bench";
        const detail = !placement
          ? "not on your team"
          : placement.started
            ? `starting (${placement.player.slot})`
            : placement.player.slot === "BE"
              ? "bench"
              : placement.player.slot;
        return <Dot key={`${league.platform}:${league.league_id}`} state={state} title={`${league.name}: ${detail}`} />;
      })}
    </span>
  );
}
