"use client";

import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

// Shared shell for the two print routes (Customer Receipt / Tailor Job
// Card). Deliberately lives outside the app/(shell) route group so it never
// gets the sidebar/AppShell — see app/layout.tsx's comment. The screen-only
// toolbar (back link + Print button) is hidden via print:hidden; the page
// itself uses plain white/black print-safe colors rather than the app's
// green-gray design tokens, since this is a physical document, not a screen.
export function PrintPageFrame({
  backHref,
  children,
}: {
  backHref: string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#e5e5e5] print:bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-300 bg-white px-6 py-3 print:hidden">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("print.backToOrders")}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          <Printer className="h-4 w-4" />
          {t("print.print")}
        </button>
      </div>
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-10 text-black shadow print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {children}
      </div>
    </div>
  );
}
