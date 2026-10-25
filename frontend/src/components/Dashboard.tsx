"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchLeagues } from "@/lib/api";
import {
  clearCredentials,
  Credentials,
  hasPlatform,
  isRemembered,
  loadCredentials,
  saveCredentials,
  withoutPlatform,
} from "@/lib/credentials";
import { takeEspnHandoff } from "@/lib/espnCookies";
import { PLATFORM_LABEL } from "@/lib/format";
import { expertDisagreements, lineupAlerts, ownedPlayers, reversedPairs, unpairedMismatches } from "@/lib/insights";
import { useMarks } from "@/lib/marks";
import type { LeagueError, LeaguesResponse, Platform } from "@/lib/types";
import ConnectForm, { Preloaded } from "./ConnectForm";
import Exposure from "./Exposure";
import LeagueCard from "./LeagueCard";
import LeagueDetail from "./LeagueDetail";
import LineupCheck from "./LineupCheck";
import { useNfl } from "./NflContext";
import PlatformBadge from "./PlatformBadge";

const VIEWS = ["Leagues", "Lineup check", "Exposure"] as const;
type View = (typeof VIEWS)[number];

const PLATFORMS: Platform[] = ["sleeper", "espn"];

type Data =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: LeaguesResponse };

// Identifies one load of a platform's leagues: new credentials or a Refresh make a new key.
function leaguesKey(creds: Credentials | null, platform: Platform, reloadKey: number): string | null {
  if (!creds || !hasPlatform(creds, platform)) return null;
  return platform === "espn"
    ? `${creds.espnSwid}|${creds.espnS2}|${reloadKey}`
    : `${creds.sleeperUsername}|${reloadKey}`;
}

type Seed = { key: string; data: Data };

