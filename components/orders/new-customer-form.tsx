"use client";

import { useState } from "react";
import type { Gender } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface NewCustomerFormValues {
  name: string;
  phone: string;
  address: string;
  area: string;
  gender: Gender;
}

export function NewCustomerForm({
  onSubmit,
  initialPhone,
  initialName,
  initialValues,
  title = "New Customer",
  submitLabel = "Continue to Measurements",
}: {
  onSubmit: (values: NewCustomerFormValues) => void;
  initialPhone?: string;
  initialName?: string;
  initialValues?: NewCustomerFormValues;
  title?: string;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialValues?.name ?? initialName ?? "");
  const [phone, setPhone] = useState(
    initialValues?.phone ?? initialPhone ?? ""
  );
  const [address, setAddress] = useState(initialValues?.address ?? "");
  const [area, setArea] = useState(initialValues?.area ?? "");
  const [gender, setGender] = useState<Gender>(initialValues?.gender ?? "Male");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      area: area.trim(),
      gender,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border-soft bg-white p-5 shadow-soft"
    >
      <h3 className="mb-4 text-[17px] font-semibold text-ink">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            Phone Number
          </span>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            Address
          </span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            Area / Locality
          </span>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            Gender
          </span>
          <div className="flex gap-2">
            {(["Male", "Female"] as Gender[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                  gender === g
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-ink hover:bg-surface"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        type="submit"
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
      >
        {submitLabel}
      </button>
    </form>
  );
}
