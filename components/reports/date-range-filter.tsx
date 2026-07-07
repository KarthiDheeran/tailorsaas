"use client";

import { cn } from "@/lib/utils";
import type { DateRange, DateRangePreset } from "@/lib/reports";

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "custom", label: "Custom" },
];

export function DateRangeFilter({
  preset,
  custom,
  onPresetChange,
  onCustomChange,
}: {
  preset: DateRangePreset;
  custom: DateRange;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomChange: (range: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPresetChange(p.key)}
          className={cn(
            "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
            preset === p.key
              ? "border-primary bg-primary-tint text-primary"
              : "border-border bg-white text-ink-muted hover:bg-surface"
          )}
        >
          {p.label}
        </button>
      ))}
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={custom.from}
            onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
            className="h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
          <span className="text-sm text-ink-faint">to</span>
          <input
            type="date"
            value={custom.to}
            onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
            className="h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </div>
      )}
    </div>
  );
}
