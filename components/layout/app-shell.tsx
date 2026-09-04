"use client";

import { DesktopTopNav, MobileNav } from "@/components/layout/sidebar";
import { OrderScanProvider } from "@/components/layout/order-scan";
import { ReferenceDataWarmer } from "@/components/layout/reference-data-warmer";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { LoadingState } from "@/components/ui/loading-state";
import { useGlobalNewOrderShortcut } from "@/hooks/use-global-new-order-shortcut";
import { useGlobalNavigationShortcuts } from "@/hooks/use-global-navigation-shortcuts";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Phase 3: the session/profile/role fetch is async now (a real Supabase
  // read, not a synchronous in-memory lookup) — this avoids a flash of
  // AccessDenied/empty nav for the one frame before effectivePermissions
  // arrives. Auth pages ((auth) route group) don't render AppShell at all,
  // so this only affects the logged-in app shell.
  const { isLoading, hasPermission } = useCurrentUser();
  useGlobalNewOrderShortcut(!isLoading && hasPermission("orders.create"));
  useGlobalNavigationShortcuts([
    { key: "F2", href: "/orders/new", enabled: !isLoading && hasPermission("orders.create"), modifier: "none" },
    { key: "F3", href: "/delivery", enabled: !isLoading && hasPermission("delivery.view"), modifier: "none" },
    {
      key: "F4",
      href: "/job-cards/tally",
      enabled: !isLoading && (hasPermission("orders.view") || hasPermission("staff.view")),
      modifier: "none",
    },
    {
      key: "F6",
      href: "/job-cards/production-print",
      enabled: !isLoading && hasPermission("orders.printJobCard"),
      modifier: "none",
    },
    {
      key: "F7",
      href: "/job-cards",
      enabled: !isLoading && (hasPermission("orders.view") || hasPermission("staff.view")),
      modifier: "none",
    },
    { key: "h", href: "/dashboard", enabled: !isLoading && hasPermission("dashboard.view") },
    { key: "o", href: "/orders", enabled: !isLoading && hasPermission("orders.view") },
    {
      key: "j",
      href: "/job-cards/tally",
      enabled: !isLoading && (hasPermission("orders.view") || hasPermission("staff.view")),
    },
    { key: "d", href: "/delivery", enabled: !isLoading && hasPermission("delivery.view") },
    { key: "c", href: "/customers", enabled: !isLoading && hasPermission("customers.view") },
    {
      key: "f",
      href: "/payments",
      enabled: !isLoading && (hasPermission("finance.income.view") || hasPermission("expenses.view")),
    },
    { key: "i", href: "/inventory", enabled: !isLoading && hasPermission("inventory.view") },
    { key: "w", href: "/staff", enabled: !isLoading && hasPermission("staff.view") },
    { key: "r", href: "/reports", enabled: !isLoading && hasPermission("reports.view") },
    {
      key: "m",
      href: "/communications",
      enabled: !isLoading && hasPermission("communications.view"),
    },
    { key: "g", href: "/settings", enabled: !isLoading && hasPermission("settings.view") },
  ]);
  const canScanOrders = !isLoading && hasPermission("orders.view");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <LoadingState label="Loading workspace..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileNav />
      <DesktopTopNav />
      <ReferenceDataWarmer />
      <OrderScanProvider enabled={canScanOrders} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
