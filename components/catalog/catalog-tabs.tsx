"use client";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "garment-types", label: "Garment Types" },
  { key: "addons", label: "Add-ons / Extras" },
] as const;

export type CatalogTab = (typeof TABS)[number]["key"];

export function CatalogTabs({
  active,
  onChange,
}: {
  active: CatalogTab;
  onChange: (tab: CatalogTab) => void;
}) {
  return (
    <div className="mb-6 flex items-center gap-1 border-b border-border-soft">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            active === t.key
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
