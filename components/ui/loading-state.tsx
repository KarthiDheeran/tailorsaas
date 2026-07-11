"use client";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-xl border border-border-soft bg-white p-10 text-sm text-ink-muted shadow-soft">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span>{label}</span>
    </div>
  );
}
