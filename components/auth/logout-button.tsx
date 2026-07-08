"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Ends the real Supabase session. Deliberately standalone — reads nothing
// from CurrentUserProvider (still mock data until Phase 3), just calls
// supabase.auth.signOut() and redirects to /login.
export function LogoutButton() {
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
      className="mt-2 flex w-full items-center gap-3 rounded-lg border border-border-soft bg-white px-3 py-2.5 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-60"
    >
      <LogOut className="h-4 w-4 shrink-0 text-ink-faint" />
      {loading ? "Signing out…" : "Log out"}
    </button>
  );
}
