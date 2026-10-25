"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchNflWeek, fetchRankings } from "@/lib/api";
import { buildNflIndex, NflIndex } from "@/lib/nfl";
import { buildRankingsIndex, RankingsIndex } from "@/lib/rankings";
import type { NflWeek, RankingsWeek } from "@/lib/types";

interface NflState {
  nfl: NflIndex | null;
  error: string | null;
  rankings: RankingsIndex | null;
  rankingsError: string | null;
  refreshing: boolean;
  refreshInjuries: () => void;
}

const NflContext = createContext<NflState>({
  nfl: null,
  error: null,
  rankings: null,
  rankingsError: null,
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
  const [rankings, setRankings] = useState<RankingsWeek | null>(null);
  const [rankingsError, setRankingsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNflWeek()
      .then((w) => !cancelled && setWeek(w))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Expert rankings are for the same week as the schedule, so they wait for it.
  const season = week?.season;
  const weekNumber = week?.week;
  useEffect(() => {
    if (season === undefined || weekNumber === undefined) return;
    let cancelled = false;
    fetchRankings(season, weekNumber)
      .then((r) => !cancelled && setRankings(r))
      .catch((e: Error) => !cancelled && setRankingsError(e.message));
    return () => {
      cancelled = true;
    };
  }, [season, weekNumber]);

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
    () => ({
      nfl: week ? buildNflIndex(week) : null,
      error,
      rankings: rankings ? buildRankingsIndex(rankings) : null,
      rankingsError,
      refreshing,
      refreshInjuries,
    }),
    [week, error, rankings, rankingsError, refreshing, refreshInjuries],
  );

  return <NflContext.Provider value={value}>{children}</NflContext.Provider>;
}
