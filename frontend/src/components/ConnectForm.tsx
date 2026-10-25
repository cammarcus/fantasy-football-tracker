"use client";

import { useState } from "react";
import { fetchLeagues } from "@/lib/api";
import { Credentials, hasEspn, hasPlatform, hasSleeper, isRemembered, withoutPlatform } from "@/lib/credentials";
import {
  ESPN_CONSOLE_SNIPPET,
  espnBookmarklet,
  normalizeEspnS2,
  normalizeSwid,
  parseEspnCookies,
} from "@/lib/espnCookies";
import { PLATFORM_LABEL } from "@/lib/format";
import type { LeaguesResponse, Platform } from "@/lib/types";

interface Props {
  initial: Credentials | null;
  // Called once the accounts are checked; `preloaded` holds the leagues the check already fetched.
  onConnect: (creds: Credentials, remember: boolean, preloaded: Preloaded) => void;
  // Show one platform only (connecting or updating it); the other platform's saved values are kept.
  platform?: Platform;
}

export type Preloaded = Partial<Record<Platform, LeaguesResponse>>;

type Check = { status: "checking" } | { status: "ok"; result: LeaguesResponse } | { status: "failed"; message: string };

const PLATFORMS: Platform[] = ["sleeper", "espn"];

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none sm:text-sm focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500 dark:focus:ring-zinc-800";

