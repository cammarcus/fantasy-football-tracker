"use client";

import { useEffect, useState } from "react";
import { fetchWaivers } from "@/lib/api";
import type { Credentials } from "@/lib/credentials";
import type { FreeAgent, League } from "@/lib/types";
import { InjuryTag } from "./RosterTable";

const POSITIONS = ["All", "QB", "RB", "WR", "TE", "K", "DEF"];

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; players: FreeAgent[] };

export default function WaiverWire({ league, creds }: { league: League; creds: Credentials }) {
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => choose(pos)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
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
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  <InjuryTag status={p.injury_status} />
                  <span className="ml-2 text-xs text-zinc-500">{p.nfl_team}</span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                  {isEspn
                    ? `${p.percent_owned ?? 0}% · ${p.projected_points ?? 0} proj`
                    : p.trending_adds
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
