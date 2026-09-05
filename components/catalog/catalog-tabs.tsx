"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";

const TABS = [
  { key: "garment-types", label: "Garment Types" },
  { key: "fields", label: "Fields" },
  { key: "sections", label: "Sections" },
  { key: "addons", label: "Add-ons / Extras" },
  { key: "work-stages", label: "Work Stages" },
] as const;

export type CatalogTab = (typeof TABS)[number]["key"];

export function CatalogTabs({
  active,
  onChange,
}: {
  active: CatalogTab;
  onChange: (tab: CatalogTab) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border-soft">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition-colors",
            active === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          )}
        >
            {tab.key === "garment-types"
              ? t("catalog.garmentTypes")
              : tab.key === "addons"
                ? t("catalog.addOnsExtras")
                : tab.key === "work-stages"
                  ? t("catalog.workStages")
                  : tab.label}
        </button>
      ))}
    </div>
  );
}
