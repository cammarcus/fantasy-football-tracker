"use client";

import { gameLine } from "@/lib/nfl";
import { useNfl } from "./NflContext";

// This week's game for an NFL team: "Sun 1:00 PM @ DEN", "Live · Q2 5:32 vs KC", "W 30-24 vs NE" or "BYE".
export default function GameLine({ team }: { team: string }) {
  const { nfl } = useNfl();
  const line = gameLine(team, nfl);
  if (!line) return null;
  const bye = line === "BYE";
  const live = line.startsWith("Live");
  return (
    <span
      className={`block text-[11px] ${
        bye
          ? "font-semibold text-red-700 dark:text-red-400"
          : live
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-zinc-400"
      }`}
    >
      {line}
    </span>
  );
}
