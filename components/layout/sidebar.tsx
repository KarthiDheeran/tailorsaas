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
  labelKey?: TranslationKey;
  label?: string;
  icon: LucideIcon;
  shortcut?: string;
  permission?: Permission;
  anyOf?: Permission[];
  activePrefixes?: string[];
  exact?: boolean;
  children?: NavItem[];
};

type VisibleNavItem = Omit<NavItem, "children"> & {
  label: string;
  isActive: boolean;
  children?: VisibleNavItem[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, shortcut: "Alt H", permission: "dashboard.view" },
  {
    href: "/orders",
    labelKey: "nav.orders",
    icon: ClipboardList,
    shortcut: "Alt O",
    anyOf: ["orders.view", "orders.create"],
    children: [
      { href: "/orders/new", label: "New Order", icon: ClipboardList, shortcut: "F2", permission: "orders.create" },
      { href: "/orders", label: "View Orders", icon: ClipboardList, permission: "orders.view", exact: true },
    ],
  },
  {
    href: "/job-cards",
    labelKey: "nav.production",
    icon: FileText,
    shortcut: "Alt J",
    anyOf: ["orders.view", "staff.view", "orders.printJobCard"],
    activePrefixes: ["/job-cards"],
    children: [
      { href: "/job-cards/tally", label: "Tally Scans", icon: FileText, shortcut: "F4", anyOf: ["orders.view", "staff.view"] },
      { href: "/job-cards", label: "Order Ready", icon: FileText, shortcut: "F7", anyOf: ["orders.view", "staff.view"], exact: true },
      { href: "/job-cards/production-print", label: "Production Print", icon: FileText, shortcut: "F6", permission: "orders.printJobCard" },
    ],
  },
  { href: "/delivery", labelKey: "nav.delivery", icon: Truck, shortcut: "F3", permission: "orders.view" },
  {
    href: "/customers",
    labelKey: "nav.customers",
    icon: Users,
    shortcut: "Alt C",
    anyOf: ["customers.view", "customers.create"],
    children: [
      { href: "/customers/new", label: "Add Customer", icon: Users, permission: "customers.create" },
      { href: "/customers", label: "View Customers", icon: Users, permission: "customers.view", exact: true },
    ],
  },
  {
    href: "/payments",
    labelKey: "nav.payments",
    icon: Wallet,
    shortcut: "Alt F",
    anyOf: ["orders.viewPayments", "expenses.view"],
    children: [
      { href: "/payments?tab=collections", label: "Income", icon: Wallet, permission: "orders.viewPayments" },
      { href: "/payments?tab=pending-dues", label: "Pending Due", icon: Wallet, permission: "orders.viewPayments" },
      { href: "/payments?tab=adjustments", label: "Adjustments", icon: Wallet, permission: "orders.viewPayments" },
      { href: "/payments?tab=expenses", label: "Expenses", icon: Wallet, permission: "expenses.view" },
    ],
  },
  { href: "/inventory", labelKey: "nav.inventory", icon: Package, shortcut: "Alt I", permission: "inventory.view" },
  {
    href: "/staff",
    labelKey: "nav.staff",
    icon: Users2,
    shortcut: "Alt W",
    anyOf: ["staff.view", "staff.manage"],
    children: [
      { href: "/staff/new", label: "Add Staff", icon: Users2, permission: "staff.manage" },
      { href: "/staff", label: "View Staff", icon: Users2, permission: "staff.view", exact: true },
    ],
  },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3, shortcut: "Alt R", permission: "reports.view" },
  { href: "/communications", labelKey: "nav.communications", icon: MessageCircle, shortcut: "Alt M", permission: "communications.view" },
  {
    href: "/settings",
    labelKey: "nav.settings",
    icon: Settings,
    shortcut: "Alt G",
    permission: "settings.view",
    activePrefixes: ["/settings", "/catalog", "/users-access"],
  },
];

