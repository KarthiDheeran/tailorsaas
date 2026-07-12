"use client";

import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { LoadingState } from "@/components/ui/loading-state";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Phase 3: the session/profile/role fetch is async now (a real Supabase
  // read, not a synchronous in-memory lookup) — this avoids a flash of
  // AccessDenied/empty nav for the one frame before effectivePermissions
  // arrives. Auth pages ((auth) route group) don't render AppShell at all,
  // so this only affects the logged-in app shell.
  const { isLoading } = useCurrentUser();

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
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface">{children}</main>
      </div>
    </div>
  );
}
