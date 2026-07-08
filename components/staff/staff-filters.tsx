"use client";

import { Search } from "lucide-react";
import type { StaffRole, StaffStatus } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";

export interface StaffFilterState {
  nameQuery: string;
  role: StaffRole | "";
  status: StaffStatus | "";
}

const ROLES: StaffRole[] = [
  "Master Tailor",
  "Cutter",
  "Stitching Staff",
  "Embroidery Staff",
  "Finishing Staff",
  "Alteration Staff",
  "Delivery Staff",
  "Manager",
  "Owner/Admin",
];

const STATUSES: StaffStatus[] = ["Active", "Inactive", "On Leave"];

export function StaffFilters({
  filters,
  onChange,
}: {
  filters: StaffFilterState;
  onChange: (next: StaffFilterState) => void;
}) {
  const { t } = useLanguage();
  function set<K extends keyof StaffFilterState>(key: K, value: StaffFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={filters.nameQuery}
          onChange={(e) => set("nameQuery", e.target.value)}
          placeholder={t("staff.searchByName")}
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
      </div>
      <select
        value={filters.role}
        onChange={(e) => set("role", e.target.value as StaffRole | "")}
        className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
      >
        <option value="">{t("staff.allRoles")}</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(e) => set("status", e.target.value as StaffStatus | "")}
        className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
      >
        <option value="">{t("staff.allStatuses")}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