export default function ConnectForm({ initial, onConnect, platform }: Props) {
  const [creds, setCreds] = useState<Credentials>(
    initial ?? { sleeperUsername: "", espnSwid: "", espnS2: "" },
  );
  const [remember, setRemember] = useState(() => (initial ? isRemembered() : true));
  const [error, setError] = useState<string | null>(null);
  const [pasteStatus, setPasteStatus] = useState<string | null>(null);
  // Each account is checked against the backend before it's saved, so mistakes show up here.
  const [checks, setChecks] = useState<Partial<Record<Platform, Check>>>({});
  // With both platforms on offer, each starts as a collapsed card unless it already has saved values.
  const collapsible = !platform;
  const [open, setOpen] = useState<Record<Platform, boolean>>(() => ({
    sleeper: platform === "sleeper" || (collapsible && initial !== null && hasSleeper(initial)),
    espn: platform === "espn" || (collapsible && initial !== null && hasEspn(initial)),
  }));
  const anyOpen = open.sleeper || open.espn;
  const checking = Object.values(checks).some((c) => c?.status === "checking");

  // What gets checked and saved: forgiving about how the values were pasted.
  const clean: Credentials = {
    sleeperUsername: creds.sleeperUsername.trim().replace(/^@/, ""),
    espnSwid: normalizeSwid(creds.espnSwid) ?? creds.espnSwid.trim(),
    espnS2: normalizeEspnS2(creds.espnS2) ?? creds.espnS2.trim(),
  };
  const wanted = platform ? [platform] : PLATFORMS.filter((p) => open[p]);

  function clearCheck(p: Platform) {
    setChecks((c) => {
      const next = { ...c };
      delete next[p];
      return next;
    });
  }

  function toggle(p: Platform, next: boolean) {
    setOpen((o) => ({ ...o, [p]: next }));
    if (!next) {
      // A collapsed card shouldn't submit values the user can no longer see.
      setCreds((c) => withoutPlatform(c, p));
      if (p === "espn") setPasteStatus(null);
      clearCheck(p);
      setError(null);
    }
  }

  function setField(key: keyof Credentials, value: string) {
    // A whole cookie line pasted into either ESPN field fills both.
    if (key !== "sleeperUsername") {
      const both = parseEspnCookies(value);
      if (both.swid && both.espnS2) {
        setCreds((c) => ({ ...c, espnSwid: both.swid!, espnS2: both.espnS2! }));
        clearCheck("espn");
        return;
      }
    }
    setCreds((c) => ({ ...c, [key]: value }));
    clearCheck(key === "sleeperUsername" ? "sleeper" : "espn");
  }

  // On leaving a field, show the cleaned-up value so the user sees what will be used.
  function tidy(key: "espnSwid" | "espnS2") {
    const value = key === "espnSwid" ? normalizeSwid(creds.espnSwid) : normalizeEspnS2(creds.espnS2);
    if (value && value !== creds[key]) setCreds((c) => ({ ...c, [key]: value }));
  }

  function finish(results: Partial<Record<Platform, Check>>) {
    let saved = clean;
    const preloaded: Preloaded = {};
    for (const p of wanted) {
      const c = results[p];
      if (c?.status === "ok") preloaded[p] = c.result;
      else saved = withoutPlatform(saved, p);
    }
    onConnect(saved, remember, preloaded);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (wanted.includes("espn") && Boolean(clean.espnSwid) !== Boolean(clean.espnS2)) {
      setError(clean.espnSwid ? "Add your espn_s2 too: ESPN needs both." : "Add your SWID too: ESPN needs both.");
      return;
    }
    const filled = wanted.filter((p) => hasPlatform(clean, p));
    if (!filled.length) {
      setError(platform ? `Add your ${PLATFORM_LABEL[platform]} details.` : "Add at least one account.");
      return;
    }
    setError(null);
    setChecks(Object.fromEntries(filled.map((p) => [p, { status: "checking" }])));
    const entries = await Promise.all(
      filled.map(async (p): Promise<[Platform, Check]> => {
        try {
          const result = await fetchLeagues(clean, p);
          // Leagues found, or none but no error either (e.g. no leagues this season): the account works.
          if (result.leagues.length || !result.errors.length) return [p, { status: "ok", result }];
          return [p, { status: "failed", message: result.errors[0].message }];
        } catch (err) {
          return [p, { status: "failed", message: (err as Error).message }];
        }
      }),
    );
    const results = Object.fromEntries(entries) as Partial<Record<Platform, Check>>;
    setChecks(results);
    if (entries.every(([, c]) => c.status === "ok")) finish(results);
  }

  const okPlatforms = wanted.filter((p) => checks[p]?.status === "ok");
  const failedPlatforms = wanted.filter((p) => checks[p]?.status === "failed");

  function pasteCookies(text: string) {
    const { swid, espnS2 } = parseEspnCookies(text);
    if (!text.trim()) return setPasteStatus(null);
    setCreds((c) => ({ ...c, espnSwid: swid ?? c.espnSwid, espnS2: espnS2 ?? c.espnS2 }));
    clearCheck("espn");
    setPasteStatus(
      swid && espnS2
        ? "Found SWID and espn_s2. They're filled in below."
        : `Couldn't find ${swid ? "espn_s2" : espnS2 ? "SWID" : "SWID or espn_s2"} in that. Make sure you're logged in at fantasy.espn.com, then run the snippet again.`,
    );
  }

  const swidHint = creds.espnSwid.trim() ? (normalizeSwid(creds.espnSwid) ? "ok" : "bad") : null;
  const s2Hint = creds.espnS2.trim() ? (normalizeEspnS2(creds.espnS2) ? "ok" : "bad") : null;

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {platform ? `Connect ${PLATFORM_LABEL[platform]}` : "Connect your leagues"}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {platform ? "" : "Add one or both accounts. "}Your credentials stay in this browser and are only sent to load
          your leagues.
        </p>
      </div>

      {platform !== "espn" && (
        <PlatformCard
          platform="sleeper"
          hint="Just your username."
          collapsible={collapsible}
          open={open.sleeper}
          onToggle={(next) => toggle("sleeper", next)}
          check={checks.sleeper}
        >
          <label className="block space-y-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Username</span>
            <input
              className={inputClass}
              value={creds.sleeperUsername}
              onChange={(e) => setField("sleeperUsername", e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={collapsible}
            />
          </label>
        </PlatformCard>
      )}

      {platform !== "sleeper" && (
        <PlatformCard
          platform="espn"
          hint="Two cookies from fantasy.espn.com. About a minute on a computer."
          collapsible={collapsible}
          open={open.espn}
          onToggle={(next) => toggle("espn", next)}
          check={checks.espn}
        >
          <EspnHelp onPaste={pasteCookies} status={pasteStatus} />
          <label className="block space-y-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">SWID</span>
            <input
              className={`${inputClass} font-mono`}
              value={creds.espnSwid}
              onChange={(e) => setField("espnSwid", e.target.value)}
              onBlur={() => tidy("espnSwid")}
              placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <FieldHint state={swidHint}>
              {swidHint === "ok"
                ? "Looks right."
                : "A SWID is 32 letters and numbers, like {1A2B3C4D-…}. Braces and dashes are optional."}
            </FieldHint>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">espn_s2</span>
            <input
              className={`${inputClass} font-mono`}
              type="password"
              value={creds.espnS2}
              onChange={(e) => setField("espnS2", e.target.value)}
              onBlur={() => tidy("espnS2")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <FieldHint state={s2Hint}>
              {s2Hint === "ok"
                ? `Looks right (${clean.espnS2.length} characters).`
                : "That looks too short. espn_s2 is usually a couple hundred characters; make sure you copied all of it."}
            </FieldHint>
          </label>
          <details className="text-sm text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer select-none">Find them by hand instead (works on any browser)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Log in at fantasy.espn.com in Chrome, Edge or Firefox.</li>
              <li>Open developer tools (F12, or Cmd+Option+I on a Mac).</li>
              <li>
                Go to <strong>Application</strong> (Chrome/Edge) or <strong>Storage</strong> (Firefox), then{" "}
                <strong>Cookies</strong> → <strong>https://fantasy.espn.com</strong>.
              </li>
              <li>
                Copy the values of <code>SWID</code> and <code>espn_s2</code>.
              </li>
            </ol>
            <p className="mt-2">
              espn_s2 is a login session, so treat it like a password. Logging out of ESPN in that browser ends it.
            </p>
          </details>
        </PlatformCard>
      )}

      {anyOpen && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember on this device
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={checking}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {checking && <Spinner />}
            {checking
              ? "Checking your account…"
              : failedPlatforms.length
                ? "Try again"
                : platform
                  ? `Load ${PLATFORM_LABEL[platform]} leagues`
                  : "Load my leagues"}
          </button>

          {!checking && okPlatforms.length > 0 && failedPlatforms.length > 0 && (
            <button
              type="button"
              onClick={() => finish(checks)}
              className="w-full rounded-md border border-zinc-300 px-4 py-2.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Continue with {okPlatforms.map((p) => PLATFORM_LABEL[p]).join(" and ")} only
            </button>
          )}
        </>
      )}
    </form>
  );
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

// Live feedback under a field: a green check when the value looks right, an amber hint otherwise.
function FieldHint({ state, children }: { state: "ok" | "bad" | null; children: React.ReactNode }) {
  if (!state) return null;
  return (
    <span
      className={`flex items-start gap-1 text-xs ${
        state === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
      }`}
    >
      <span aria-hidden>{state === "ok" ? "✓" : "!"}</span>
      <span>{children}</span>
    </span>
  );
}

// The result of checking an account: what was found, or what went wrong and how to fix it.
function CheckResult({ platform, check }: { platform: Platform; check: Check }) {
  const label = PLATFORM_LABEL[platform];
  if (check.status === "checking") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Checking {label}…
      </p>
    );
  }
  if (check.status === "failed") {
    return (
      <div role="alert" className="space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">
        <p className="font-medium">Couldn&apos;t connect {label}</p>
        <p>{check.message}</p>
        {platform === "espn" && (
          <p className="text-xs">ESPN cookies stop working when you log out. Log in again and copy fresh ones.</p>
        )}
      </div>
    );
  }
  const names = check.result.leagues.map((l) => l.name);
  return (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      ✓{" "}
      {names.length
        ? `Found ${names.length} league${names.length === 1 ? "" : "s"}: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`
        : "Connected, but no leagues found for this season."}
    </p>
  );
}

