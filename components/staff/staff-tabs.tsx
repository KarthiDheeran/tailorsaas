"use client";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "list", label: "Staff List" },
  { key: "work-queue", label: "Work Queue" },
  { key: "payments", label: "Payments" },
] as const;

export type StaffTab = (typeof TABS)[number]["key"];

export function StaffTabs({
  active,
  onChange,
}: {
  active: StaffTab;
  onChange: (tab: StaffTab) => void;
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
