"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Gender } from "@/lib/types";
import {
  getCustomerByNameAndPhoneAction,
  searchCustomerAddressesAction,
} from "@/app/(shell)/customers/actions";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";

export interface NewCustomerFormValues {
  name: string;
  phone: string;
  address: string;
  area: string;
  gender?: Gender;
  notes?: string;
}

type SubmitResult = { keepPending?: boolean } | void;
type SubmitHandler = (values: NewCustomerFormValues) => SubmitResult | Promise<SubmitResult>;
type PendingAction = "primary" | "secondary" | null;

const GENDER_OPTIONS: Gender[] = ["Male", "Female"];

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
  onSubmit: SubmitHandler;
  // When provided, a Cancel button renders alongside the submit button(s).
  onCancel?: () => void;
  // An alternate save action (e.g. "Save & Create Order") — runs the same
  // validation as the primary submit, then calls its own handler instead.
  secondaryAction?: {
    label: string;
    onSubmit: SubmitHandler;
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
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [duplicateCustomer, setDuplicateCustomer] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<
    { address: string; area: string }[]
  >([]);
  const [addressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const [activeAddressSuggestionIndex, setActiveAddressSuggestionIndex] = useState(-1);
  const addressRef = useRef<HTMLLabelElement | null>(null);
  const isSubmitting = pendingAction !== null;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!addressRef.current?.contains(event.target as Node)) {
        setAddressSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const query = address.trim();
    if (query.length < 2) {
      setAddressSuggestions([]);
      setActiveAddressSuggestionIndex(-1);
      return;
    }
    let cancelled = false;
    searchCustomerAddressesAction(query).then((suggestions) => {
      if (!cancelled) {
        setAddressSuggestions(suggestions);
        setActiveAddressSuggestionIndex(-1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

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

    const existing = await getCustomerByNameAndPhoneAction(trimmedName, trimmedPhone);
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
      notes: notes.trim(),
    };
  }

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/\D/g, "").slice(0, 10));
  }

  function selectAddressSuggestion(suggestion: { address: string; area: string }) {
    setAddress(suggestion.address);
    if (suggestion.area) setArea(suggestion.area);
    setAddressSuggestionsOpen(false);
    setActiveAddressSuggestionIndex(-1);
  }

  function handleAddressKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (addressSuggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAddressSuggestionsOpen(true);
      setActiveAddressSuggestionIndex((current) =>
        current < 0 ? 0 : Math.min(current + 1, addressSuggestions.length - 1)
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAddressSuggestionsOpen(true);
      setActiveAddressSuggestionIndex((current) =>
        current < 0 ? addressSuggestions.length - 1 : Math.max(current - 1, 0)
      );
      return;
    }
    if (event.key === "Enter" && addressSuggestionsOpen) {
      const suggestion =
        addressSuggestions[activeAddressSuggestionIndex >= 0 ? activeAddressSuggestionIndex : 0];
      if (!suggestion) return;
      event.preventDefault();
      selectAddressSuggestion(suggestion);
      return;
    }
    if (event.key === "Escape" && addressSuggestionsOpen) {
      event.preventDefault();
      setAddressSuggestionsOpen(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setPendingAction("primary");
    let keepPending = false;
    try {
      const values = await buildValidatedValues();
      if (values) {
        const result = await onSubmit(values);
        keepPending = result?.keepPending === true;
      }
    } finally {
      if (!keepPending) setPendingAction(null);
    }
  }

  async function handleSecondarySubmit() {
    if (isSubmitting) return;
    setPendingAction("secondary");
    let keepPending = false;
    try {
      const values = await buildValidatedValues();
      if (values) {
        const result = await secondaryAction?.onSubmit(values);
        keepPending = result?.keepPending === true;
      }
    } finally {
      if (!keepPending) setPendingAction(null);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={isSubmitting}
      className="rounded-xl border border-border-soft bg-white p-5 shadow-soft"
    >
      <h3 className="mb-4 text-[17px] font-semibold text-ink">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("common.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            className={cn(
              inputClass,
              isSubmitting && "cursor-not-allowed opacity-70",
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
            disabled={isSubmitting}
            className={cn(
              inputClass,
              isSubmitting && "cursor-not-allowed opacity-70",
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
              A customer with this name and phone number already exists.{" "}
              <Link
                href={`/customers/${duplicateCustomer.id}`}
                className="font-semibold underline hover:no-underline"
              >
                {t("customers.viewExistingCustomer")}
              </Link>
            </div>
          )}
        </label>
        <label ref={addressRef} className="relative flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("common.address")}
          </span>
          <input
            value={address}
            onFocus={() => setAddressSuggestionsOpen(true)}
            onChange={(e) => {
              setAddress(e.target.value);
              setAddressSuggestionsOpen(true);
            }}
            onKeyDown={handleAddressKeyDown}
            disabled={isSubmitting}
            className={cn(inputClass, isSubmitting && "cursor-not-allowed opacity-70")}
          />
          {addressSuggestionsOpen && addressSuggestions.length > 0 && (
            <div
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-soft"
            >
              {addressSuggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.address}|${suggestion.area}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeAddressSuggestionIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveAddressSuggestionIndex(index)}
                  onClick={() => selectAddressSuggestion(suggestion)}
                  className={cn(
                    "block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted",
                    index === activeAddressSuggestionIndex && "bg-primary-tint"
                  )}
                >
                  <span className="block truncate font-medium">{suggestion.address}</span>
                  {suggestion.area && (
                    <span className="block truncate text-xs text-ink-muted">{suggestion.area}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("common.area")}
          </span>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={isSubmitting}
            className={cn(inputClass, isSubmitting && "cursor-not-allowed opacity-70")}
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
                disabled={isSubmitting}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                  isSubmitting && "cursor-not-allowed opacity-70",
                  gender === g
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-ink hover:bg-surface-muted"
                )}
              >
                {g === "Male" ? t("common.male") : t("common.female")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="mt-5 flex flex-col gap-1.5 border-t border-border-soft pt-5">
        <span className="text-[13px] font-medium text-ink-muted">
          Customer Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isSubmitting}
          rows={4}
          placeholder="Fit preference, fabric habit, repeat issues, style notes, reminders..."
          className={cn(textareaClass, isSubmitting && "cursor-not-allowed opacity-70")}
        />
      </label>

      {onCancel || secondaryAction ? (
        <div className="mt-5 flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
            >
              {t("common.cancel")}
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {secondaryAction && (
              <button
                type="button"
                onClick={handleSecondarySubmit}
                disabled={isSubmitting}
                className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pendingAction === "secondary" ? "Saving..." : secondaryAction.label}
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-secondary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pendingAction === "primary" ? "Saving..." : submitLabel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 rounded-lg bg-secondary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pendingAction === "primary" ? "Saving..." : submitLabel}
        </button>
      )}
    </form>
  );
}
