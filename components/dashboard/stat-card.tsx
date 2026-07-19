import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { DashboardStat } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export function StatCard({
  stat,
  icon: Icon,
  href,
  compact = false,
  emphasized = false,
}: {
  stat: DashboardStat;
  icon: LucideIcon;
  href?: string;
  compact?: boolean;
  emphasized?: boolean;
}) {
  const isWarning = stat.tone === "warning";
  const content = (
    <>
      <div className={cn("flex items-center justify-between", compact ? "mb-2" : "mb-3")}>
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
          "font-semibold",
          compact ? "text-[22px]" : "text-[26px]",
          isWarning ? "text-chip-red-fg" : "text-ink"
        )}
      >
        {stat.value}
      </p>
      <p className="mt-1 text-[13px] text-ink-faint">{stat.sublabel}</p>
    </>
  );

  const className = cn(
    "block rounded-xl border bg-white shadow-soft transition-colors",
    compact ? "p-4" : "p-5",
    emphasized ? "border-chip-red/50" : "border-border-soft",
    href && "hover:border-primary/35 hover:bg-surface"
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className}>{content}</div>
  );
}
