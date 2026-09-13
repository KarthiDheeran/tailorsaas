"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";
import { createTrackedFetch, isVisibleRequest, requestActivity } from "@/lib/request-activity";

// Install before descendant effects run, including auth and initial page reads.
// Symbol prevents duplicate wrapping during development hot reloads.
const installed = Symbol.for("tailorsaas.request-activity");
if (typeof window !== "undefined" && !Reflect.get(window, installed)) {
  window.fetch = createTrackedFetch(window.fetch.bind(window), requestActivity, (input, init) =>
    isVisibleRequest(input, init, window.location.origin, getSupabasePublicConfig().url)
  );
  Reflect.set(window, installed, true);
}

export function RequestActivityProvider({ children }: { children: React.ReactNode }) {
  const pending = useSyncExternalStore(requestActivity.subscribe, requestActivity.getSnapshot, () => 0);
  const busy = pending > 0;
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      setSlow(false);
      return;
    }
    const show = window.setTimeout(() => setVisible(true), 150);
    const warn = window.setTimeout(() => setSlow(true), 10000);
    return () => { window.clearTimeout(show); window.clearTimeout(warn); };
  }, [busy]);

  return (
    <>
      <div aria-busy={busy}>{children}</div>
      {busy && visible && (
        <div className="pointer-events-none fixed inset-0 z-[150] bg-white/20 print:hidden" data-testid="request-loading-mask">
          <div className="h-1 overflow-hidden bg-primary-tint">
            <div className="loading-progress-bar h-full w-1/2 bg-primary" />
          </div>
          <div role="status" aria-live="polite" className="absolute bottom-6 left-1/2 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-border-soft bg-white px-5 py-3 text-sm font-medium text-ink shadow-lg">
            <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary" />
            <span>{slow ? "Still working. Please wait for confirmation before trying again." : "Please wait…"}</span>
          </div>
        </div>
      )}
    </>
  );
}
