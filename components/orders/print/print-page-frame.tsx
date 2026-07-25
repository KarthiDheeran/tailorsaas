"use client";

import Link from "next/link";
import { ChevronLeft, Printer, X } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

// Shared shell for the two print routes (Customer Receipt / Tailor Job
// Card). Deliberately lives outside the app/(shell) route group so it never
// gets the sidebar/AppShell — see app/layout.tsx's comment. The screen-only
// toolbar (back link + Print button) is hidden via print:hidden; the page
// itself uses plain white/black print-safe colors rather than the app's
// green-gray design tokens, since this is a physical document, not a screen.
export function PrintPageFrame({
  backHref,
  backLabel,
  showClose = false,
  contentClassName,
  children,
}: {
  backHref?: string;
  backLabel?: string;
  showClose?: boolean;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#e5e5e5] print:bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-300 bg-white px-6 py-3 print:hidden">
        <div>
          {backHref && (
            <Link
              href={backHref}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="h-4 w-4" />
              {backLabel ?? t("print.backToOrders")}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showClose && (
            <button
              type="button"
              onClick={() => window.close()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            <Printer className="h-4 w-4" />
            {t("print.print")}
          </button>
        </div>
      </div>
      <div
        className={cn(
          "mx-auto my-6 max-w-[210mm] bg-white p-10 text-black shadow print:my-0 print:max-w-none print:p-0 print:shadow-none",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
