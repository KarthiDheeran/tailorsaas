"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const TABS = [
  { key: "list", labelKey: "staff.staffList" },
  { key: "work-queue", labelKey: "staff.workQueue" },
] as const satisfies { key: string; labelKey: TranslationKey }[];

export type StaffTab = (typeof TABS)[number]["key"];

export function StaffTabs({
  active,
  onChange,
}: {
  active: StaffTab;
  onChange: (tab: StaffTab) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="mb-6 flex items-center gap-1 border-b border-border-soft">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            active === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          )}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  );
}
