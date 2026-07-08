"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const TABS = [
  { key: "users", labelKey: "usersAccess.users" },
  { key: "roles", labelKey: "usersAccess.roles" },
] as const satisfies { key: string; labelKey: TranslationKey }[];

export type UsersAccessTab = (typeof TABS)[number]["key"];

export function UsersAccessTabs({
  active,
  onChange,
}: {
  active: UsersAccessTab;
  onChange: (tab: UsersAccessTab) => void;
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
