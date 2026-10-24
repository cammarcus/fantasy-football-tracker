import { lineupAlerts, OwnedPlayer, ownedPlayers, startSitMismatches } from "@/lib/insights";
import type { League } from "@/lib/types";
import PlatformBadge from "./PlatformBadge";
import { InjuryTag } from "./RosterTable";

export default function LineupCheck({ leagues }: { leagues: League[] }) {
  const alerts = lineupAlerts(leagues);
  const mismatches = startSitMismatches(ownedPlayers(leagues));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Injured starters</h2>
          <p className="text-sm text-zinc-500">Starters who are out, doubtful or questionable this week.</p>
        </div>
        {alerts.length === 0 ? (
          <AllClear>No injured starters in any league.</AllClear>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {alerts.map(({ league, player, severity }) => (
              <li key={`${league.platform}:${league.league_id}:${player.player_id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${severity === "out" ? "bg-red-500" : "bg-amber-400"}`}
                  aria-label={severity === "out" ? "Likely out" : "At risk"}
                />
                <span className="min-w-0 flex-1 truncate">
                  {player.name}
                  <InjuryTag status={player.injury_status} />
                  <span className="ml-2 text-xs text-zinc-500">
                    {player.slot} · {player.nfl_team}
                  </span>
                </span>
                <LeagueLabel league={league} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Start/sit mismatches</h2>
          <p className="text-sm text-zinc-500">
            Players you start in one league but bench in another. Sometimes that&apos;s on purpose (deeper rosters,
            different scoring), but it&apos;s often a lineup that wasn&apos;t updated.
          </p>
        </div>
        {mismatches.length === 0 ? (
          <AllClear>Your lineups agree everywhere.</AllClear>
        ) : (
          <ul className="space-y-3">
            {mismatches.map((p) => (
              <MismatchRow key={p.key} player={p} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MismatchRow({ player }: { player: OwnedPlayer }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">
        {player.name}
        <InjuryTag status={player.injuryStatus} />
        <span className="ml-2 text-xs font-normal text-zinc-500">
          {player.position} · {player.nflTeam}
        </span>
      </p>
      <ul className="mt-2 space-y-1">
        {player.placements.map(({ league, player: p, started }) => (
          <li key={`${league.platform}:${league.league_id}`} className="flex items-center gap-2 text-sm">
            <span
              className={`w-20 shrink-0 text-xs font-medium ${
                started ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"
              }`}
            >
              {started ? `Starting (${p.slot})` : p.slot === "BE" ? "Bench" : p.slot}
            </span>
            <LeagueLabel league={league} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export function LeagueLabel({ league }: { league: League }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
      <PlatformBadge platform={league.platform} />
      <span className="truncate">{league.name}</span>
    </span>
  );
}

function AllClear({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
      {children}
    </p>
  );
}
