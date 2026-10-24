"use client";

import { useState } from "react";
import type { Credentials } from "@/lib/credentials";
import { BENCH_SLOTS, myMatchup, myTeam, points, record, standings } from "@/lib/format";
import type { League } from "@/lib/types";
import PlatformBadge from "./PlatformBadge";
import RosterTable from "./RosterTable";
import WaiverWire from "./WaiverWire";

const TABS = ["My team", "Standings", "Waiver wire"] as const;
type Tab = (typeof TABS)[number];

export default function LeagueDetail({
  league,
  leagues,
  creds,
  onBack,
}: {
  league: League;
  leagues: League[];
  creds: Credentials;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("My team");
  const me = myTeam(league);
  const matchup = myMatchup(league);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← All leagues
      </button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{league.name}</h1>
          <PlatformBadge platform={league.platform} />
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {league.season} season · Week {league.current_week} · {league.teams.length} teams
        </p>
      </div>

      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              t === tab
                ? "border-zinc-900 dark:border-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "My team" &&
        (me ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-lg font-medium">{me.name}</p>
                <p className="text-sm text-zinc-500">
                  {record(me)} · {points(me.points_for)} PF · {points(me.points_against)} PA
                </p>
              </div>
              {matchup && (
                <div className="text-right text-sm">
                  <p className="text-xs text-zinc-500">Week {matchup.matchup.week}</p>
                  <p className="tabular-nums">
                    <span className="font-semibold">{points(matchup.myScore)}</span>
                    <span className="text-zinc-500"> – {points(matchup.opponentScore)}</span>
                  </p>
                  <p className="text-xs text-zinc-500">vs {matchup.opponent?.name ?? "BYE"}</p>
                </div>
              )}
            </div>
            <RosterTable title="Starters" players={me.roster.filter((p) => !BENCH_SLOTS.has(p.slot))} />
            <RosterTable title="Bench" players={me.roster.filter((p) => BENCH_SLOTS.has(p.slot))} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Your team wasn&apos;t found in this league.</p>
        ))}

      {tab === "Standings" && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Record</th>
                <th className="px-3 py-2 text-right font-medium">PF</th>
                <th className="px-3 py-2 text-right font-medium">PA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {standings(league).map((t, i) => (
                <tr
                  key={t.team_id}
                  className={t.team_id === league.my_team_id ? "bg-amber-50 dark:bg-amber-950/40" : undefined}
                >
                  <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-zinc-500">{t.owner}</p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{record(t)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{points(t.points_for)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{points(t.points_against)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Waiver wire" && <WaiverWire league={league} leagues={leagues} creds={creds} />}
    </div>
  );
}
