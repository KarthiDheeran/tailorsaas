"use client";

import { useState } from "react";
import Link from "next/link";
import type { FabricSourcePreference, Gender } from "@/lib/types";
import { getCustomerByPhoneAction } from "@/app/(shell)/customers/actions";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";

export interface NewCustomerFormValues {
  name: string;
  phone: string;
  address: string;
  area: string;
  gender?: Gender;
  categoryPreference?: string;
  fitPreference?: string;
  stylePreference?: string;
  fabricSourcePreference?: FabricSourcePreference;
  frequentComplaints?: string;
  notes?: string;
}

const GENDER_OPTIONS: Gender[] = ["Male", "Female"];
const FABRIC_SOURCE_OPTIONS: FabricSourcePreference[] = [
  "Not specified",
  "Customer provided",
  "Shop provided",
  "Either",
];

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";
const textareaClass =
  "rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export function NewCustomerForm({
  onSubmit,
  onCancel,
  secondaryAction,
  initialPhone,
  initialName,
  initialValues,
  excludeCustomerId,
  title = "New Customer",
  submitLabel = "Continue to Measurements",
}: {
  onSubmit: (values: NewCustomerFormValues) => void;
  // When provided, a Cancel button renders alongside the submit button(s).
  onCancel?: () => void;
  // An alternate save action (e.g. "Save & New Order") — runs the same
  // validation as the primary submit, then calls its own handler instead.
  secondaryAction?: {
    label: string;
    onSubmit: (values: NewCustomerFormValues) => void;
  };
  initialPhone?: string;
  initialName?: string;
  initialValues?: NewCustomerFormValues;
  // Excludes this customer's own id from the duplicate-phone check, so
  // editing a customer without changing their phone doesn't flag itself.
  excludeCustomerId?: string;
  title?: string;
  submitLabel?: string;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initialValues?.name ?? initialName ?? "");
  const [phone, setPhone] = useState(
    initialValues?.phone ?? initialPhone ?? ""
  );
  const [address, setAddress] = useState(initialValues?.address ?? "");
  const [area, setArea] = useState(initialValues?.area ?? "");
  const [gender, setGender] = useState<Gender | undefined>(
    initialValues?.gender
  );
  const [categoryPreference, setCategoryPreference] = useState(
    initialValues?.categoryPreference ?? ""
  );
  const [fitPreference, setFitPreference] = useState(
    initialValues?.fitPreference ?? ""
  );
  const [stylePreference, setStylePreference] = useState(
    initialValues?.stylePreference ?? ""
  );
  const [fabricSourcePreference, setFabricSourcePreference] =
    useState<FabricSourcePreference>(
      initialValues?.fabricSourcePreference ?? "Not specified"
    );
  const [frequentComplaints, setFrequentComplaints] = useState(
    initialValues?.frequentComplaints ?? ""
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [duplicateCustomer, setDuplicateCustomer] = useState<{
    id: string;
    name: string;
  } | null>(null);

  async function buildValidatedValues(): Promise<NewCustomerFormValues | null> {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const nextErrors: { name?: string; phone?: string } = {};
    if (!trimmedName) nextErrors.name = "Name is required.";
    if (!trimmedPhone) {
      nextErrors.phone = "Phone number is required.";
    } else if (!/^\d{10}$/.test(trimmedPhone)) {
      nextErrors.phone = "Phone number must be exactly 10 digits.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setDuplicateCustomer(null);
      return null;
    }

    const existing = await getCustomerByPhoneAction(trimmedPhone);
    if (existing && existing.id !== excludeCustomerId) {
      setDuplicateCustomer({ id: existing.id, name: existing.name });
      return null;
    }
    setDuplicateCustomer(null);

    return {
      name: trimmedName,
      phone: trimmedPhone,
      address: address.trim(),
      area: area.trim(),
      gender,
      categoryPreference: categoryPreference.trim(),
      fitPreference: fitPreference.trim(),
      stylePreference: stylePreference.trim(),
      fabricSourcePreference,
      frequentComplaints: frequentComplaints.trim(),
      notes: notes.trim(),
    };
  }

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/\D/g, "").slice(0, 10));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const values = await buildValidatedValues();
    if (values) onSubmit(values);
  }

  async function handleSecondarySubmit() {
    const values = await buildValidatedValues();
    if (values) secondaryAction?.onSubmit(values);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-xl border border-border-soft bg-white p-5 shadow-soft"
    >
      <h3 className="mb-4 text-[17px] font-semibold text-ink">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("common.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(
              inputClass,
              errors.name && "border-chip-red-fg focus:border-chip-red-fg"
            )}
          />
          {errors.name && (
            <span className="text-xs font-medium text-chip-red-fg">
              {errors.name}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("common.phoneNumber")}
          </span>
          <input
            inputMode="numeric"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            className={cn(
              inputClass,
              errors.phone && "border-chip-red-fg focus:border-chip-red-fg"
            )}
          />
          {errors.phone && (
            <span className="text-xs font-medium text-chip-red-fg">
              {errors.phone}
            </span>
          )}
          {duplicateCustomer && (
            <div className="mt-1 rounded-lg bg-chip-red px-3.5 py-2.5 text-xs font-medium text-chip-red-fg">
              {t("customers.phoneExists")}{" "}
              <Link
                href={`/customers/${duplicateCustomer.id}`}
                className="font-semibold underline hover:no-underline"
              >
                {t("customers.viewExistingCustomer")}
              </Link>
            </div>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("common.address")}
          </span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("common.area")}
          </span>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("common.gender")}
          </span>
          <div className="flex gap-2">
            {GENDER_OPTIONS.map((g) => (
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
                {g === "Male" ? t("common.male") : t("common.female")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border-soft pt-5">
        <h4 className="mb-4 text-[15px] font-semibold text-ink">
          Tailoring Profile
        </h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Category Preference
            </span>
            <input
              value={categoryPreference}
              onChange={(e) => setCategoryPreference(e.target.value)}
              placeholder="Menswear, bridal, alterations..."
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Fabric Source
            </span>
            <select
              value={fabricSourcePreference}
              onChange={(e) =>
                setFabricSourcePreference(e.target.value as FabricSourcePreference)
              }
              className={inputClass}
            >
              {FABRIC_SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Fit Preference
            </span>
            <input
              value={fitPreference}
              onChange={(e) => setFitPreference(e.target.value)}
              placeholder="Slim, regular, loose, comfort..."
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Style Preference
            </span>
            <input
              value={stylePreference}
              onChange={(e) => setStylePreference(e.target.value)}
              placeholder="Simple, embroidery, modern cut..."
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-medium text-ink-muted">
              Frequent Complaints
            </span>
            <textarea
              value={frequentComplaints}
              onChange={(e) => setFrequentComplaints(e.target.value)}
              rows={2}
              placeholder="Shoulder feels tight, sleeve usually long..."
              className={textareaClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-medium text-ink-muted">
              Customer Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Repeat-order habits, style reminders, fabric notes..."
              className={textareaClass}
            />
          </label>
        </div>
      </div>

      {onCancel || secondaryAction ? (
        <div className="mt-5 flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              {t("common.cancel")}
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {secondaryAction && (
              <button
                type="button"
                onClick={handleSecondarySubmit}
                className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                {secondaryAction.label}
              </button>
            )}
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
        >
          {submitLabel}
        </button>
      )}
    </form>
  );
}
