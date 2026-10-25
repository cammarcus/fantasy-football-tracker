"use client";

import { useState } from "react";
import { Credentials, hasEspn, hasSleeper } from "@/lib/credentials";

interface Props {
  initial: Credentials | null;
  onConnect: (creds: Credentials, remember: boolean) => void;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none sm:text-sm focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500 dark:focus:ring-zinc-800";

export default function ConnectForm({ initial, onConnect }: Props) {
  const [creds, setCreds] = useState<Credentials>(
    initial ?? { sleeperUsername: "", espnSwid: "", espnS2: "" },
  );
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const espnPartial = Boolean(creds.espnSwid.trim()) !== Boolean(creds.espnS2.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (espnPartial) {
      setError("ESPN needs both SWID and espn_s2.");
      return;
    }
    if (!hasEspn(creds) && !hasSleeper(creds)) {
      setError("Add at least one account.");
      return;
    }
    setError(null);
    onConnect(creds, remember);
  }

  const set = (key: keyof Credentials) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCreds({ ...creds, [key]: e.target.value });

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect your leagues</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Add one or both accounts. Your credentials stay in this browser and are only sent to load your leagues.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium">Sleeper</h2>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Username</span>
          <input
            className={inputClass}
            value={creds.sleeperUsername}
            onChange={set("sleeperUsername")}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium">ESPN</h2>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">SWID</span>
          <input
            className={`${inputClass} font-mono`}
            value={creds.espnSwid}
            onChange={set("espnSwid")}
            placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">espn_s2</span>
          <input
            className={`${inputClass} font-mono`}
            type="password"
            value={creds.espnS2}
            onChange={set("espnS2")}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <details className="text-sm text-zinc-600 dark:text-zinc-400">
          <summary className="cursor-pointer select-none">Where do I find these?</summary>
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
      </section>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Load my leagues
      </button>
    </form>
  );
}
