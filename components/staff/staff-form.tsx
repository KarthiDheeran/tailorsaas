"use client";

import { useState } from "react";
import type {
  StaffPaymentType,
  StaffRole,
  StaffStatus,
  TaskType,
} from "@/lib/types";
import { TASK_TYPES } from "@/lib/staff";
import { cn } from "@/lib/utils";

export interface StaffFormValues {
  name: string;
  phone: string;
  role: StaffRole;
  joiningDate: string;
  address: string;
  emergencyContact: string;
  status: StaffStatus;
  notes?: string;
  paymentType: StaffPaymentType;
  baseSalary?: number;
  pieceRates?: Partial<Record<TaskType, number>>;
}

const ROLES: StaffRole[] = [
  "Master Tailor",
  "Cutter",
  "Stitching Staff",
  "Embroidery Staff",
  "Finishing Staff",
  "Alteration Staff",
  "Delivery Staff",
  "Manager",
  "Owner/Admin",
];

const STATUSES: StaffStatus[] = ["Active", "Inactive", "On Leave"];

export function StaffForm({
  onSubmit,
  initialValues,
  title = "Add Staff",
  submitLabel = "Save Staff",
}: {
  onSubmit: (values: StaffFormValues) => void;
  initialValues?: StaffFormValues;
  title?: string;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [role, setRole] = useState<StaffRole>(initialValues?.role ?? "Stitching Staff");
  const [joiningDate, setJoiningDate] = useState(initialValues?.joiningDate ?? "");
  const [address, setAddress] = useState(initialValues?.address ?? "");
  const [emergencyContact, setEmergencyContact] = useState(
    initialValues?.emergencyContact ?? ""
  );
  const [status, setStatus] = useState<StaffStatus>(initialValues?.status ?? "Active");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [paymentType, setPaymentType] = useState<StaffPaymentType>(
    initialValues?.paymentType ?? "Per Piece"
  );
  const [baseSalary, setBaseSalary] = useState(
    initialValues?.baseSalary != null ? String(initialValues.baseSalary) : ""
  );
  const [pieceRates, setPieceRates] = useState<Partial<Record<TaskType, string>>>(
    Object.fromEntries(
      Object.entries(initialValues?.pieceRates ?? {}).map(([k, v]) => [k, String(v)])
    )
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !joiningDate) return;

    const rates: Partial<Record<TaskType, number>> = {};
    for (const [k, v] of Object.entries(pieceRates)) {
      const n = Number(v);
      if (v && n > 0) rates[k as TaskType] = n;
    }

    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      role,
      joiningDate,
      address: address.trim(),
      emergencyContact: emergencyContact.trim(),
      status,
      notes: notes.trim() || undefined,
      paymentType,
      baseSalary: paymentType === "Salary" ? Number(baseSalary) || 0 : undefined,
      pieceRates: paymentType === "Per Piece" ? rates : undefined,
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
          <span className="text-[13px] font-medium text-ink-muted">Phone Number</span>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">Joining Date</span>
          <input
            required
            type="date"
            value={joiningDate}
            onChange={(e) => setJoiningDate(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">Address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            Emergency Contact
          </span>
          <input
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">Status</span>
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                  status === s
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-ink hover:bg-surface"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">Payment Type</span>
          <div className="flex gap-2">
            {(["Salary", "Per Piece"] as StaffPaymentType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPaymentType(t)}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                  paymentType === t
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-ink hover:bg-surface"
                )}
              >
                {t === "Salary" ? "Monthly Salary" : "Per Piece / Task"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {paymentType === "Salary" ? (
        <label className="mt-4 flex max-w-xs flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            Base Salary (₹/month)
          </span>
          <input
            type="number"
            min={0}
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
      ) : (
        <div className="mt-4">
          <span className="text-[13px] font-medium text-ink-muted">
            Per-Task Rates (₹, leave blank for tasks not applicable)
          </span>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TASK_TYPES.map((t) => (
              <label key={t} className="flex flex-col gap-1.5">
                <span className="text-xs text-ink-faint">{t}</span>
                <input
                  type="number"
                  min={0}
                  value={pieceRates[t] ?? ""}
                  onChange={(e) =>
                    setPieceRates((prev) => ({ ...prev, [t]: e.target.value }))
                  }
                  className="h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-muted">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
      </label>

      <button
        type="submit"
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
      >
        {submitLabel}
      </button>
    </form>
  );
}
