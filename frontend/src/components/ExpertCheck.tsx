"use client";

import { leagueUrl, PLATFORM_LABEL } from "@/lib/format";
import { ExpertDisagreement, expertDisagreements, ExpertPickup, expertPickups } from "@/lib/insights";
import { MarkState, setMark, useMarks } from "@/lib/marks";
import { averageRank, RankingsIndex } from "@/lib/rankings";
import type { League, PlayerRanking } from "@/lib/types";
import { LeagueLabel } from "./LineupCheck";
import { useNfl } from "./NflContext";

export default function ExpertCheck({ leagues }: { leagues: League[] }) {
  const { nfl, rankings, rankingsError } = useNfl();
  const marks = useMarks();
  const flags = expertDisagreements(leagues, nfl, rankings);
  const open = flags.filter((f) => marks[f.key]?.state !== "aware");
  const intentional = flags.filter((f) => marks[f.key]?.state === "aware");
  const pickups = expertPickups(leagues, nfl, rankings);
  const pickupsOpen = pickups.filter((f) => marks[f.key]?.state !== "aware");
  const pickupsDismissed = pickups.filter((f) => marks[f.key]?.state === "aware");

  return (
    <section id="experts" className="scroll-mt-16 space-y-3">
      <div>
        <h2 className="font-semibold">Experts disagree</h2>
        <p className="text-sm text-zinc-500">
          Benched players that most ESPN analysts rank ahead of one of your starters at the same position.
          {rankings && <> Week {rankings.week.week} ranks from {rankings.week.analysts.length} analysts.</>}
        </p>
      </div>
      {rankingsError && <p className="text-sm text-amber-700 dark:text-amber-400">{rankingsError}</p>}
      {rankings && rankings.week.players.length === 0 ? (
        <p className="text-sm text-zinc-500">ESPN hasn&apos;t published week {rankings.week.week} rankings yet.</p>
      ) : (
        rankings &&
        (open.length === 0 ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {intentional.length ? "Nothing new: you've reviewed every flag." : "Your lineups line up with the experts."}
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((f) => (
              <FlagRow key={f.key} flag={f} rankings={rankings} state={marks[f.key]?.state} />
            ))}
          </ul>
        ))
      )}
      {intentional.length > 0 && rankings && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">Marked as intentional ({intentional.length})</summary>
          <ul className="mt-2 space-y-3">
            {intentional.map((f) => (
              <FlagRow key={f.key} flag={f} rankings={rankings} state="aware" />
            ))}
          </ul>
        </details>
      )}

      {rankings && rankings.week.players.length > 0 && (
        <div id="pickups" className="scroll-mt-16 space-y-3 pt-2">
          <div>
            <h3 className="font-medium">Free agents the experts would start</h3>
            <p className="text-sm text-zinc-500">
              Players nobody in your league has rostered that most analysts rank ahead of one of your starters. They
              may be on waivers (claim needed) rather than free to add.
            </p>
          </div>
          {pickupsOpen.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
              {pickupsDismissed.length
                ? "Nothing new on the wire: you've reviewed every suggestion."
                : "No free agent beats your starters this week."}
            </p>
          ) : (
            <ul className="space-y-3">
              {pickupsOpen.map((f) => (
                <PickupRow key={f.key} pickup={f} rankings={rankings} state={marks[f.key]?.state} />
              ))}
            </ul>
          )}
          {pickupsDismissed.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500">Not interested ({pickupsDismissed.length})</summary>
              <ul className="mt-2 space-y-3">
                {pickupsDismissed.map((f) => (
                  <PickupRow key={f.key} pickup={f} rankings={rankings} state="aware" />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

// "aware" means not interested; "accident" means the user plans to add the player.
function PickupRow({
  pickup,
  rankings,
  state,
}: {
  pickup: ExpertPickup;
  rankings: RankingsIndex;
  state: MarkState | undefined;
}) {
  const { league, starter, starterRanking, available, agree, total } = pickup;
  const border =
    state === "accident"
      ? "border-emerald-300 dark:border-emerald-900"
      : state === "aware"
        ? "border-zinc-200 opacity-70 dark:border-zinc-800"
        : "border-sky-200 dark:border-sky-900";

  return (
    <li className={`space-y-2 rounded-lg border p-3 text-sm ${border}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p>
            <span className="font-medium">{available.name}</span>
            <span className="ml-1 text-xs text-zinc-500">
              ({available.position} · {available.nfl_team})
            </span>
            <span className="text-zinc-500"> is available, ranked over your </span>
            <span className="font-medium">{starter.name}</span>
            <span className="ml-1 text-xs text-zinc-500">({starter.slot})</span>
          </p>
          <p className="text-xs text-zinc-500">
            {agree} of {total} analysts rank {available.name} higher · avg {available.position} rank{" "}
            {averageRank(available).toFixed(1)} vs {averageRank(starterRanking).toFixed(1)}
          </p>
        </div>
        <LeagueLabel league={league} />
      </div>

      <RanksTable
        rankings={rankings}
        a={{ name: available.name, ranking: available }}
        b={{ name: starter.name, ranking: starterRanking }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {state === undefined && (
          <>
            <MarkButton onClick={() => setMark(pickup.key, "aware")}>Not interested</MarkButton>
            <MarkButton onClick={() => setMark(pickup.key, "accident")}>Planning to add</MarkButton>
          </>
        )}
        {state === "accident" && (
          <a
            href={leagueUrl(league)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800"
          >
            Open {league.name} in {PLATFORM_LABEL[league.platform]} ↗
          </a>
        )}
        {state !== undefined && <MarkButton onClick={() => setMark(pickup.key, null)}>Undo</MarkButton>}
      </div>
    </li>
  );
}

// Each analyst's rank for two players, the better one in bold.
function RanksTable({
  rankings,
  a,
  b,
}: {
  rankings: RankingsIndex;
  a: { name: string; ranking: PlayerRanking };
  b: { name: string; ranking: PlayerRanking };
}) {
  const analysts = rankings.week.analysts.filter(
    (x) => a.ranking.ranks[x.id] !== undefined && b.ranking.ranks[x.id] !== undefined,
  );
  return (
    <details>
      <summary className="cursor-pointer text-xs text-zinc-500">Each analyst&apos;s ranks</summary>
      <div className="overflow-x-auto">
        <table className="mt-1 text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="pr-4 text-left font-medium">Analyst</th>
              <th className="pr-4 text-right font-medium">{a.name}</th>
              <th className="text-right font-medium">{b.name}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {analysts.map((x) => {
              const ra = a.ranking.ranks[x.id];
              const rb = b.ranking.ranks[x.id];
              return (
                <tr key={x.id}>
                  <td className="pr-4">{x.name}</td>
                  <td className={`pr-4 text-right ${ra < rb ? "font-semibold" : ""}`}>{ra}</td>
                  <td className={`text-right ${rb < ra ? "font-semibold" : ""}`}>{rb}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function FlagRow({
  flag,
  rankings,
  state,
}: {
  flag: ExpertDisagreement;
  rankings: RankingsIndex;
  state: MarkState | undefined;
}) {
  const { league, benched, starter, benchedRanking, starterRanking, agree, total } = flag;
  const border =
    state === "accident"
      ? "border-red-300 dark:border-red-900"
      : state === "aware"
        ? "border-zinc-200 opacity-70 dark:border-zinc-800"
        : "border-amber-200 dark:border-amber-900";
  return (
    <li className={`space-y-2 rounded-lg border p-3 text-sm ${border}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p>
            <span className="font-medium">{benched.name}</span>
            <span className="text-zinc-500"> on your bench over </span>
            <span className="font-medium">{starter.name}</span>
            <span className="ml-1 text-xs text-zinc-500">({starter.slot})</span>
          </p>
          <p className="text-xs text-zinc-500">
            {agree} of {total} analysts rank {benched.name} higher · avg {benched.position} rank{" "}
            {averageRank(benchedRanking).toFixed(1)} vs {averageRank(starterRanking).toFixed(1)}
          </p>
        </div>
        <LeagueLabel league={league} />
      </div>

      <RanksTable
        rankings={rankings}
        a={{ name: benched.name, ranking: benchedRanking }}
        b={{ name: starter.name, ranking: starterRanking }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {state === undefined && (
          <>
            <MarkButton onClick={() => setMark(flag.key, "aware")}>I&apos;m aware, I like this pick</MarkButton>
            <MarkButton onClick={() => setMark(flag.key, "accident")}>That&apos;s an accident</MarkButton>
          </>
        )}
        {state === "accident" && (
          <>
            <a
              href={leagueUrl(league)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Fix it in {PLATFORM_LABEL[league.platform]} ↗
            </a>
            <span className="text-xs text-zinc-500">This clears once your lineup changes.</span>
          </>
        )}
        {state !== undefined && <MarkButton onClick={() => setMark(flag.key, null)}>Undo</MarkButton>}
      </div>
    </li>
  );
}

function MarkButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-zinc-300 px-3 py-2 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
    />
  );
}
