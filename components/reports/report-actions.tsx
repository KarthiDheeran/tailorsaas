"use client";

import { Download, Printer } from "lucide-react";

export function ReportActions({ onExport }: { onExport: () => void }) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={onExport}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <Printer className="h-3.5 w-3.5" />
        Print
      </button>
    </div>
  );
}
