// The user's verdict on a flagged lineup call ("I'm aware" or "that's an accident").
// Marks live only in this browser: there are no accounts, and the server stores nothing.
// Each mark is tied to one week's lineup, so losing one costs a click.

import { useSyncExternalStore } from "react";

export type MarkState = "aware" | "accident";

interface Mark {
  state: MarkState;
  at: number;
}

const STORAGE_KEY = "fft-marks";
const MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

let marks: Record<string, Mark> = load();
const listeners = new Set<() => void>();

function load(): Record<string, Mark> {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, Mark>) : {};
    const cutoff = Date.now() - MAX_AGE_MS;
    return Object.fromEntries(Object.entries(parsed).filter(([, m]) => m.at > cutoff));
  } catch {
    return {};
  }
}

export function setMark(key: string, state: MarkState | null): void {
  const next = { ...marks };
  if (state) next[key] = { state, at: Date.now() };
  else delete next[key];
  marks = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the mark lasts for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: Record<string, Mark> = {};

export function useMarks(): Record<string, Mark> {
  return useSyncExternalStore(subscribe, () => marks, () => EMPTY);
}
