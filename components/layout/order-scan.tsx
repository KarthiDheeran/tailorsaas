"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Loader2, X } from "lucide-react";
import { resolveOrderScanAction } from "@/app/(shell)/orders/actions";
import { CLOSE_TRANSIENT_OVERLAYS_EVENT } from "@/hooks/use-global-new-order-shortcut";
import { cn } from "@/lib/utils";

export const OPEN_ORDER_SCAN_EVENT = "tailorsaas:open-order-scan";

const MAX_SCANNER_KEY_GAP_MS = 90;
const MIN_SCANNER_LENGTH = 8;
const SCANNER_TOTAL_MS_PER_CHAR = 80;

function looksLikeOrderScan(value: string) {
  const code = value.trim().toUpperCase();
  return /^TS\|ORD\|[A-Z0-9]{12,}$/.test(code) || /^(?:ORD-\d{4}-\d{3,}|[MCB]-\d+|\d+)$/.test(code);
}

function looksLikeStageSlipScan(value: string) {
  const code = value.trim().toUpperCase();
  return /^TS\|JOB\|[A-Z0-9]{12,}$/.test(code) || /^JCS-\d{4}-\d{3,}$/.test(code);
}

function looksLikeSupportedScan(value: string) {
  return looksLikeOrderScan(value) || looksLikeStageSlipScan(value);
}

function shouldSuppressScannerCharacter(value: string) {
  const code = value.toUpperCase();
  return code.startsWith("TS|ORD") || code.startsWith("ORD") || /^[MCB]-/.test(code) || /^\d+$/.test(code) || /^\d{2}-\d{5}$/.test(code) || /^J-\d{5}$/.test(code);
}

function focusedTextControl() {
  const element = document.activeElement;
  if (
    element instanceof HTMLInputElement &&
    !element.disabled &&
    !element.readOnly &&
    !["button", "checkbox", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(
      element.type
    )
  ) {
    return element;
  }
  if (element instanceof HTMLTextAreaElement && !element.disabled && !element.readOnly) {
    return element;
  }
  return null;
}

function setTextControlValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  window.setTimeout(() => {
    element.focus();
    element.setSelectionRange(value.length, value.length);
  }, 0);
}

export function OrderScanProvider({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scanRef = useRef({ value: "", startedAt: 0, lastAt: 0 });
  const resolvingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const resolveCode = useCallback(async (code: string, behavior: "fill-focused-field" | "open-order") => {
    const trimmed = code.trim();
    if (!trimmed || resolvingRef.current) return;
    resolvingRef.current = true;
    setIsResolving(true);
    setError("");
    if (looksLikeStageSlipScan(trimmed)) {
      resolvingRef.current = false;
      setIsResolving(false);
      setOpen(false);
      setManualCode("");
      window.dispatchEvent(new Event(CLOSE_TRANSIENT_OVERLAYS_EVENT));
      router.push(`/job-cards/tally?scan=${encodeURIComponent(trimmed)}`);
      return;
    }
    const result = await resolveOrderScanAction(trimmed);
    resolvingRef.current = false;
    setIsResolving(false);

    if (!result.success) {
      const message = result.error || "Order not found";
      setError(message);
      if (!open) window.alert(message);
      return;
    }

    setOpen(false);
    setManualCode("");
    if (behavior === "fill-focused-field") {
      const target = focusedTextControl();
      if (target) {
        setTextControlValue(target, result.data.orderNumber);
        return;
      }
    }
    window.dispatchEvent(new Event(CLOSE_TRANSIENT_OVERLAYS_EVENT));
    router.push(`/orders/${result.data.orderId}`);
  }, [open, router]);

  useEffect(() => {
    if (!enabled) return;

    function openManualScan() {
      setError("");
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }

    window.addEventListener(OPEN_ORDER_SCAN_EVENT, openManualScan);
    return () => window.removeEventListener(OPEN_ORDER_SCAN_EVENT, openManualScan);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, open]);

  useEffect(() => {
    if (!enabled) return;

    function resetScan(now = performance.now()) {
      scanRef.current = { value: "", startedAt: now, lastAt: now };
    }

    function onKeyDown(event: KeyboardEvent) {
      if (open || event.ctrlKey || event.altKey || event.metaKey) return;

      const now = performance.now();
      const state = scanRef.current;

      if (event.key === "Enter") {
        const value = state.value;
        const totalMs = now - state.startedAt;
        resetScan(now);
        if (
          value.length >= MIN_SCANNER_LENGTH &&
          totalMs <= Math.max(300, value.length * SCANNER_TOTAL_MS_PER_CHAR) &&
          looksLikeSupportedScan(value)
        ) {
          event.preventDefault();
          event.stopPropagation();
          void resolveCode(value, "fill-focused-field");
        }
        return;
      }

      if (event.key.length !== 1) return;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.dataset.rawBarcodeInput === "true"
      ) {
        return;
      }

      if (!state.value || now - state.lastAt > MAX_SCANNER_KEY_GAP_MS) {
        scanRef.current = { value: event.key, startedAt: now, lastAt: now };
        return;
      }

      const nextValue = state.value + event.key;
      scanRef.current = { value: nextValue, startedAt: state.startedAt, lastAt: now };
      if (nextValue.length >= 3 && shouldSuppressScannerCharacter(nextValue)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [enabled, open, resolveCode]);

  if (!enabled || !open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 px-4 py-24 print:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-scan-title"
        className="w-full max-w-md rounded-xl border border-border-soft bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
          <div>
            <h2 id="order-scan-title" className="text-lg font-semibold text-ink">
              Scan / Enter Order Code
            </h2>
            <p className="text-sm text-ink-muted">Scan the receipt barcode or type the order code.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close scan dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          className="space-y-3 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void resolveCode(manualCode, "open-order");
          }}
        >
          <input
            ref={inputRef}
            value={manualCode}
            onChange={(event) => {
              setManualCode(event.target.value);
              setError("");
            }}
            placeholder="TS|ORD|... or 1"
            className="h-11 w-full rounded-lg border border-border px-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-lg border border-border px-4 font-semibold text-ink hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isResolving}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResolving && <Loader2 className="h-4 w-4 animate-spin" />}
              Open Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OrderScanButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_ORDER_SCAN_EVENT))}
      className={cn(
        "flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-ink-muted transition hover:bg-surface-muted hover:text-ink",
        compact ? "w-10" : "px-3"
      )}
      title="Scan / Enter Order Code"
      aria-label="Scan / Enter Order Code"
    >
      <Barcode className="h-4 w-4 shrink-0" />
      {!compact && <span className="hidden min-[1536px]:inline">Scan</span>}
    </button>
  );
}
