"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

export const CLOSE_TRANSIENT_OVERLAYS_EVENT = "tailorsaas:close-transient-overlays";

export function useGlobalNewOrderShortcut(enabled: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.key.toLowerCase() !== "n") return;

      event.preventDefault();

      if (pathnameRef.current === "/orders/new") return;

      window.dispatchEvent(new Event(CLOSE_TRANSIENT_OVERLAYS_EVENT));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      router.push("/orders/new");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, router]);
}
