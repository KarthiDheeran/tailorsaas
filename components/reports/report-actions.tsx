"use client";

import { Download, Printer } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

export function ReportActions({ onExport }: { onExport: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={onExport}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Download className="h-3.5 w-3.5" />
        {t("reports.exportCsv")}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Printer className="h-3.5 w-3.5" />
        {t("common.print")}
      </button>
    </div>
  );
}
