"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared native <select> styling: fixed 44px height, 8px radius, 14px left
// padding, and a custom-positioned chevron (36px reserved on the right) so
// the arrow is never flush against the edge or overlapping selected text —
// the native OS-drawn arrow (default `appearance: auto`) can't guarantee
// either. `appearance-none` removes the native arrow so this one is the only
// one rendered.
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        {...props}
        className={cn(
          "h-11 w-full appearance-none rounded-lg border border-border bg-white py-0 pl-3.5 pr-9 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
    </div>
  );
});
