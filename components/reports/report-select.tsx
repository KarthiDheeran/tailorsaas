"use client";

import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReportSelectShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 print:hidden", className)}>
      {children}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
    </div>
  );
}

export function reportSelectClassName(extra?: string): string {
  return cn(
    "h-9 w-full appearance-none rounded-lg border border-border bg-white py-0 pl-3 pr-10 text-sm leading-9 text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint",
    extra
  );
}
