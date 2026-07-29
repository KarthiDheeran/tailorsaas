"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Ends the real Supabase session. Deliberately standalone: reads nothing
// from CurrentUserProvider, just calls supabase.auth.signOut() and redirects.
export function LogoutButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      const keysToRemove: string[] = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (
          key?.startsWith("newlook:new-order:") ||
          key?.startsWith("tailorsaas:new-order-customers:")
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
    } catch {
      // Storage cleanup is best effort; sign-out itself must not be blocked.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-border-soft bg-white text-left text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-60",
        compact ? "h-10 justify-center px-0" : "px-3 py-2.5",
        className
      )}
      title={compact ? (loading ? "Signing out..." : "Log out") : undefined}
      aria-label={compact ? (loading ? "Signing out" : "Log out") : undefined}
    >
      <LogOut className="h-4 w-4 shrink-0 text-ink-faint" />
      {!compact && (loading ? "Signing out..." : "Log out")}
    </button>
  );
}
