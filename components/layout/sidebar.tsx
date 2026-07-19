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
  PanelLeftClose,
  PanelLeftOpen,
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
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList, permission: "orders.view" },
  { href: "/job-cards", labelKey: "nav.jobCards", icon: FileText, anyOf: ["orders.view", "staff.view"] },
  { href: "/production", labelKey: "nav.production", icon: Workflow, anyOf: ["orders.view", "staff.view"] },
  { href: "/delivery", labelKey: "nav.delivery", icon: Truck, permission: "orders.view" },
  { href: "/customers", labelKey: "nav.customers", icon: Users, permission: "customers.view" },
  { href: "/payments", labelKey: "nav.payments", icon: Wallet, anyOf: ["orders.viewPayments", "expenses.view"] },
  { href: "/inventory", labelKey: "nav.inventory", icon: Package, permission: "inventory.view" },
  { href: "/staff", labelKey: "nav.staff", icon: Users2, permission: "staff.view" },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3, permission: "reports.view" },
  { href: "/communications", labelKey: "nav.communications", icon: MessageCircle, anyOf: ["calendar.view", "orders.view", "customers.view"] },
  {
    href: "/settings",
    labelKey: "nav.settings",
    icon: Settings,
    permission: "settings.view",
    activePrefixes: ["/settings", "/catalog", "/users-access"],
  },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-2", compact && "justify-center px-0")}>
      <Shirt className="h-6 w-6 shrink-0 text-primary" />
      <div className={cn(compact && "hidden")}>
        <div className="text-[18px] font-bold leading-tight tracking-tight text-ink">
          NewLook
        </div>
        <div className="text-[11px] leading-tight text-ink-faint">
          Tailoring. Simplified.
        </div>
      </div>
    </div>
  );
}

function NavLinks({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
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
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg border-l-4 text-sm transition-colors",
              collapsed ? "h-11 justify-center px-0" : "px-4 py-2.5",
              isActive
                ? "border-primary bg-primary-tint font-semibold text-primary"
                : "border-transparent font-medium text-ink-muted hover:bg-surface hover:text-ink"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className={cn("break-words", collapsed && "hidden")}>{label}</span>
          </Link>
        );
      })}
    </>
  );
}

function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-border-soft bg-white text-left transition-colors hover:bg-surface",
          compact ? "h-10 justify-center px-0" : "px-3 py-2.5"
        )}
        title={compact ? LOCALE_LABELS[locale] : undefined}
        aria-label={compact ? `Language: ${LOCALE_LABELS[locale]}` : undefined}
      >
        <Languages className="h-4 w-4 shrink-0 text-ink-faint" />
        <span className={cn("flex-1 text-sm font-medium text-ink", compact && "hidden")}>
          {LOCALE_LABELS[locale]}
        </span>
        <ChevronsUpDown className={cn("h-3.5 w-3.5 shrink-0 text-ink-faint", compact && "hidden")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul
            className={cn(
              "absolute bottom-full left-0 z-20 mb-1.5 overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft",
              compact ? "w-44" : "w-full"
            )}
          >
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

function UserIdentity({ compact = false }: { compact?: boolean }) {
  const { currentUser, currentRole } = useCurrentUser();
  const name = currentUser?.full_name ?? "Unknown user";
  const role = currentRole?.name ?? "-";

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-border-soft bg-surface",
        compact ? "h-12 justify-center px-0" : "px-3 py-2.5"
      )}
      title={compact ? `${name} - ${role}` : undefined}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-tint text-sm font-semibold text-primary">
        {name.charAt(0)}
      </div>
      <div className={cn("min-w-0 flex-1", compact && "hidden")}>
        <div className="truncate text-sm font-semibold text-ink">
          {name}
        </div>
        <div className="truncate text-[11px] text-ink-faint">
          {role}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col bg-white py-6 transition-[width,padding] duration-200 print:hidden lg:flex",
        collapsed ? "w-[72px] px-3" : "w-[250px] px-4"
      )}
    >
      <div className={cn("mb-8 flex items-center gap-2", collapsed ? "justify-center" : "justify-between")}>
        <BrandMark compact={collapsed} />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-soft text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
      <div className="mb-4">
        <GlobalSearchButton compact={collapsed} enableShortcut />
      </div>
      <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        <NavLinks collapsed={collapsed} />
      </nav>

      <LanguageSwitcher compact={collapsed} />
      <UserIdentity compact={collapsed} />
      <LogoutButton compact={collapsed} />
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
