"use client";

import type { Customer } from "@/lib/types";

function hasText(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

export function TailoringProfileCard({ customer }: { customer: Customer }) {
  const rows = [
    ["Category Preference", customer.categoryPreference],
    ["Fabric Source", customer.fabricSourcePreference],
    ["Fit Preference", customer.fitPreference],
    ["Style Preference", customer.stylePreference],
    ["Frequent Complaints", customer.frequentComplaints],
    ["Customer Notes", customer.notes],
  ].filter(([, value]) => hasText(value) && value !== "Not specified");

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h3 className="mb-4 text-[17px] font-semibold text-ink">
        Tailoring Profile
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No tailoring preferences recorded yet.
        </p>
      ) : (
        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] font-medium text-ink-muted">
                {label}
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
