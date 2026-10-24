"use client";

import {
  FlexSwap,
  flexSwaps,
  LineupAlert,
  lineupAlerts,
  OwnedPlayer,
  ownedPlayers,
  startSitMismatches,
} from "@/lib/insights";
import { timeAgo } from "@/lib/nfl";
import type { League } from "@/lib/types";
import GameLine from "./GameLine";
import { useNfl } from "./NflContext";
import PlatformBadge from "./PlatformBadge";
import { InjuryTag } from "./RosterTable";

export default function LineupCheck({ leagues }: { leagues: League[] }) {
  const { nfl, error, refreshing, refreshInjuries } = useNfl();
  const alerts = lineupAlerts(leagues, nfl);
  const mismatches = startSitMismatches(ownedPlayers(leagues, nfl));
  const swaps = flexSwaps(leagues, nfl);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Starters who may not play</h2>
            <p className="text-sm text-zinc-500">
              On a bye, out, doubtful or questionable this week.
              {nfl && <> Injury reports updated {timeAgo(nfl.week.injuries_updated_at)}.</>}
            </p>
          </div>
          <button
            onClick={refreshInjuries}
            disabled={refreshing}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {refreshing ? "Refreshing…" : "Refresh injuries"}
          </button>
        </div>
        {error && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Couldn&apos;t load the NFL schedule and injury reports, so byes aren&apos;t checked and injuries come from
            your leagues only. ({error})
          </p>
        )}
        {alerts.length === 0 ? (
          <AllClear>Every starter is healthy and playing this week.</AllClear>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {alerts.map((alert) => (
              <AlertRow key={`${alert.league.platform}:${alert.league.league_id}:${alert.player.player_id}`} alert={alert} />
            ))}
          </ul>
        )}
      </section>

      {nfl && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">Flex order</h2>
            <p className="text-sm text-zinc-500">
              Put later games in your flex. If a late player is ruled out, anyone flex-eligible can replace them,
              not just a player at the same position.
            </p>
          </div>
          {swaps.length === 0 ? (
            <AllClear>Your flex spots already hold your latest games.</AllClear>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {swaps.map((swap) => (
                <SwapRow
                  key={`${swap.league.platform}:${swap.league.league_id}:${swap.flex.player_id}`}
                  swap={swap}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Start/sit mismatches</h2>
          <p className="text-sm text-zinc-500">
            Players you start in one league but bench in another. Sometimes that&apos;s on purpose (deeper rosters,
            different scoring), but it&apos;s often a lineup that wasn&apos;t updated.
          </p>
        </div>
        {mismatches.length === 0 ? (
          <AllClear>Your lineups agree everywhere.</AllClear>
        ) : (
          <ul className="space-y-3">
            {mismatches.map((p) => (
              <MismatchRow key={p.key} player={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AlertRow({ alert }: { alert: LineupAlert }) {
  const { league, player, severity, reason, status, report } = alert;
  return (
    <li className="space-y-1 px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${severity === "out" ? "bg-red-500" : "bg-amber-400"}`}
          aria-label={severity === "out" ? "Won't play" : "At risk"}
        />
        <span className="min-w-0 flex-1 truncate">
          {player.name}
          {reason === "bye" ? (
            <span className="ml-2 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
              BYE
            </span>
          ) : (
            <InjuryTag status={status} />
          )}
          <span className="ml-2 text-xs text-zinc-500">
            {player.slot} · {player.nfl_team}
          </span>
        </span>
        <LeagueLabel league={league} />
      </div>
      {reason === "injury" && report?.comment && (
        <p className="pl-5 text-xs text-zinc-500">
          {report.comment}
          {report.updated && <span className="text-zinc-400"> · {timeAgo(report.updated)}</span>}
        </p>
      )}
      {reason === "injury" && (
        <div className="pl-5">
          <GameLine team={player.nfl_team} />
        </div>
      )}
    </li>
  );
}

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function SwapRow({ swap }: { swap: FlexSwap }) {
  const { league, flex, positional, flexKickoff, positionalKickoff } = swap;
  return (
    <li className="space-y-1 px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          Swap <span className="font-medium">{flex.name}</span>
          <span className="ml-1 text-xs text-zinc-500">
            ({flex.slot}, {kickoffLabel(flexKickoff)})
          </span>{" "}
          and <span className="font-medium">{positional.name}</span>
          <span className="ml-1 text-xs text-zinc-500">
            ({positional.slot}, {kickoffLabel(positionalKickoff)})
          </span>
        </span>
        <LeagueLabel league={league} />
      </div>
      <p className="text-xs text-zinc-500">
        Move {positional.name} to {flex.slot} and {flex.name} to {positional.slot}.
      </p>
    </li>
  );
}

function MismatchRow({ player }: { player: OwnedPlayer }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">
        {player.name}
        <InjuryTag status={player.injuryStatus} />
        <span className="ml-2 text-xs font-normal text-zinc-500">
          {player.position} · {player.nflTeam}
        </span>
      </p>
      <GameLine team={player.nflTeam} />
      <ul className="mt-2 space-y-1">
        {player.placements.map(({ league, player: p, started }) => (
          <li key={`${league.platform}:${league.league_id}`} className="flex items-center gap-2 text-sm">
            <span
              className={`w-20 shrink-0 text-xs font-medium ${
                started ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"
              }`}
            >
              {started ? `Starting (${p.slot})` : p.slot === "BE" ? "Bench" : p.slot}
            </span>
            <LeagueLabel league={league} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export function LeagueLabel({ league }: { league: League }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
      <PlatformBadge platform={league.platform} />
      <span className="truncate">{league.name}</span>
    </span>
  );
}

function AllClear({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
      {children}
    </p>
  );
}
