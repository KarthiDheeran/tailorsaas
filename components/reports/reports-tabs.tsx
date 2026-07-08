"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const TABS = [
  { key: "sales", labelKey: "reports.sales" },
  { key: "payments", labelKey: "reports.payments" },
  { key: "orders", labelKey: "reports.orders" },
  { key: "customers", labelKey: "reports.customers" },
] as const satisfies { key: string; labelKey: TranslationKey }[];

export type ReportTab = (typeof TABS)[number]["key"];

export function ReportsTabs({
  active,
  onChange,
  visibleTabs,
}: {
  active: ReportTab;
  onChange: (tab: ReportTab) => void;
  // Restricts which tabs render — used to hide the purely financial Sales
  // and Payments tabs from anyone without orders.viewPayments. Defaults to
  // all four so existing callers don't need to change.
  visibleTabs?: ReportTab[];
}) {
  const { t } = useLanguage();
  const tabs = visibleTabs
    ? TABS.filter((tabItem) => visibleTabs.includes(tabItem.key))
    : TABS;
  return (
    <div className="mb-6 flex items-center gap-1 border-b border-border-soft print:hidden">
      {tabs.map((tabItem) => (
        <button
          key={tabItem.key}
          type="button"
          onClick={() => onChange(tabItem.key)}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            active === tabItem.key
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          )}
        >
          {t(tabItem.labelKey)}
        </button>
      ))}
    </div>
  );
}
