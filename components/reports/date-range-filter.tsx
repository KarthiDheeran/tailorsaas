"use client";

import { cn } from "@/lib/utils";
import type { DateRange, DateRangePreset } from "@/lib/reports";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const PRESETS: { key: DateRangePreset; labelKey: TranslationKey }[] = [
  { key: "all", labelKey: "reports.allTime" },
  { key: "today", labelKey: "reports.today" },
  { key: "yesterday", labelKey: "reports.yesterday" },
  { key: "thisWeek", labelKey: "reports.thisWeek" },
  { key: "thisMonth", labelKey: "reports.thisMonth" },
  { key: "custom", labelKey: "reports.custom" },
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
  const { t } = useLanguage();
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
          {t(p.labelKey)}
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
          <span className="text-sm text-ink-faint">{t("common.to")}</span>
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
