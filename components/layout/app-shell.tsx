"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { useCurrentUser } from "@/components/auth/current-user-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Phase 3: the session/profile/role fetch is async now (a real Supabase
  // read, not a synchronous in-memory lookup) — this avoids a flash of
  // AccessDenied/empty nav for the one frame before effectivePermissions
  // arrives. Auth pages ((auth) route group) don't render AppShell at all,
  // so this only affects the logged-in app shell.
  const { isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-surface">{children}</main>
    </div>
  );
}