// Loads one platform's leagues, independently of the other. Null when it isn't connected.
// `seed` is a result the connect form already fetched for this exact key, so it isn't fetched twice.
function usePlatformLeagues(
  creds: Credentials | null,
  platform: Platform,
  reloadKey: number,
  seed: Seed | undefined,
): Data | null {
  // A new key (credentials changed or Refresh) means the last result is stale, so it reads as loading.
  const key = leaguesKey(creds, platform, reloadKey);
  const seeded = seed !== undefined && seed.key === key;
  const [loaded, setLoaded] = useState<{ key: string; data: Data } | null>(null);

  useEffect(() => {
    if (!key || !creds || seeded) return;
    let cancelled = false;
    fetchLeagues(creds, platform)
      .then((result) => !cancelled && setLoaded({ key, data: { status: "ready", result } }))
      .catch((e: Error) => !cancelled && setLoaded({ key, data: { status: "error", message: e.message } }));
    return () => {
      cancelled = true;
    };
    // creds is read only through key, which changes whenever this platform's credentials do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, platform, seeded]);

  if (!key) return null;
  if (seeded) return seed.data;
  return loaded?.key === key ? loaded.data : { status: "loading" };
}

// Rendered only in the browser (see page.tsx), so storage can be read during the first render.
export default function Dashboard() {
  // ESPN cookies sent back by the phone bookmarklet, waiting for the user to confirm.
  const [handoff, setHandoff] = useState(() => takeEspnHandoff());
  const [creds, setCreds] = useState<Credentials | null>(() => loadCredentials());
  // Which connect form is open: one platform, both (first visit), or none.
  const [connecting, setConnecting] = useState<Platform | "all" | null>(() => (creds === null ? "all" : null));
  const [reloadKey, setReloadKey] = useState(0);
  const [seeds, setSeeds] = useState<Partial<Record<Platform, Seed>>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("Leagues");
  const { nfl, rankings } = useNfl();
  const marks = useMarks();

  const data: Record<Platform, Data | null> = {
    sleeper: usePlatformLeagues(creds, "sleeper", reloadKey, seeds.sleeper),
    espn: usePlatformLeagues(creds, "espn", reloadKey, seeds.espn),
  };

  function connect(next: Credentials, remember: boolean, preloaded: Preloaded = {}) {
    saveCredentials(next, remember);
    const nextSeeds: Partial<Record<Platform, Seed>> = {};
    for (const p of PLATFORMS) {
      const key = leaguesKey(next, p, reloadKey);
      const result = preloaded[p];
      if (key && result) nextSeeds[p] = { key, data: { status: "ready", result } };
    }
    setSeeds(nextSeeds);
    setSelected(null);
    setCreds(next);
    setConnecting(null);
  }

  function acceptHandoff() {
    if (!handoff) return;
    const base = creds ?? { sleeperUsername: "", espnSwid: "", espnS2: "" };
    connect({ ...base, espnSwid: handoff.swid, espnS2: handoff.espnS2 }, creds ? isRemembered() : true);
    setHandoff(null);
  }

  const handoffPrompt = handoff && (
    <HandoffPrompt
      replacing={creds !== null && hasPlatform(creds, "espn")}
      onAccept={acceptHandoff}
      onDismiss={() => setHandoff(null)}
    />
  );

  function disconnect(platform: Platform) {
    if (!creds) return;
    const label = PLATFORM_LABEL[platform];
    if (!window.confirm(`Disconnect ${label}? Its leagues disappear and you'll need to sign in again to add them back.`))
      return;
    const next = withoutPlatform(creds, platform);
    setSelected(null);
    if (PLATFORMS.some((p) => hasPlatform(next, p))) {
      saveCredentials(next, isRemembered());
      setCreds(next);
    } else {
      clearCredentials();
      setCreds(null);
      setConnecting("all");
    }
  }

  if (connecting || !creds) {
    return (
      <div className="space-y-4">
        {handoffPrompt}
        {creds && (
          <button
            onClick={() => setConnecting(null)}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Back to leagues
          </button>
        )}
        <ConnectForm
          initial={creds}
          onConnect={connect}
          platform={connecting === "all" || connecting === null ? undefined : connecting}
        />
      </div>
    );
  }

  const results = PLATFORMS.map((p) => [p, data[p]] as const);
  const leagues = results.flatMap(([, d]) => (d?.status === "ready" ? d.result.leagues : []));
  const errors: LeagueError[] = results.flatMap(([platform, d]) =>
    d?.status === "ready" ? d.result.errors : d?.status === "error" ? [{ platform, league_id: null, message: d.message }] : [],
  );
  const loadingPlatforms = results.filter(([, d]) => d?.status === "loading").map(([p]) => p);
  const anyLoading = loadingPlatforms.length > 0;

  const league = leagues.find((l) => `${l.platform}:${l.league_id}` === selected);
  const owned = ownedPlayers(leagues, nfl);
  const pairs = reversedPairs(owned);
  const unreviewed = expertDisagreements(leagues, nfl, rankings).filter((f) => marks[f.key]?.state !== "aware");
  const issueCount =
    lineupAlerts(leagues, nfl).length + pairs.length + unpairedMismatches(owned, pairs).length + unreviewed.length;

  if (league) {
    return <LeagueDetail league={league} leagues={leagues} creds={creds} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      {handoffPrompt}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your leagues</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {leagues.length} league{leagues.length === 1 ? "" : "s"}
            {anyLoading && ` · loading ${loadingPlatforms.map((p) => PLATFORM_LABEL[p]).join(" and ")}…`}
          </p>
        </div>
        <HeaderButton onClick={() => setReloadKey((k) => k + 1)} disabled={anyLoading}>
          Refresh
        </HeaderButton>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Accounts">
        {PLATFORMS.map((p) => (
          <AccountChip
            key={p}
            platform={p}
            creds={creds}
            status={data[p]?.status ?? null}
            onConnect={() => setConnecting(p)}
            onDisconnect={() => disconnect(p)}
          />
        ))}
      </ul>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {errors.map((e, i) => (
            <li key={i}>
              <strong>{PLATFORM_LABEL[e.platform]}:</strong> {e.message}
            </li>
          ))}
        </ul>
      )}

      {leagues.length === 0 && anyLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      )}
      {leagues.length === 0 && !anyLoading && errors.length === 0 && (
        <p className="text-sm text-zinc-500">No leagues found for this season.</p>
      )}

      {leagues.length > 0 && (
        <>
          <div className="sticky top-0 z-10 flex flex-wrap gap-x-1 border-b border-zinc-200 bg-background dark:border-zinc-800">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`-mb-px flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-2 py-2.5 text-sm font-medium sm:flex-none sm:px-3 ${
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
          {view === "Leagues" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

// Confirms before using cookies from the URL: the bookmarklet sends them, but so could any link.
function HandoffPrompt({
  replacing,
  onAccept,
  onDismiss,
}: {
  replacing: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Connect ESPN" className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
      <p className="font-medium text-emerald-900 dark:text-emerald-200">Connect this ESPN account?</p>
      <p className="text-emerald-800 dark:text-emerald-300">
        Your ESPN sign-in came back from the Connect ESPN bookmark.
        {replacing && " It replaces the ESPN account you have connected."} Only continue if you just tapped that
        bookmark.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onAccept}
          className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          Connect ESPN
        </button>
        <button
          onClick={onDismiss}
          className="rounded-md px-4 py-2 text-emerald-900 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
        >
          Ignore
        </button>
      </div>
    </div>
  );
}

const STATUS_DOT: Record<Data["status"], { className: string; label: string }> = {
  loading: { className: "animate-pulse bg-zinc-400", label: "Loading leagues" },
  ready: { className: "bg-emerald-500", label: "Leagues loaded" },
  error: { className: "bg-red-500", label: "Couldn't load leagues" },
};

// One account as a single tap target. Connected: who it is plus a live status dot, and a menu with
// Update and Disconnect. Not connected: a Connect button.
function AccountChip({
  platform,
  creds,
  status,
  onConnect,
  onDisconnect,
}: {
  platform: Platform;
  creds: Credentials;
  status: Data["status"] | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = PLATFORM_LABEL[platform];

  // Open the menu from the pill's left edge, or from its right edge if that would run past the
  // window (a pill near the right side). Measured before paint, so it never visibly jumps.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.left = "0";
    menu.style.right = "auto";
    if (menu.getBoundingClientRect().right > document.documentElement.clientWidth) {
      menu.style.left = "auto";
      menu.style.right = "0";
    }
  }, [open]);

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => ref.current?.contains(e.target as Node) || setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hasPlatform(creds, platform)) {
    return (
      <li>
        <button
          onClick={onConnect}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          <span aria-hidden>+</span> Connect {label}
        </button>
      </li>
    );
  }

  const dot = status ? STATUS_DOT[status] : null;
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <li ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} account${dot ? `, ${dot.label.toLowerCase()}` : ""}`}
        className="flex max-w-full items-center gap-2 rounded-full border border-zinc-200 py-1.5 pr-3 pl-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
      >
        <PlatformBadge platform={platform} />
        {platform === "sleeper" && (
          <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-400">{creds.sleeperUsername}</span>
        )}
        {dot && <span title={dot.label} className={`size-2 shrink-0 rounded-full ${dot.className}`} />}
        <svg viewBox="0 0 12 12" aria-hidden className={`size-3 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute top-full z-20 mt-1 w-max min-w-full overflow-hidden rounded-lg border border-zinc-200 bg-background py-1 text-sm shadow-lg dark:border-zinc-800"
        >
          <MenuItem onClick={choose(onConnect)}>Update sign-in</MenuItem>
          <MenuItem onClick={choose(onDisconnect)} danger>
            Disconnect {label}
          </MenuItem>
        </div>
      )}
    </li>
  );
}

function MenuItem({ danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      role="menuitem"
      {...props}
      className={`block w-full px-4 py-2.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
        danger ? "text-red-600 dark:text-red-400" : ""
      }`}
    />
  );
}

function HeaderButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="whitespace-nowrap rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
    />
  );
}
