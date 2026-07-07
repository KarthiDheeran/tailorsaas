import type { StaffStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<StaffStatus, string> = {
  Active: "bg-chip-mint text-chip-mint-fg",
  "On Leave": "bg-chip-peach text-chip-peach-fg",
  Inactive: "bg-chip-info text-chip-info-fg",
};

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-3 py-1 text-xs font-semibold",
        STYLES[status]
      )}
    >
      {status}
    </span>
  );
}
