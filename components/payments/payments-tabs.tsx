"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const TABS = [
  { key: "collections", labelKey: "payments.tabCollections" },
  { key: "expenses", labelKey: "payments.tabExpenses" },
] as const satisfies { key: string; labelKey: TranslationKey }[];

export type PaymentsTab = "collections" | "pending-dues" | "adjustments" | "expenses";

export function PaymentsTabs({
  active,
  onChange,
  canViewPayments = true,
  canViewExpenses = false,
}: {
  active: PaymentsTab;
  onChange: (tab: PaymentsTab) => void;
  canViewPayments?: boolean;
  canViewExpenses?: boolean;
}) {
  const { t } = useLanguage();
  const tabs = TABS.filter((tab) =>
    tab.key === "expenses" ? canViewExpenses : canViewPayments
  );

  return (
    <div className="mb-2 flex items-center gap-1 border-b border-border-soft bg-white px-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
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