// One platform's fields. On the first-visit screen it starts as a collapsed card whose whole
// surface is the call to action; a single-platform form (Update / Connect) is always open.
function PlatformCard({
  platform,
  hint,
  collapsible,
  open,
  onToggle,
  check,
  children,
}: {
  platform: Platform;
  hint: string;
  collapsible: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  check: Check | undefined;
  children: React.ReactNode;
}) {
  const label = PLATFORM_LABEL[platform];
  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => onToggle(true)}
        aria-expanded={false}
        className="group flex w-full flex-col gap-3 rounded-lg border border-zinc-200 p-4 text-left transition lg:flex-row lg:items-center hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          <span className="block text-sm text-zinc-500">{hint}</span>
        </span>
        <span className="flex shrink-0 items-center justify-center gap-1 rounded-md bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white group-hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:group-hover:bg-zinc-300">
          Connect {label}
          <span aria-hidden className="transition group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </button>
    );
  }
  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">{label}</h2>
        {collapsible && (
          <button
            type="button"
            onClick={() => onToggle(false)}
            aria-expanded
            className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            Cancel
          </button>
        )}
      </div>
      {children}
      {check && <CheckResult platform={platform} check={check} />}
    </section>
  );
}

// ESPN has no sign-in we can embed, so the user copies two cookies. On a computer that's a console
// snippet; phones have no console, so they use a bookmarklet. Touch devices default to the phone steps.
function EspnHelp({ onPaste, status }: { onPaste: (text: string) => void; status: string | null }) {
  const [mode, setMode] = useState<"computer" | "phone">(() =>
    window.matchMedia("(pointer: coarse)").matches ? "phone" : "computer",
  );
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Your device" className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
        {(["computer", "phone"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded px-3 py-1.5 font-medium ${
              mode === m
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {m === "computer" ? "On a computer" : "On a phone"}
          </button>
        ))}
      </div>
      {mode === "computer" ? <QuickConnect onPaste={onPaste} status={status} /> : <PhoneConnect />}
    </div>
  );
}

