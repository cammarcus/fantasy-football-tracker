"use client";

import { useSyncExternalStore } from "react";
import Dashboard from "@/components/Dashboard";
import { NflProvider } from "@/components/NflContext";
import ThemeToggle from "@/components/ThemeToggle";

const subscribe = () => () => {};

export default function Home() {
  // False during server rendering, true in the browser. Credentials live in browser
  // storage, so the dashboard only renders once it can read them.
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      {inBrowser ? (
        <NflProvider>
          <div className="mb-4 flex justify-end">
            <ThemeToggle />
          </div>
          <Dashboard />
        </NflProvider>
      ) : null}
    </main>
  );
}
