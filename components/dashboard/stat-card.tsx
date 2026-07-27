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
      <div className={cn("flex items-center justify-between", compact ? "mb-2.5" : "mb-3.5")}>
        <span className={cn("text-[13px] font-medium", emphasized ? "text-slate-300" : "text-ink-muted")}>
          {stat.label}
        </span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            emphasized ? "bg-white/10" : isWarning ? "bg-chip-red" : "bg-primary-tint"
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              emphasized ? "text-amber-300" : isWarning ? "text-chip-red-fg" : "text-primary"
            )}
          />
        </span>
      </div>
      <p
        className={cn(
          "font-semibold",
          compact ? "text-[24px]" : "text-[30px]",
          emphasized ? "text-white" : isWarning ? "text-chip-red-fg" : "text-ink"
        )}
      >
        {stat.value}
      </p>
      <p className={cn("mt-1.5 text-[13px]", emphasized ? "text-slate-400" : "text-ink-faint")}>{stat.sublabel}</p>
    </>
  );

  const className = cn(
    "block rounded-2xl border shadow-[0_10px_24px_rgba(17,24,39,0.06)] transition duration-200",
    compact ? "p-4" : "p-5",
    emphasized ? "border-slate-800 bg-slate-900" : "border-white/80 bg-white/90",
    href && (emphasized
      ? "cursor-pointer hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-[0_14px_28px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      : "cursor-pointer hover:-translate-y-0.5 hover:border-primary/35 hover:bg-white hover:shadow-[0_14px_28px_rgba(15,23,42,0.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2")
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={`${stat.label}: ${stat.value}. ${stat.sublabel}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className}>{content}</div>
  );
}
