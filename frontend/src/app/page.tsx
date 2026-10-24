"use client";

import { useSyncExternalStore } from "react";
import Dashboard from "@/components/Dashboard";

const subscribe = () => () => {};

export default function Home() {
  // False during server rendering, true in the browser. Credentials live in browser
  // storage, so the dashboard only renders once it can read them.
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{inBrowser ? <Dashboard /> : null}</main>
  );
}
