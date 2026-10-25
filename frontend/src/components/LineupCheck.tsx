"use client";

import {
  AvailableStarter,
  availableElsewhere,
  expertDisagreements,
  FlexSwap,
  flexSwaps,
  LineupAlert,
  lineupAlerts,
  OwnedPlayer,
  ownedPlayers,
  ReversedPair,
  reversedPairs,
  startingInstead,
  unpairedMismatches,
} from "@/lib/insights";
import { useMarks } from "@/lib/marks";
import { timeAgo } from "@/lib/nfl";
import type { League, Player } from "@/lib/types";
import ExpertCheck from "./ExpertCheck";
import GameLine from "./GameLine";
import { useNfl } from "./NflContext";
import PlatformBadge from "./PlatformBadge";
import { InjuryTag } from "./RosterTable";

export default function LineupCheck({ leagues }: { leagues: League[] }) {
  const { nfl, error, refreshing, refreshInjuries, rankings } = useNfl();
  const marks = useMarks();
  const alerts = lineupAlerts(leagues, nfl);
  const owned = ownedPlayers(leagues, nfl);
  const pairs = reversedPairs(owned);
  const mismatches = unpairedMismatches(owned, pairs);
  const available = availableElsewhere(leagues, owned);
  const swaps = flexSwaps(leagues, nfl);
  const expertCount = expertDisagreements(leagues, nfl, rankings).filter((f) => marks[f.key]?.state !== "aware").length;
  const jumps = [
    { id: "injuries", label: "May not play", count: alerts.length },
    { id: "experts", label: "Experts", count: expertCount },
    ...(nfl ? [{ id: "flex", label: "Flex order", count: swaps.length }] : []),
    { id: "mismatches", label: "Start/sit", count: pairs.length + mismatches.length },
    { id: "available", label: "Waiver wires", count: available.length },
  ];

  return (
    <div className="space-y-8">
      {/* The page is long on a phone, so each section is one tap away. */}
      <nav className="flex flex-wrap gap-2">
        {jumps.map((j) => (
          <a
            key={j.id}
            href={`#${j.id}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {j.label}
            <span
              className={`rounded-full px-1.5 tabular-nums ${
                j.count
                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
              }`}
            >
              {j.count}
            </span>
          </a>
        ))}
      </nav>

      <section id="injuries" className="scroll-mt-16 space-y-3">
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
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
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

      <ExpertCheck leagues={leagues} />

      {nfl && (
        <section id="flex" className="scroll-mt-16 space-y-3">
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

      <section id="mismatches" className="scroll-mt-16 space-y-3">
        <div>
          <h2 className="font-semibold">Start/sit mismatches</h2>
          <p className="text-sm text-zinc-500">
            Players you start in one league but bench in another. Sometimes that&apos;s on purpose (deeper rosters,
            different scoring), but it&apos;s often a lineup that wasn&apos;t updated.
          </p>
        </div>
        {pairs.length === 0 && mismatches.length === 0 ? (
          <AllClear>Your lineups agree everywhere.</AllClear>
        ) : (
          <ul className="space-y-3">
            {pairs.map((pair) => (
              <PairRow key={`${pair.a.key}|${pair.b.key}`} pair={pair} />
            ))}
            {mismatches.map((p) => (
              <MismatchRow key={p.key} player={p} />
            ))}
          </ul>
        )}
      </section>

      <section id="available" className="scroll-mt-16 space-y-3">
        <div>
          <h2 className="font-semibold">Your starters on other leagues&apos; waiver wires</h2>
          <p className="text-sm text-zinc-500">
            Players you start in one league who aren&apos;t on any roster in another. They may be on waivers (claim
            needed) rather than free agents.
          </p>
        </div>
        {available.length === 0 ? (
          <AllClear>None of your starters are sitting unclaimed in your other leagues.</AllClear>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {available.map((a) => (
              <AvailableRow key={a.player.key} item={a} />
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
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severity === "out" ? "bg-red-500" : "bg-amber-400"}`}
        aria-label={severity === "out" ? "Won't play" : "At risk"}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p>
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
        </p>
        <LeagueLabel league={league} />
        {reason === "injury" && report?.comment && (
          <p className="text-xs text-zinc-500">
            {report.comment}
            {report.updated && <span className="text-zinc-400"> · {timeAgo(report.updated)}</span>}
          </p>
        )}
        {reason === "injury" && <GameLine team={player.nfl_team} />}
      </div>
    </li>
  );
}

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function SwapRow({ swap }: { swap: FlexSwap }) {
  const { league, flex, positional, flexKickoff, positionalKickoff } = swap;
  return (
    <li className="space-y-1.5 px-3 py-2.5 text-sm">
      <LeagueLabel league={league} />
      <p>
        Swap <span className="font-medium">{flex.name}</span>
          <span className="ml-1 text-xs text-zinc-500">
            ({flex.slot}, {kickoffLabel(flexKickoff)})
        </span>{" "}
        and <span className="font-medium">{positional.name}</span>
        <span className="ml-1 text-xs text-zinc-500">
          ({positional.slot}, {kickoffLabel(positionalKickoff)})
        </span>
      </p>
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
          <li key={`${league.platform}:${league.league_id}`} className="flex gap-2 text-sm">
            <span
              className={`w-24 min-w-0 text-xs font-medium ${
                started ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"
              }`}
            >
              {started ? `Starting (${p.slot})` : p.slot === "BE" ? "Bench" : p.slot}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <LeagueLabel league={league} />
              {p.slot === "BE" && <StartingInstead league={league} benched={p} />}
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}

function StartingInstead({ league, benched }: { league: League; benched: Player }) {
  const instead = startingInstead(league, benched);
  if (!instead.length) return null;
  return (
    <p className="wrap-break-word text-xs text-zinc-500">
      for {instead.map((p) => `${p.name} (${p.slot})`).join(", ")}
    </p>
  );
}

function PairRow({ pair }: { pair: ReversedPair }) {
  const { a, b, aOverB, bOverA } = pair;
  return (
    <li className="rounded-lg border border-amber-200 p-3 dark:border-amber-900">
      <p className="text-sm font-medium">
        {a.name} and {b.name}
        <span className="ml-2 text-xs font-normal text-zinc-500">{a.position}</span>
      </p>
      <p className="text-xs text-zinc-500">Opposite start/bench calls in different leagues.</p>
      <ul className="mt-2 space-y-2">
        {[
          { leagues: aOverB, start: a, sit: b },
          { leagues: bOverA, start: b, sit: a },
        ].flatMap(({ leagues, start, sit }) =>
          leagues.map((league) => (
            <li key={`${league.platform}:${league.league_id}`} className="space-y-0.5 text-sm">
              <LeagueLabel league={league} />
              <p>
                <span className="text-emerald-700 dark:text-emerald-400">Start {start.name}</span>
                <span className="text-zinc-500"> · bench {sit.name}</span>
              </p>
            </li>
          )),
        )}
      </ul>
    </li>
  );
}

function AvailableRow({ item }: { item: AvailableStarter }) {
  const { player, startedIn, availableIn } = item;
  return (
    <li className="space-y-1 px-3 py-2 text-sm">
      <p>
        <span className="font-medium">{player.name}</span>
        <InjuryTag status={player.injuryStatus} />
        <span className="ml-2 text-xs text-zinc-500">
          {player.position} · {player.nflTeam}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>Starting in</span>
        {startedIn.map((l) => (
          <LeagueLabel key={`${l.platform}:${l.league_id}`} league={l} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-700 dark:text-emerald-400">
        <span>Available in</span>
        {availableIn.map((l) => (
          <LeagueLabel key={`${l.platform}:${l.league_id}`} league={l} />
        ))}
      </div>
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