// A bookmark whose address is code. Set up once, then one tap on fantasy.espn.com brings the
// cookies back here (in the URL fragment, never sent to a server) and the app asks to connect.
function PhoneConnect() {
  const bookmarklet = espnBookmarklet(`${window.location.origin}/`);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the code is still selectable on screen.
    }
  }

  return (
    <div className="space-y-3 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
      <p className="font-medium">Connect from your phone</p>
      <p className="text-zinc-600 dark:text-zinc-400">
        Set up a &ldquo;Connect ESPN&rdquo; bookmark once. After that, connecting is one tap.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
        <li className="space-y-1.5">
          <span>Copy this bookmark code:</span>
          <code className="block max-h-20 overflow-y-auto rounded bg-white p-2 font-mono text-xs break-all text-zinc-800 select-all dark:bg-zinc-950 dark:text-zinc-200">
            {bookmarklet}
          </code>
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {copied ? "Copied" : "Copy bookmark code"}
          </button>
        </li>
        <li>
          <strong>iPhone (Safari):</strong> bookmark any page (Share → Add Bookmark), name it{" "}
          <em>Connect ESPN</em> and save. Then open Bookmarks → Edit, tap <em>Connect ESPN</em>, and replace its
          address with the code you copied.
          <br />
          <strong>Android (Chrome):</strong> bookmark any page, then edit that bookmark the same way.
        </li>
        <li>
          Open{" "}
          <a href="https://fantasy.espn.com" target="_blank" rel="noopener noreferrer" className="underline">
            fantasy.espn.com
          </a>{" "}
          and log in.
        </li>
        <li>
          Tap the address bar, type <em>Connect ESPN</em>, and tap the bookmark in the suggestions. You&apos;ll land back
          here and be asked to connect.
        </li>
      </ol>
      <p className="text-xs text-zinc-500">
        The bookmark reads only your SWID and espn_s2 and sends them straight back to this page, never to a server.
      </p>
    </div>
  );
}

// On a computer, a one-line console snippet copies both cookies so nobody has to dig through DevTools.
function QuickConnect({ onPaste, status }: { onPaste: (text: string) => void; status: string | null }) {
  const [copied, setCopied] = useState(false);
  const found = status?.startsWith("Found");

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(ESPN_CONSOLE_SNIPPET);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the snippet is still selectable on screen.
    }
  }

  return (
    <div className="space-y-3 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
      <p className="font-medium">Quick connect (on a computer)</p>
      <ol className="list-decimal space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
        <li>
          Log in at{" "}
          <a href="https://fantasy.espn.com" target="_blank" rel="noopener noreferrer" className="underline">
            fantasy.espn.com
          </a>{" "}
          and stay on that tab.
        </li>
        <li>
          Open the console: <kbd>Cmd+Option+J</kbd> on a Mac, <kbd>Ctrl+Shift+J</kbd> on Windows. If Chrome asks,
          type <code>allow pasting</code> first.
        </li>
        <li className="space-y-1.5">
          <span>Paste this and press Enter. It only copies your SWID and espn_s2 to your clipboard.</span>
          <code className="block rounded bg-white p-2 font-mono text-xs break-all text-zinc-800 select-all dark:bg-zinc-950 dark:text-zinc-200">
            {ESPN_CONSOLE_SNIPPET}
          </code>
          <button
            type="button"
            onClick={copySnippet}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {copied ? "Copied" : "Copy snippet"}
          </button>
        </li>
        <li className="space-y-1.5">
          <span>Come back here and paste the result:</span>
          <input
            className={`${inputClass} font-mono`}
            type="password"
            placeholder="SWID={…}; espn_s2=…"
            onChange={(e) => onPaste(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Paste the console result"
          />
        </li>
      </ol>
      {status && (
        <p className={found ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
          {status}
        </p>
      )}
      <p className="text-xs text-zinc-500">
        Only paste code into a console when you can see what it does. This line is the whole thing, and the result
        works like your ESPN password: paste it only here.
      </p>
    </div>
  );
}
