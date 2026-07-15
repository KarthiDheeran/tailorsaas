"use client";

import type { Customer } from "@/lib/types";

export function TailoringProfileCard({ customer }: { customer: Customer }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h3 className="mb-4 text-[17px] font-semibold text-ink">
        Customer Notes
      </h3>
      {customer.notes?.trim() ? (
        <p className="whitespace-pre-wrap text-sm text-ink">{customer.notes}</p>
      ) : (
        <p className="text-sm text-ink-muted">
          No customer notes recorded yet.
        </p>
      )}
    </div>
  );
}
