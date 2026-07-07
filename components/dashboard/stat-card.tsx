import type { LucideIcon } from "lucide-react";
import type { DashboardStat } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export function StatCard({
  stat,
  icon: Icon,
}: {
  stat: DashboardStat;
  icon: LucideIcon;
}) {
  const isWarning = stat.tone === "warning";
  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-muted">
          {stat.label}
        </span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            isWarning ? "bg-chip-red" : "bg-primary-tint"
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              isWarning ? "text-chip-red-fg" : "text-primary"
            )}
          />
        </span>
      </div>
      <p
        className={cn(
          "text-[26px] font-semibold",
          isWarning ? "text-chip-red-fg" : "text-ink"
        )}
      >
        {stat.value}
      </p>
      <p className="mt-1 text-[13px] text-ink-faint">{stat.sublabel}</p>
    </div>
  );
}
