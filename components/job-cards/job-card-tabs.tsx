"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type JobCardTab = "cards" | "tally" | "production-print";

const tabs: { label: string; href: string; value: JobCardTab }[] = [
  { label: "Tally Scans", href: "/job-cards/tally", value: "tally" },
  { label: "Job Cards", href: "/job-cards", value: "cards" },
  { label: "Production Print", href: "/job-cards/production-print", value: "production-print" },
];

export function JobCardTabs({ active }: { active: JobCardTab }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border-soft" aria-label="Job card sections">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          className={cn(
            "relative -mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
            active === tab.value
              ? "border-b-2 border-primary text-primary"
              : "text-ink-muted hover:bg-surface-muted hover:text-ink"
          )}
          aria-current={active === tab.value ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