function BrandMark({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-2", compact && "justify-center px-0")}>
      <Shirt className={cn("h-6 w-6 shrink-0", inverted ? "text-white" : "text-primary")} />
      <div className={cn(compact && "hidden")}>
        <div className={cn("text-[18px] font-bold leading-tight tracking-tight", inverted ? "text-white" : "text-ink")}>
          NewLook
        </div>
        <div className={cn("text-[11px] leading-tight", inverted ? "text-white/75" : "text-ink-faint")}>
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

function navPath(href: string) {
  return href.split("?")[0];
}

function isNavPathActive(pathname: string, item: Pick<NavItem, "href" | "exact">) {
  const path = navPath(item.href);
  if (item.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function useVisibleNavItems(items: NavItem[]): VisibleNavItem[] {
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
      const visibleChildren = item.children
        ?.filter((child) => {
          if (child.permission) return hasPermission(child.permission);
          if (child.anyOf) return hasAnyPermission(child.anyOf);
          return true;
        })
        .map((child) => {
          return {
            ...child,
            children: undefined,
            isActive: isNavPathActive(pathname, child),
            label: child.label ?? t(child.labelKey!),
          };
        });
      const isActive = Boolean(
        isNavPathActive(pathname, item) ||
        item.activePrefixes?.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
        ) ||
        visibleChildren?.some((child) => child.isActive)
      );
      const label = item.label ?? t(item.labelKey!);
      return { ...item, children: visibleChildren, isActive, label };
    });
}

function NavLink({
  item,
  variant,
  onNavigate,
}: {
  item: VisibleNavItem;
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
        variant === "horizontal" && "h-9 shrink-0 border px-2.5 text-[13px] xl:px-3 2xl:text-sm",
        variant === "vertical" && "border-l-4 px-4 py-2.5",
        variant === "dropdown" && "px-3 py-2.5",
        item.isActive
          ? cn(
              "font-semibold shadow-sm",
              variant === "horizontal"
                ? "border-white/20 bg-primary-active text-white"
                : "border-primary bg-primary text-white"
            )
          : cn(
              variant === "horizontal"
                ? "border-white/20 bg-white/10 font-medium text-white hover:bg-white/20"
                : "font-medium text-ink-muted hover:bg-surface-muted hover:text-ink",
              variant === "horizontal" ? "" : "border-transparent"
            )
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
      {visibleNavItems.map((item) => {
        const children = item.children ?? [];
        if (variant === "horizontal" && children.length > 0) {
          return (
            <NavDropdown
              key={item.href}
              label={item.label}
              icon={item.icon}
              items={children}
              active={item.isActive}
            />
          );
        }
        if (variant === "vertical" && children.length > 0) {
          return (
            <div key={item.href} className="space-y-1">
              <NavLink item={item} variant={variant} onNavigate={onNavigate} />
              <div className="ml-4 space-y-1 border-l border-border-soft pl-2">
                {children.map((child) => (
                  <NavLink key={child.href} item={child} variant="dropdown" onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        }
        return <NavLink key={item.href} item={item} variant={variant} onNavigate={onNavigate} />;
      })}
    </>
  );
}

function NavDropdown({
  label,
  icon: Icon = Menu,
  items,
  active: activeOverride,
  className,
}: {
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
  active?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const visibleItems = useVisibleNavItems(items);
  const active = activeOverride ?? visibleItems.some((item) => item.isActive);
  useCloseTransientOverlays(() => setOpen(false));

  if (visibleItems.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 shrink-0 items-center gap-2 rounded-xl border px-2.5 text-[13px] font-medium transition-colors xl:px-3 2xl:text-sm",
          active
            ? "border-white/20 bg-primary-active font-semibold text-white shadow-sm"
            : "border-white/20 bg-white/10 text-white hover:bg-white/20"
        )}
        aria-expanded={open}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/80" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label={`Close ${label} menu`}
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border-soft bg-white p-1.5 shadow-xl">
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
      <div className="flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border border-primary-active/30 bg-primary px-3 py-2 shadow-[0_12px_30px_rgba(37,99,235,0.22)]">
        <div className="shrink-0">
          <BrandMark inverted />
        </div>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-visible py-1">
          <NavLinks items={navItems} variant="horizontal" />
        </nav>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <ActiveOperatorControl />
          <div className="w-10 min-[1536px]:w-[150px] 2xl:w-[220px]">
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
