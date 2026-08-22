"use client";

import { Type } from "lucide-react";
import { useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import type { AppTextSize } from "@/lib/theme";

const OPTIONS: { value: AppTextSize; label: string; description: string }[] = [
  {
    value: "default",
    label: "Default",
    description: "Current TailorSaaS size.",
  },
  {
    value: "17",
    label: "17px",
    description: "Slightly larger.",
  },
  {
    value: "18",
    label: "18px",
    description: "Recommended for desktop counter use.",
  },
  {
    value: "19",
    label: "19px",
    description: "Large, easier to read.",
  },
  {
    value: "20",
    label: "20px",
    description: "Extra large for distant screens.",
  },
];

export function AppTextSizeSetting() {
  const { appTextSize, setAppTextSize } = useCurrentUser();
  const [savingTextSize, setSavingTextSize] = useState<AppTextSize | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function chooseTextSize(textSize: AppTextSize) {
    if (textSize === appTextSize || savingTextSize) return;
    setError(null);
    setSavingTextSize(textSize);
    const result = await setAppTextSize(textSize);
    setSavingTextSize(null);
    if (!result.success) setError(result.error ?? "Could not save text size.");
  }

  return (
    <section className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <Type className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink">App Text Size</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Increase screen text for easier desktop order entry. Print sizes stay unchanged.
          </p>
        </div>
      </div>

      <label className="block max-w-sm">
        <span className="mb-1.5 block text-sm font-semibold text-ink-muted">
          Text size
        </span>
        <select
          value={appTextSize}
          disabled={!!savingTextSize}
          onChange={(event) => void chooseTextSize(event.target.value as AppTextSize)}
          className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.description}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
          {error}
        </p>
      )}
    </section>
  );
}
