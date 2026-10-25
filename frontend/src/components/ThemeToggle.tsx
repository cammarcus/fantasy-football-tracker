"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { applyTheme, loadTheme, onSystemThemeChange, saveTheme, ThemeChoice } from "@/lib/theme";

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// Rendered only in the browser (see page.tsx), so storage can be read during the first render.
export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => loadTheme());

  // The inline script in layout.tsx sets the theme before paint. In development, React's
  // Strict Mode remount clears attributes on <html>, so apply it again; a no-op in production.
  useLayoutEffect(() => applyTheme(choice), [choice]);

  useEffect(() => {
    if (choice !== "system") return;
    return onSystemThemeChange(() => applyTheme("system"));
  }, [choice]);

  function choose(next: ThemeChoice) {
    saveTheme(next);
    setChoice(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700"
    >
      {CHOICES.map(({ value, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={choice === value}
          onClick={() => choose(value)}
          className={`rounded px-2.5 py-1 font-medium ${
            choice === value
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
