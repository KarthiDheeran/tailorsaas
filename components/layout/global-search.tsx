"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import {
  globalSearchAction,
  type GlobalSearchGroup,
  type GlobalSearchResult,
} from "@/app/(shell)/global-search/actions";
import { CLOSE_TRANSIENT_OVERLAYS_EVENT } from "@/hooks/use-global-new-order-shortcut";
import { cn } from "@/lib/utils";

const GROUPS: GlobalSearchGroup[] = ["Customers", "Orders", "Job Cards", "Staff"];
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 220;

function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  return navigator.platform.toLowerCase().includes("mac");
}

export function GlobalSearchButton({
  compact = false,
  enableShortcut = false,
}: {
  compact?: boolean;
  enableShortcut?: boolean;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Record<GlobalSearchGroup, GlobalSearchResult[]>>({
    Customers: [],
    Orders: [],
    "Job Cards": [],
    Staff: [],
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const shortcutLabel = isMacPlatform() ? "Cmd K" : "Ctrl K";

  const flatResults = useMemo(
    () => GROUPS.flatMap((group) => results[group].map((result) => ({ group, result }))),
    [results]
  );

  function closePalette() {
    setOpen(false);
    setQuery("");
    setResults({
      Customers: [],
      Orders: [],
      "Job Cards": [],
      Staff: [],
    });
    setActiveIndex(0);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function openPalette() {
    setOpen(true);
  }

  function selectResult(result: GlobalSearchResult) {
    closePalette();
    router.push(result.href);
  }

  useEffect(() => {
    if (!enableShortcut) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enableShortcut]);

  useEffect(() => {
    function onCloseTransientOverlays() {
      setOpen(false);
      setQuery("");
      setResults({
        Customers: [],
        Orders: [],
        "Job Cards": [],
        Staff: [],
      });
      setActiveIndex(0);
    }

    window.addEventListener(CLOSE_TRANSIENT_OVERLAYS_EVENT, onCloseTransientOverlays);
    return () =>
      window.removeEventListener(CLOSE_TRANSIENT_OVERLAYS_EVENT, onCloseTransientOverlays);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < MIN_QUERY_LENGTH) {
      setIsLoading(false);
      setResults({
        Customers: [],
        Orders: [],
        "Job Cards": [],
        Staff: [],
      });
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    const timer = window.setTimeout(() => {
      globalSearchAction(query)
        .then((payload) => {
          if (cancelled) return;
          setResults(payload.results);
          setActiveIndex(0);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
        return;
      }

      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && flatResults.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flatResults.length);
    }
    if (event.key === "ArrowUp" && flatResults.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flatResults.length) % flatResults.length);
    }
    if (event.key === "Enter" && flatResults[activeIndex]) {
      event.preventDefault();
      selectResult(flatResults[activeIndex].result);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPalette}
        title={`Search (${shortcutLabel})`}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border-soft bg-white text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink",
          compact ? "h-10 w-10 justify-center" : "w-full justify-between px-3 py-2.5"
        )}
        aria-label={`Search (${shortcutLabel})`}
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0" />
          {!compact && <span className="hidden min-[1536px]:inline">Search</span>}
        </span>
        {!compact && (
          <span className="hidden rounded-md border border-border-soft px-1.5 py-0.5 text-[11px] text-ink-faint 2xl:inline-flex">
            {shortcutLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 py-16 sm:px-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close search"
            onClick={closePalette}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            className="relative flex max-h-[min(680px,calc(100vh-96px))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-soft bg-white shadow-xl"
          >
            <div className="flex items-center gap-3 border-b border-border-soft px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search customers, orders, job cards, or staff..."
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              />
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
              <button
                type="button"
                onClick={closePalette}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-[180px] overflow-y-auto py-2">
              {query.trim().length < MIN_QUERY_LENGTH ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">
                  Type at least 2 characters to search.
                </p>
              ) : isLoading && flatResults.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">
                  Searching...
                </p>
              ) : flatResults.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">
                  No matching customers, orders, job cards, or staff.
                </p>
              ) : (
                GROUPS.map((group) => {
                  const groupResults = results[group];
                  if (groupResults.length === 0) return null;
                  return (
                    <div key={group} className="py-1">
                      <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase text-ink-faint">
                        {group}
                      </div>
                      <div>
                        {groupResults.map((result) => {
                          const index = flatResults.findIndex((entry) => entry.result.id === result.id);
                          const active = index === activeIndex;
                          return (
                            <button
                              key={`${result.type}-${result.id}`}
                              type="button"
                              onMouseEnter={() => setActiveIndex(index)}
                              onClick={() => selectResult(result)}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                                active ? "bg-primary-tint" : "hover:bg-surface"
                              )}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-ink">
                                  {result.title}
                                </span>
                                <span className="block truncate text-xs text-ink-muted">
                                  {result.subtitle}
                                </span>
                              </span>
                              <span className="shrink-0 text-[11px] font-medium text-ink-faint">
                                Enter
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
