"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

export function AccessDenied() {
  const { t } = useLanguage();
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 px-8 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-chip-red">
        <ShieldOff className="h-6 w-6 text-chip-red-fg" />
      </div>
      <h1 className="text-[20px] font-semibold text-ink">{t("access.deniedTitle")}</h1>
      <p className="max-w-sm text-sm text-ink-muted">
        {t("access.deniedMessage")}
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
      >
        {t("access.backToDashboard")}
      </Link>
    </div>
  );
}
