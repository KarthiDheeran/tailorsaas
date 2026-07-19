"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  Languages,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Package,
  Settings,
  Shirt,
  Truck,
  Users,
  Users2,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { GlobalSearchButton } from "@/components/layout/global-search";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Permission } from "@/lib/permissions";

const navItems: {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  permission?: Permission;
  anyOf?: Permission[];
  activePrefixes?: string[];
}[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, permission: "calendar.view" },
  { href: "/communications", labelKey: "nav.communications", icon: MessageCircle, anyOf: ["calendar.view", "orders.view", "customers.view"] },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList, permission: "orders.view" },
  { href: "/job-cards", labelKey: "nav.jobCards", icon: FileText, anyOf: ["orders.view", "staff.view"] },
  { href: "/production", labelKey: "nav.production", icon: Workflow, anyOf: ["orders.view", "staff.view"] },
  { href: "/delivery", labelKey: "nav.delivery", icon: Truck, permission: "orders.view" },
  { href: "/customers", labelKey: "nav.customers", icon: Users, permission: "customers.view" },
  { href: "/payments", labelKey: "nav.payments", icon: Wallet, anyOf: ["orders.viewPayments", "expenses.view"] },
  { href: "/inventory", labelKey: "nav.inventory", icon: Package, permission: "inventory.view" },
  { href: "/staff", labelKey: "nav.staff", icon: Users2, permission: "staff.view" },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3, permission: "reports.view" },
  {
    href: "/settings",
    labelKey: "nav.settings",
    icon: Settings,
    permission: "settings.view",
    activePrefixes: ["/settings", "/catalog", "/users-access"],
  },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2 px-2">
      <Shirt className="h-6 w-6 shrink-0 text-primary" />
      <div>
        <div className="text-[18px] font-bold leading-tight tracking-tight text-ink">
          TailorSaaS
        </div>
        <div className="text-[11px] leading-tight text-ink-faint">
          Tailoring. Simplified.
        </div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { hasPermission, hasAnyPermission } = useCurrentUser();
  const { t } = useLanguage();

  const visibleNavItems = navItems.filter((item) => {
    if (item.permission) return hasPermission(item.permission);
    if (item.anyOf) return hasAnyPermission(item.anyOf);
    return true;
  });

  return (
    <>
      {visibleNavItems.map(({ href, labelKey, icon: Icon, activePrefixes }) => {
        const isActive =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          activePrefixes?.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
          );
        const label =
          href === "/staff" && hasPermission("staff.view") && !hasPermission("staff.manage")
            ? t("nav.myTasks")
            : t(labelKey);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg border-l-4 px-4 py-2.5 text-sm transition-colors",
              isActive
                ? "border-primary bg-primary-tint font-semibold text-primary"
                : "border-transparent font-medium text-ink-muted hover:bg-surface hover:text-ink"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="break-words">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg border border-border-soft bg-white px-3 py-2.5 text-left transition-colors hover:bg-surface"
      >
        <Languages className="h-4 w-4 shrink-0 text-ink-faint" />
        <span className="flex-1 text-sm font-medium text-ink">
          {LOCALE_LABELS[locale]}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute bottom-full left-0 z-20 mb-1.5 w-full overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
            {LOCALES.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  onClick={() => {
                    setLocale(l);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
                >
                  <span className="font-medium text-ink">{LOCALE_LABELS[l]}</span>
                  {l === locale && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function UserIdentity() {
  const { currentUser, currentRole } = useCurrentUser();
  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-border-soft bg-surface px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-tint text-sm font-semibold text-primary">
        {(currentUser?.full_name ?? "?").charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">
          {currentUser?.full_name ?? "Unknown user"}
        </div>
        <div className="truncate text-[11px] text-ink-faint">
          {currentRole?.name ?? "-"}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-[250px] shrink-0 flex-col bg-white px-4 py-6 print:hidden lg:flex">
      <div className="mb-8">
        <BrandMark />
      </div>
      <div className="mb-4">
        <GlobalSearchButton enableShortcut />
      </div>
      <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        <NavLinks />
      </nav>

      <LanguageSwitcher />
      <UserIdentity />
      <LogoutButton />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 border-b border-border-soft bg-white px-4 py-3 print:hidden lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <BrandMark />
        <div className="flex items-center gap-2">
          <GlobalSearchButton compact />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[min(320px,calc(100vw-48px))] flex-col bg-white px-4 py-5 shadow-xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <BrandMark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
            <div className="mt-4 border-t border-border-soft pt-4">
              <LanguageSwitcher />
              <UserIdentity />
              <LogoutButton />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
