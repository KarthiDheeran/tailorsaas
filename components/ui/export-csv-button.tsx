"use client";

import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExportCsvButton({
  onClick,
  disabled = false,
  label = "Export CSV",
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink-muted transition-colors hover:enabled:bg-surface hover:enabled:text-ink disabled:cursor-not-allowed disabled:opacity-50 print:hidden",
        className
      )}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
