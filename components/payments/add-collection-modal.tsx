"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { recordPaymentAction } from "@/app/(shell)/orders/actions";
import { paymentModes } from "@/lib/constants";
import type { Order, Payment, PaymentMode, PaymentType } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";
import { useCurrentUser } from "@/components/auth/current-user-provider";

function money(n: number) {
  return `₹${Math.round(Number(n)).toLocaleString("en-IN")}`;
}

// Accounts → Pending Dues' own "Add Collection" flow — a purpose-built modal
// (read-only order context + Collection Type/Received By, on top of what
// RecordPaymentModal already offers) that still writes through the exact
// same recordPaymentAction/record_payment() RPC as RecordPaymentModal (used
// elsewhere, e.g. the Order Details drawer) — no new mutation/RPC, per this
// chunk's "do not change database schema or API routes" instruction. Two
// requested fields don't have a real backing column/param, so both are
// handled as scoped-down, notes-only additions rather than silently
// skipped or silently given real persistence they don't have:
//   - Collection Mode's requested "Other" option isn't a valid value in
//     payments.payment_mode's check constraint (Cash/GPay/UPI/Card/Bank
//     Transfer/Cheque) — adding it would be a schema change. Reuses the
//     same lib/constants.ts#paymentModes list every other Payment Mode
//     dropdown in the app already offers (GPay kept for that consistency).
//   - Received By: payments.recorded_by is always stamped server-side from
//     auth.uid() inside record_payment() — there's no p_recorded_by param,
//     so a client-supplied name can't actually change who the row is
//     attributed to (and shouldn't: that's the audit trail). Defaults to
//     the current user's own name and stays editable, but is folded into
//     the Notes text on save rather than pretending it retags the payment.
// Collection Type (Partial/Final) is similarly not a record_payment()
// param — it's server-computed (Final if the payment zeroes the balance,
// Partial/Advance otherwise) — so the field here mirrors that same
// Final-if-balance-else-Partial rule for the UI only; it isn't sent to the
// RPC either.
export function AddCollectionModal({
  order,
  onClose,
  onRecorded,
}: {
  order: Order;
  onClose: () => void;
  onRecorded: (result: { order: Order; payments: Payment[] }) => void;
}) {
  const { t } = useLanguage();
  const { currentUser } = useCurrentUser();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState(String(order.balance));
  const [collectionMode, setCollectionMode] = useState<PaymentMode | "">("");
  const [collectionType, setCollectionType] = useState<PaymentType>(
    order.balance > 0 ? "Final" : "Partial"
  );
  const [typeOverridden, setTypeOverridden] = useState(false);
  const [receivedBy, setReceivedBy] = useState(currentUser?.full_name ?? "");
  const [collectionDate, setCollectionDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleAmountChange(value: string) {
    setAmount(value);
    if (typeOverridden) return;
    const amountNum = Number(value);
    if (!Number.isNaN(amountNum)) {
      setCollectionType(amountNum >= order.balance ? "Final" : "Partial");
    }
  }

  function validate(): string | null {
    const amountNum = Number(amount);
    if (!amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
      return t("orders.amountRequired");
    }
    if (amountNum > order.balance) {
      return t("orders.amountExceedsBalance");
    }
    if (!collectionDate) {
      return t("payments.collectionDateRequired");
    }
    if (collectionDate > todayIso) {
      return t("orders.paymentDateFuture");
    }
    if (!collectionMode) {
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
    const receivedByNote = receivedBy.trim()
      ? `${t("payments.receivedBy")}: ${receivedBy.trim()}`
      : "";
    const combinedNotes = [receivedByNote, notes.trim()].filter(Boolean).join(" — ");
    const result = await recordPaymentAction({
      orderId: order.id,
      amount: Number(amount),
      paymentDate: collectionDate,
      paymentMode: collectionMode as PaymentMode,
      notes: combinedNotes || undefined,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onRecorded(result.data);
  }

  const alreadyPaid = order.totalAmount - order.balance;

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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">
            {t("payments.addCollection")}
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

        <div className="mb-4 space-y-1 rounded-lg bg-surface p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{t("orders.orderNo")}</span>
            <span className="font-semibold text-primary">{order.orderNumber}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{t("orders.customer")}</span>
            <span className="text-ink">{order.customerSnapshot?.name ?? t("common.unknown")}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{t("common.phone")}</span>
            <span className="text-ink">{order.customerSnapshot?.phone ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{t("payments.totalBill")}</span>
            <span className="text-ink">{money(order.totalAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{t("payments.alreadyPaid")}</span>
            <span className="text-ink">{money(alreadyPaid)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{t("payments.balanceDue")}</span>
            <span className="font-semibold text-chip-red-fg">{money(order.balance)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              {t("payments.amountReceived")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="h-11 w-full rounded-lg border border-border px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-muted">
                {t("payments.collectionMode")}
              </label>
              <select
                value={collectionMode}
                onChange={(e) => setCollectionMode(e.target.value as PaymentMode)}
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
                {t("payments.collectionType")}
              </label>
              <select
                value={collectionType}
                onChange={(e) => {
                  setTypeOverridden(true);
                  setCollectionType(e.target.value as PaymentType);
                }}
                className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                <option value="Partial">{t("orders.paymentTypePartial")}</option>
                <option value="Final">{t("orders.paymentTypeFinal")}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-muted">
                {t("payments.receivedBy")}
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="h-11 w-full rounded-lg border border-border px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-muted">
                {t("payments.collectionDate")}
              </label>
              <input
                type="date"
                value={collectionDate}
                max={todayIso}
                onChange={(e) => setCollectionDate(e.target.value)}
                className="h-11 w-full rounded-lg border border-border px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </div>
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
              {t("payments.saveCollection")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
