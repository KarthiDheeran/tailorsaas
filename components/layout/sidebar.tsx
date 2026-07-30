"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Check,
  ChevronDown,
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
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { GlobalSearchButton } from "@/components/layout/global-search";
import { ActiveOperatorControl } from "@/components/layout/active-operator-control";
import { useLanguage } from "@/components/i18n/language-provider";
import { CLOSE_TRANSIENT_OVERLAYS_EVENT } from "@/hooks/use-global-new-order-shortcut";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Permission } from "@/lib/permissions";

type NavItem = {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  shortcut?: string;
  permission?: Permission;
  anyOf?: Permission[];
  activePrefixes?: string[];
};

const primaryNavItems: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, shortcut: "Alt H", permission: "dashboard.view" },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList, shortcut: "Alt O", permission: "orders.view" },
  { href: "/job-cards/tally", labelKey: "nav.jobCards", icon: FileText, shortcut: "Alt J", anyOf: ["orders.view", "staff.view"] },
  { href: "/delivery", labelKey: "nav.delivery", icon: Truck, shortcut: "Alt D", permission: "orders.view" },
  { href: "/customers", labelKey: "nav.customers", icon: Users, shortcut: "Alt C", permission: "customers.view" },
  { href: "/payments", labelKey: "nav.payments", icon: Wallet, shortcut: "Alt F", anyOf: ["orders.viewPayments", "expenses.view"] },
];

const moreNavItems: NavItem[] = [
  { href: "/inventory", labelKey: "nav.inventory", icon: Package, shortcut: "Alt I", permission: "inventory.view" },
  { href: "/staff", labelKey: "nav.staff", icon: Users2, shortcut: "Alt W", permission: "staff.view" },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3, shortcut: "Alt R", permission: "reports.view" },
  { href: "/communications", labelKey: "nav.communications", icon: MessageCircle, shortcut: "Alt M", anyOf: ["calendar.view", "orders.view", "customers.view"] },
  {
    href: "/settings",
    labelKey: "nav.settings",
    icon: Settings,
    shortcut: "Alt G",
    permission: "settings.view",
    activePrefixes: ["/settings", "/catalog", "/users-access"],
  },
];

const navItems = [...primaryNavItems, ...moreNavItems];

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

function useCloseTransientOverlays(onClose: () => void) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function handleCloseTransientOverlays() {
      onCloseRef.current();
    }

    window.addEventListener(CLOSE_TRANSIENT_OVERLAYS_EVENT, handleCloseTransientOverlays);
    return () =>
      window.removeEventListener(CLOSE_TRANSIENT_OVERLAYS_EVENT, handleCloseTransientOverlays);
  }, []);
}

