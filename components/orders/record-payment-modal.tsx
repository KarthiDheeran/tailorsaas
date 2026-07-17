"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { recordPaymentAction } from "@/app/(shell)/orders/actions";
import { paymentModes } from "@/lib/constants";
import type { Order, Payment, PaymentMode } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

// Centered modal, above OrderDetailsDrawer's z-50 — same layering convention
// as GarmentMeasurementModal (z-[60]/z-[70] over a drawer). Client-side
// validation here is a UX convenience only; record_payment() (supabase/
// migrations/0008_payments.sql) re-validates amount/overpayment/date and is
// the actual source of truth — its own exception message is what gets shown
// if this modal's checks somehow disagree with it (e.g. a payment recorded
// from another tab in between).
export function RecordPaymentModal({
  order,
  onClose,
  onRecorded,
}: {
  order: Order;
  onClose: () => void;
  onRecorded: (result: { order: Order; payments: Payment[] }) => void;
}) {
  const { t } = useLanguage();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate(): string | null {
    const amountNum = Number(amount);
    if (!amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
      return t("orders.amountRequired");
    }
    if (amountNum > order.balance) {
      return t("orders.amountExceedsBalance");
    }
    if (!paymentDate || paymentDate > todayIso) {
      return t("orders.paymentDateFuture");
    }
    if (!paymentMode) {
      return t("orders.paymentModeRequired");
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await recordPaymentAction({
      orderId: order.id,
      amount: Number(amount),
      paymentDate,
      paymentMode: paymentMode as PaymentMode,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onRecorded(result.data);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">
            {t("orders.recordPayment")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-ink-muted">
          {t("orders.remainingBalance")}:{" "}
          <span className="font-semibold text-ink">
            {formatCurrency(order.balance)}
          </span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              {t("common.amount")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 w-full rounded-lg border border-border px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              placeholder="0"
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              {t("orders.paymentDate")}
            </label>
            <input
              type="date"
              value={paymentDate}
              max={todayIso}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-border px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              {t("orders.paymentMode")}
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            >
              <option value="">{t("common.selectEllipsis")}</option>
              {paymentModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              {t("common.notes")} ({t("common.optional")})
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-chip-red-fg">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("orders.recordPayment")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
