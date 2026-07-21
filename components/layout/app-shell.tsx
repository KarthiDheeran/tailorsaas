"use client";

import { DesktopTopNav, MobileNav } from "@/components/layout/sidebar";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { LoadingState } from "@/components/ui/loading-state";
import { useGlobalNewOrderShortcut } from "@/hooks/use-global-new-order-shortcut";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Phase 3: the session/profile/role fetch is async now (a real Supabase
  // read, not a synchronous in-memory lookup) — this avoids a flash of
  // AccessDenied/empty nav for the one frame before effectivePermissions
  // arrives. Auth pages ((auth) route group) don't render AppShell at all,
  // so this only affects the logged-in app shell.
  const { isLoading, hasPermission } = useCurrentUser();
  useGlobalNewOrderShortcut(!isLoading && hasPermission("orders.create"));

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <LoadingState label="Loading workspace..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <MobileNav />
      <DesktopTopNav />
      <main className="min-w-0 bg-surface">{children}</main>
    </div>
  );
}
