"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchNflWeek } from "@/lib/api";
import { buildNflIndex, NflIndex } from "@/lib/nfl";
import type { NflWeek } from "@/lib/types";

interface NflState {
  nfl: NflIndex | null;
  error: string | null;
  refreshing: boolean;
  refreshInjuries: () => void;
}

const NflContext = createContext<NflState>({
  nfl: null,
  error: null,
  refreshing: false,
  refreshInjuries: () => {},
});

export function useNfl(): NflState {
  return useContext(NflContext);
}

// Schedule, byes and injuries are the same for everyone, so they load independently of
// the user's leagues. If they fail, the rest of the app still works without them.
export function NflProvider({ children }: { children: React.ReactNode }) {
  const [week, setWeek] = useState<NflWeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchNflWeek()
      .then((w) => !cancelled && setWeek(w))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshInjuries = useCallback(() => {
    setRefreshing(true);
    fetchNflWeek(true)
      .then((w) => {
        setWeek(w);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setRefreshing(false));
  }, []);

  const value = useMemo(
    () => ({ nfl: week ? buildNflIndex(week) : null, error, refreshing, refreshInjuries }),
    [week, error, refreshing, refreshInjuries],
  );

  return <NflContext.Provider value={value}>{children}</NflContext.Provider>;
}
