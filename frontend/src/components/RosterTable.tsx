import { injuryLabel } from "@/lib/format";
import type { Player } from "@/lib/types";

export default function RosterTable({ title, players }: { title: string; players: Player[] }) {
  if (players.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-zinc-500">{title}</h3>
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {players.map((p) => (
          <li key={p.player_id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-16 shrink-0 text-xs font-medium text-zinc-500">{p.slot}</span>
            <span className="min-w-0 flex-1 truncate">
              {p.name}
              <InjuryTag status={p.injury_status} />
            </span>
            <span className="shrink-0 text-xs text-zinc-500">
              {p.position} · {p.nfl_team}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InjuryTag({ status }: { status: string | null }) {
  const label = injuryLabel(status);
  if (!label) return null;
  return (
    <span
      title={status ?? undefined}
      className="ml-2 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      {label}
    </span>
  );
}
