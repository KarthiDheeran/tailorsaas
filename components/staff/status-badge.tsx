"use client";

import type { StaffStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";

const STYLES: Record<StaffStatus, string> = {
  Active: "bg-chip-mint text-chip-mint-fg",
  "On Leave": "bg-chip-peach text-chip-peach-fg",
  Inactive: "bg-chip-info text-chip-info-fg",
};

// "On Leave" has no matching translation key yet — rendered as-is in both
// languages until one is added.
const STATUS_LABELS: Record<StaffStatus, string | null> = {
  Active: "common.active",
  "On Leave": null,
  Inactive: "common.inactive",
};

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  const { t } = useLanguage();
  const key = STATUS_LABELS[status];
  return (
    <span
      className={cn(
        "inline-block rounded-full px-3 py-1 text-xs font-semibold",
        STYLES[status]
      )}
    >
      {key ? t(key as Parameters<typeof t>[0]) : status}
    </span>
  );
}
