"use client";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "payments", label: "Payments" },
  { key: "orders", label: "Orders" },
  { key: "customers", label: "Customers" },
] as const;

export type ReportTab = (typeof TABS)[number]["key"];

export function ReportsTabs({
  active,
  onChange,
}: {
  active: ReportTab;
  onChange: (tab: ReportTab) => void;
}) {
  return (
    <div className="mb-6 flex items-center gap-1 border-b border-border-soft print:hidden">
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
