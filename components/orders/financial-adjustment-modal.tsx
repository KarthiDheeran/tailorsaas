"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { recordFinancialAdjustmentAction } from "@/app/(shell)/orders/actions";
import { paymentModes } from "@/lib/constants";
import type {
  Order,
  OrderFinancialAdjustment,
  OrderFinancialAdjustmentType,
  Payment,
  PaymentMode,
} from "@/lib/types";

type AdjustmentResult = {
  order: Order;
  payments: Payment[];
  adjustments: OrderFinancialAdjustment[];
};

export function FinancialAdjustmentModal({
  order,
  onClose,
  onRecorded,
}: {
  order: Order;
  onClose: () => void;
  onRecorded: (result: AdjustmentResult) => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [adjustmentType, setAdjustmentType] =
    useState<OrderFinancialAdjustmentType>("Discount");
  const [amount, setAmount] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState(todayIso);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate(): string | null {
    const amountNum = Number(amount);
    if (!amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
      return "Amount must be greater than zero.";
    }
    if (!adjustmentDate || adjustmentDate > todayIso) {
      return "Adjustment date cannot be in the future.";
    }
    if (!reason.trim()) return "Reason is required.";
    if (adjustmentType === "Refund" && !paymentMode) {
      return "Refund payment mode is required.";
    }
    if (adjustmentType === "Refund" && amountNum > order.advancePaid) {
      return "Refund cannot exceed paid amount.";
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
    const result = await recordFinancialAdjustmentAction({
      orderId: order.id,
      adjustmentType,
      amount: Number(amount),
      adjustmentDate,
      paymentMode: adjustmentType === "Refund" ? (paymentMode as PaymentMode) : undefined,
      reason: reason.trim(),
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
          <h2 className="text-[17px] font-semibold text-ink">Financial Adjustment</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-ink-muted">
          Discount reduces bill total, extra charge increases it, refund reduces paid amount.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              Type
            </label>
            <select
              value={adjustmentType}
              onChange={(e) => {
                const next = e.target.value as OrderFinancialAdjustmentType;
                setAdjustmentType(next);
                if (next !== "Refund") setPaymentMode("");
              }}
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            >
              <option value="Discount">Discount</option>
              <option value="Extra Charge">Extra Charge</option>
              <option value="Refund">Refund</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-muted">
                Amount
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
                Date
              </label>
              <input
                type="date"
                value={adjustmentDate}
                max={todayIso}
                onChange={(e) => setAdjustmentDate(e.target.value)}
                className="h-11 w-full rounded-lg border border-border px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </div>
          </div>

          {adjustmentType === "Refund" && (
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-muted">
                Refund Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                <option value="">Select...</option>
                {paymentModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              Reason
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-11 w-full rounded-lg border border-border px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              placeholder="Round off, rework charge, refund advance..."
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-muted">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </div>

          {error && <p className="text-sm font-medium text-chip-red-fg">{error}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Adjustment
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
