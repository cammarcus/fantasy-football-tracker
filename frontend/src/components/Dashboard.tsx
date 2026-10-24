"use client";

import { useEffect, useState } from "react";
import { fetchLeagues } from "@/lib/api";
import { clearCredentials, Credentials, loadCredentials, saveCredentials } from "@/lib/credentials";
import { PLATFORM_LABEL } from "@/lib/format";
import { lineupAlerts, ownedPlayers, startSitMismatches } from "@/lib/insights";
import type { LeaguesResponse } from "@/lib/types";
import ConnectForm from "./ConnectForm";
import Exposure from "./Exposure";
import LeagueCard from "./LeagueCard";
import LeagueDetail from "./LeagueDetail";
import LineupCheck from "./LineupCheck";
import { useNfl } from "./NflContext";

const VIEWS = ["Leagues", "Lineup check", "Exposure"] as const;
type View = (typeof VIEWS)[number];

type Data =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: LeaguesResponse };

// Rendered only in the browser (see page.tsx), so storage can be read during the first render.
export default function Dashboard() {
  const [creds, setCreds] = useState<Credentials | null>(() => loadCredentials());
  const [editing, setEditing] = useState(() => creds === null);
  const [data, setData] = useState<Data>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("Leagues");
  const { nfl } = useNfl();

  useEffect(() => {
    if (!creds) return;
    let cancelled = false;
    fetchLeagues(creds)
      .then((result) => !cancelled && setData({ status: "ready", result }))
      .catch((e: Error) => !cancelled && setData({ status: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [creds, reloadKey]);

  function connect(next: Credentials, remember: boolean) {
    saveCredentials(next, remember);
    setData({ status: "loading" });
    setSelected(null);
    setCreds(next);
    setEditing(false);
  }

  function refresh() {
    setData({ status: "loading" });
    setReloadKey((k) => k + 1);
  }

  function signOut() {
    clearCredentials();
    setCreds(null);
    setSelected(null);
    setEditing(true);
  }

  if (editing || !creds) {
    return (
      <div className="space-y-4">
        {creds && (
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Back to leagues
          </button>
        )}
        <ConnectForm initial={creds} onConnect={connect} />
      </div>
    );
  }

  const leagues = data.status === "ready" ? data.result.leagues : [];
  const league = leagues.find((l) => `${l.platform}:${l.league_id}` === selected);
  const issueCount = lineupAlerts(leagues, nfl).length + startSitMismatches(ownedPlayers(leagues, nfl)).length;

  if (league) {
    return <LeagueDetail league={league} creds={creds} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your leagues</h1>
          {data.status === "ready" && (
            <p className="mt-1 text-sm text-zinc-500">
              {leagues.length} league{leagues.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="flex gap-2 text-sm">
          <HeaderButton onClick={refresh} disabled={data.status === "loading"}>
            Refresh
          </HeaderButton>
          <HeaderButton onClick={() => setEditing(true)}>Accounts</HeaderButton>
          <HeaderButton onClick={signOut}>Sign out</HeaderButton>
        </div>
      </div>

      {data.status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      )}

      {data.status === "error" && <p className="text-sm text-red-600 dark:text-red-400">{data.message}</p>}

      {data.status === "ready" && (
        <>
          {data.result.errors.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {data.result.errors.map((e, i) => (
                <li key={i}>
                  <strong>{PLATFORM_LABEL[e.platform]}:</strong> {e.message}
                </li>
              ))}
            </ul>
          )}
          {leagues.length === 0 && data.result.errors.length === 0 && (
            <p className="text-sm text-zinc-500">No leagues found for this season.</p>
          )}
          {leagues.length > 0 && (
            <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                    v === view
                      ? "border-zinc-900 dark:border-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {v}
                  {v === "Lineup check" && issueCount > 0 && (
                    <span className="rounded-full bg-red-100 px-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                      {issueCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {view === "Leagues" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {leagues.map((l) => (
                <LeagueCard
                  key={`${l.platform}:${l.league_id}`}
                  league={l}
                  onOpen={() => setSelected(`${l.platform}:${l.league_id}`)}
                />
              ))}
            </div>
          )}
          {view === "Lineup check" && <LineupCheck leagues={leagues} />}
          {view === "Exposure" && <Exposure leagues={leagues} />}
        </>
      )}
    </div>
  );
}

function HeaderButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
    />
  );
}
