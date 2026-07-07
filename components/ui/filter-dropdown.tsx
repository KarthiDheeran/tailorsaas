"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export const FILTER_CONTROL_CLASS =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

// Closed control always shows "<prefix>: <current label>" (e.g. "Status: All"),
// but the open menu lists plain values only ("All", "In Progress", ...) — a
// native <select> can't show different text for its closed vs. open state,
// so this is a small custom button+menu dropdown instead. Shared between the
// Orders and Customers filter rows so both stay visually/behaviorally in sync.
export function FilterDropdown<T extends string>({
  prefix,
  value,
  options,
  onChange,
  minWidthClass,
}: {
  prefix: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  // A floor, not a cap: the button has no fixed `w-*`, so it grows past this
  // to fit longer selected values instead of truncating them.
  minWidthClass: string;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  function handleSelect(v: T) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${FILTER_CONTROL_CLASS} ${minWidthClass} flex items-center justify-between gap-2`}
      >
        <span className="whitespace-nowrap">
          {prefix}: {currentLabel}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute left-0 z-20 mt-1 w-full min-w-max overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className="block w-full whitespace-nowrap px-3.5 py-2 text-left text-sm text-ink hover:bg-surface"
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
