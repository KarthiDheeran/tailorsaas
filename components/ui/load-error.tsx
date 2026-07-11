"use client";

import { AlertTriangle } from "lucide-react";

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-chip-red bg-white p-4 text-sm shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-chip-red-fg" />
        <p className="flex-1 font-medium text-chip-red-fg">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-chip-red px-3 py-1.5 text-xs font-semibold text-chip-red-fg transition-colors hover:bg-chip-red"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
