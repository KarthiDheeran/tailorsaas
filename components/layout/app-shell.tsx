"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { LoadingState } from "@/components/ui/loading-state";

const SIDEBAR_COLLAPSED_KEY = "tailorsaas.sidebarCollapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Phase 3: the session/profile/role fetch is async now (a real Supabase
  // read, not a synchronous in-memory lookup) — this avoids a flash of
  // AccessDenied/empty nav for the one frame before effectivePermissions
  // arrives. Auth pages ((auth) route group) don't render AppShell at all,
  // so this only affects the logged-in app shell.
  const { isLoading } = useCurrentUser();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

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
      <div
        className="flex min-h-screen"
        style={
          {
            "--sidebar-width": sidebarCollapsed ? "72px" : "250px",
          } as CSSProperties
        }
      >
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface">{children}</main>
      </div>
    </div>
  );
}
