"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Ends the real Supabase session. Deliberately standalone: reads nothing
// from CurrentUserProvider, just calls supabase.auth.signOut() and redirects.
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cn(
        "mt-2 flex w-full items-center gap-3 rounded-lg border border-border-soft bg-white text-left text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-60",
        compact ? "h-10 justify-center px-0" : "px-3 py-2.5"
      )}
      title={compact ? (loading ? "Signing out..." : "Log out") : undefined}
      aria-label={compact ? (loading ? "Signing out" : "Log out") : undefined}
    >
      <LogOut className="h-4 w-4 shrink-0 text-ink-faint" />
      {!compact && (loading ? "Signing out..." : "Log out")}
    </button>
  );
}
