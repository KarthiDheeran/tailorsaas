"use client";

import { MonitorCog } from "lucide-react";
import { useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { cn } from "@/lib/utils";
import type { DisplayTheme } from "@/lib/theme";

const OPTIONS: { value: DisplayTheme; label: string; description: string }[] = [
  {
    value: "modern",
    label: "Modern",
    description: "Clean, softer SaaS styling with the TailorSaaS green palette.",
  },
  {
    value: "classic",
    label: "Classic",
    description: "Higher contrast, stronger borders, and clearer table separation.",
  },
  {
    value: "classic-dark",
    label: "Classic Dark",
    description: "Dark high-contrast workspace with strong tables and clearly visible controls.",
  },
];

export function DisplayThemeSetting() {
  const { displayTheme, setDisplayTheme } = useCurrentUser();
  const [savingTheme, setSavingTheme] = useState<DisplayTheme | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function chooseTheme(theme: DisplayTheme) {
    if (theme === displayTheme || savingTheme) return;
    setError(null);
    setSavingTheme(theme);
    const result = await setDisplayTheme(theme);
    setSavingTheme(null);
    if (!result.success) setError(result.error ?? "Could not save theme.");
  }

  return (
    <section className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <MonitorCog className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink">Display Theme</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Choose the contrast level for your own account.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const selected = displayTheme === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border bg-white p-3 transition-colors",
                selected
                  ? "border-primary bg-primary-tint"
                  : "border-border hover:border-border-strong hover:bg-surface-muted"
              )}
            >
              <input
                type="radio"
                name="display-theme"
                value={option.value}
                checked={selected}
                disabled={!!savingTheme}
                onChange={() => void chooseTheme(option.value)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-sm leading-5 text-ink-muted">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
          {error}
        </p>
      )}
    </section>
  );
}
