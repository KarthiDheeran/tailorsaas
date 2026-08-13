"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CLOSE_TRANSIENT_OVERLAYS_EVENT } from "@/hooks/use-global-new-order-shortcut";

export type NavigationShortcut = {
  key: string;
  href: string;
  enabled: boolean;
  modifier?: "alt" | "none";
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Provides app-wide Alt shortcuts for primary navigation. The mapping is
 * deliberately kept separate from page-specific shortcuts (for example,
 * Alt+S saves an order) so navigation never steals an in-page action.
 */
export function useGlobalNavigationShortcuts(shortcuts: NavigationShortcut[]) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;

      const shortcut = shortcutsRef.current.find(
        (item) => {
          if (!item.enabled || item.key.toLowerCase() !== event.key.toLowerCase()) return false;
          const modifier = item.modifier ?? "alt";
          if (modifier === "alt") return event.altKey;
          return modifier === "none" && !event.altKey;
        }
      );
      if (!shortcut) return;

      event.preventDefault();
      if (pathnameRef.current === shortcut.href) return;

      window.dispatchEvent(new Event(CLOSE_TRANSIENT_OVERLAYS_EVENT));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      router.push(shortcut.href);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);
}
