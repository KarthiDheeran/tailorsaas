import type { CustomerStatus } from "@/lib/customers";
import { cn } from "@/lib/utils";

const STYLES: Record<CustomerStatus, string> = {
  Active: "bg-chip-mint text-chip-mint-fg",
  "Has Balance": "bg-chip-peach text-chip-peach-fg",
  Inactive: "bg-chip-info text-chip-info-fg",
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
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
