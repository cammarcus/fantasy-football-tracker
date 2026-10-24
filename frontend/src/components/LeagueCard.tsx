import { myMatchup, myTeam, points, record, standings } from "@/lib/format";
import type { League } from "@/lib/types";
import PlatformBadge from "./PlatformBadge";

export default function LeagueCard({ league, onOpen }: { league: League; onOpen: () => void }) {
  const me = myTeam(league);
  const matchup = myMatchup(league);
  const rank = me ? standings(league).findIndex((t) => t.team_id === me.team_id) + 1 : null;

  return (
    <button
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-lg border border-zinc-200 p-4 text-left transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{league.name}</h2>
          <p className="text-xs text-zinc-500">
            {league.teams.length} teams · Week {league.current_week}
          </p>
        </div>
        <PlatformBadge platform={league.platform} />
      </div>

      {me ? (
        <>
          <div>
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {record(me)}
              {rank ? ` · ${ordinal(rank)} of ${league.teams.length}` : ""} · {points(me.points_for)} PF
            </p>
          </div>
          {matchup && (
            <div className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
              <span className="font-medium tabular-nums">{points(matchup.myScore)}</span>
              <span className="truncate px-2 text-zinc-500">
                vs {matchup.opponent ? matchup.opponent.name : "BYE"}
              </span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{points(matchup.opponentScore)}</span>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-500">Your team wasn&apos;t found in this league.</p>
      )}
    </button>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
