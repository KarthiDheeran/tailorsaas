"use client";

import type { CustomerStatus } from "@/lib/customers-db";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const STYLES: Record<CustomerStatus, string> = {
  Active: "bg-chip-mint text-chip-mint-fg",
  "Has Balance": "bg-chip-peach text-chip-peach-fg",
  Inactive: "bg-chip-info text-chip-info-fg",
};

const STATUS_LABEL_KEYS: Record<CustomerStatus, TranslationKey> = {
  Active: "common.active",
  "Has Balance": "customers.hasBalance",
  Inactive: "customers.inactive",
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "inline-block rounded-full px-3 py-1 text-xs font-semibold",
        STYLES[status]
      )}
    >
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}
