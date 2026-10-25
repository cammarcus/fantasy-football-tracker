"use client";

import { useEffect, useState } from "react";
import { fetchWaivers } from "@/lib/api";
import type { Credentials } from "@/lib/credentials";
import { myLeaguesByPlayer, Placement, playerKey } from "@/lib/insights";
import { effectiveInjuryStatus } from "@/lib/nfl";
import type { FreeAgent, League } from "@/lib/types";
import GameLine from "./GameLine";
import { useNfl } from "./NflContext";
import { InjuryTag } from "./RosterTable";

const POSITIONS = ["All", "QB", "RB", "WR", "TE", "K", "DEF"];

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; players: FreeAgent[] };

export default function WaiverWire({
  league,
  leagues,
  creds,
}: {
  league: League;
  leagues: League[];
  creds: Credentials;
}) {
  const [position, setPosition] = useState("All");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchWaivers(creds, league.platform, league.league_id, position === "All" ? null : position)
      .then((data) => {
        if (cancelled) return;
        const error = data.errors.find((e) => !e.league_id || e.league_id === league.league_id);
        if (data.waivers.length === 0 && error) {
          setState({ status: "error", message: error.message });
        } else {
          setState({ status: "ready", players: data.waivers[0]?.players ?? [] });
        }
      })
      .catch((e: Error) => !cancelled && setState({ status: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [creds, league.platform, league.league_id, position]);

  function choose(pos: string) {
    if (pos === position) return;
    setState({ status: "loading" });
    setPosition(pos);
  }

  const isEspn = league.platform === "espn";
  const { nfl } = useNfl();
  const mine = myLeaguesByPlayer(leagues);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => choose(pos)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${
              pos === position
                ? "bg-zinc-900 text-white ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100"
                : "text-zinc-600 ring-zinc-300 hover:bg-zinc-100 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-zinc-900"
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        {isEspn
          ? "Sorted by % owned across ESPN. Projection is for this week."
          : "Sorted by adds across all Sleeper leagues in the last 24 hours."}
      </p>

      {state.status === "loading" && <p className="text-sm text-zinc-500">Loading available players…</p>}
      {state.status === "error" && <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>}
      {state.status === "ready" &&
        (state.players.length === 0 ? (
          <p className="text-sm text-zinc-500">No available players at this position.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {state.players.map((p) => (
              <li key={p.player_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-10 shrink-0 text-xs font-medium text-zinc-500">{p.position}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {p.name}
                    <InjuryTag status={effectiveInjuryStatus(p, nfl)} />
                    <span className="ml-2 text-xs text-zinc-500">{p.nfl_team}</span>
                  </span>
                  <GameLine team={p.nfl_team} />
                  <OwnedElsewhere placements={mine.get(playerKey(p))} />
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                  {isEspn ? (
                    <>
                      <span className="block">{p.percent_owned ?? 0}%</span>
                      <span className="block">{p.projected_points ?? 0} proj</span>
                    </>
                  ) : p.trending_adds
                      ? `+${p.trending_adds.toLocaleString()}`
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

// A free agent here who is on your team in another league.
function OwnedElsewhere({ placements }: { placements: Placement[] | undefined }) {
  if (!placements?.length) return null;
  const started = placements.filter((pl) => pl.started);
  const shown = started.length ? started : placements;
  const names = shown.map((pl) => pl.league.name).join(", ");
  return (
    <span
      className={`mt-0.5 inline-block max-w-full truncate rounded px-1 py-0.5 text-[10px] font-semibold ${
        started.length
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
      title={names}
    >
      {started.length ? "You start" : "On your roster"} in{" "}
      {shown.length === 1 ? names : `${shown.length} leagues`}
    </span>
  );
}