function useVisibleNavItems(items: NavItem[]) {
  const pathname = usePathname();
  const { hasPermission, hasAnyPermission } = useCurrentUser();
  const { t } = useLanguage();

  return items
    .filter((item) => {
      if (item.permission) return hasPermission(item.permission);
      if (item.anyOf) return hasAnyPermission(item.anyOf);
      return true;
    })
    .map((item) => {
      const isActive =
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`) ||
        item.activePrefixes?.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
        );
      const label =
        item.href === "/staff" && hasPermission("staff.view") && !hasPermission("staff.manage")
          ? t("nav.myTasks")
          : t(item.labelKey);
      return { ...item, isActive, label };
    });
}

function NavLink({
  item,
  variant,
  onNavigate,
}: {
  item: ReturnType<typeof useVisibleNavItems>[number];
  variant: "vertical" | "horizontal" | "dropdown";
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      aria-label={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      className={cn(
        "flex items-center gap-2.5 rounded-xl text-sm transition-colors",
        variant === "horizontal" && "h-9 shrink-0 border px-2.5 2xl:px-3",
        variant === "vertical" && "border-l-4 px-4 py-2.5",
        variant === "dropdown" && "px-3 py-2.5",
        item.isActive
          ? "border-primary bg-primary font-semibold text-white shadow-sm"
          : "border-transparent font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className={cn(variant === "horizontal" ? "whitespace-nowrap" : "break-words")}>
        {item.label}
      </span>
      {variant !== "horizontal" && item.shortcut && (
        <kbd className="ml-auto rounded border border-border-soft bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
          {item.shortcut}
        </kbd>
      )}
    </Link>
  );
}

function NavLinks({
  items = navItems,
  variant = "vertical",
  onNavigate,
}: {
  items?: NavItem[];
  variant?: "vertical" | "horizontal" | "dropdown";
  onNavigate?: () => void;
}) {
  const visibleNavItems = useVisibleNavItems(items);

  return (
    <>
      {visibleNavItems.map((item) => (
        <NavLink key={item.href} item={item} variant={variant} onNavigate={onNavigate} />
      ))}
    </>
  );
}

function NavDropdown({
  label,
  items,
  className,
}: {
  label: string;
  items: NavItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const visibleItems = useVisibleNavItems(items);
  const active = visibleItems.some((item) => item.isActive);
  useCloseTransientOverlays(() => setOpen(false));

  if (visibleItems.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
          active
            ? "border-primary bg-primary-tint text-primary"
            : "border-border-soft bg-white text-ink-muted hover:bg-surface-muted hover:text-ink"
        )}
        aria-expanded={open}
      >
        <Menu className="h-4 w-4 shrink-0" />
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label={`Close ${label} menu`}
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-lg border border-border-soft bg-white p-1.5 shadow-xl">
            {visibleItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                variant="dropdown"
                onNavigate={() => setOpen(false)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LanguageSwitcher({
  compact = false,
  placement = "up",
  className,
}: {
  compact?: boolean;
  placement?: "up" | "down";
  className?: string;
}) {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  useCloseTransientOverlays(() => setOpen(false));

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-border-soft bg-white text-left transition-colors hover:bg-surface-muted",
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
              "absolute left-0 z-20 overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft",
              placement === "down" ? "top-full mt-1.5" : "bottom-full mb-1.5",
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
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted"
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

function UserIdentity({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { currentUser, currentRole } = useCurrentUser();
  const name = currentUser?.full_name ?? "Unknown user";
  const role = currentRole?.name ?? "-";

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-border-soft bg-surface-muted",
        compact ? "h-10 justify-center px-0" : "px-3 py-2.5",
        className
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

function ProfileDropdown() {
  const { currentUser, currentRole } = useCurrentUser();
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const name = currentUser?.full_name ?? "Unknown user";
  const role = currentRole?.name ?? "-";
  useCloseTransientOverlays(() => setOpen(false));

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-soft bg-white text-sm font-semibold text-primary transition-colors hover:bg-surface-muted"
        aria-label="Open profile menu"
        aria-expanded={open}
        title={`${name} - ${role}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-tint">
          {name.charAt(0)}
        </span>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Close profile menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-lg border border-border-soft bg-white shadow-xl">
            <div className="border-b border-border-soft px-4 py-3">
              <div className="truncate text-sm font-semibold text-ink">{name}</div>
              <div className="truncate text-xs text-ink-muted">{role}</div>
            </div>
            <div className="border-b border-border-soft p-2">
              <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase text-ink-faint">
                Language
              </div>
              <div className="grid grid-cols-2 gap-1">
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLocale(l)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      l === locale
                        ? "bg-primary-tint font-semibold text-primary"
                        : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                    )}
                  >
                    <span>{LOCALE_LABELS[l]}</span>
                    {l === locale && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-2">
              <LogoutButton className="border-transparent px-2.5 py-2 hover:bg-surface-muted" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DesktopTopNav() {
  return (
    <header className="sticky top-0 z-50 hidden px-3 pt-3 print:hidden lg:block">
      <div className="flex h-14 min-w-0 items-center gap-3 rounded-2xl border border-white/80 bg-white/85 px-4 shadow-[0_12px_32px_rgba(17,24,39,0.08)] backdrop-blur-xl">
        <div className="shrink-0">
          <BrandMark />
        </div>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 min-[1400px]:flex">
          <NavLinks items={primaryNavItems} variant="horizontal" />
          <NavDropdown label="More" items={moreNavItems} />
        </nav>
        <nav className="flex min-w-0 flex-1 min-[1400px]:hidden">
          <NavDropdown label="Menu" items={navItems} />
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <ActiveOperatorControl />
          <div className="w-10 min-[1536px]:w-[180px] 2xl:w-[280px]">
            <GlobalSearchButton enableShortcut />
          </div>
          <ProfileDropdown />
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  useCloseTransientOverlays(() => setOpen(false));

  return (
    <div className="sticky top-0 z-40 border-b border-border-soft bg-white px-4 py-3 print:hidden lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <BrandMark />
        <div className="flex items-center gap-2">
          <GlobalSearchButton compact />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-ink-muted hover:bg-surface-muted hover:text-ink"
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
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
            <div className="mt-4 border-t border-border-soft pt-4">
              <LanguageSwitcher className="mb-2" />
              <UserIdentity />
              <LogoutButton className="mt-2" />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
