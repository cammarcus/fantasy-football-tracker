import { PLATFORM_LABEL } from "@/lib/format";
import type { Platform } from "@/lib/types";

const STYLES: Record<Platform, string> = {
  espn: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  sleeper: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-900",
};

export default function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[platform]}`}>
      {PLATFORM_LABEL[platform]}
    </span>
  );
}
