"use client";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-border-soft bg-white p-6 shadow-soft"
    >
      <div className="mb-4 flex items-center justify-center gap-3 text-sm font-medium text-ink-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span>{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-primary-tint">
        <div className="loading-progress-bar h-full w-1/2 rounded-full bg-primary" />
      </div>
    </div>
  );
}
