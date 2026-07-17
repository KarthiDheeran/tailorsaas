"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { voidPaymentAction } from "@/app/(shell)/orders/actions";
import { formatDate } from "@/components/orders/orders-table";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";
import type { Payment } from "@/lib/types";

// Phase 7F: the Payments page's Void action — a centered modal (same
// chrome/layering as components/orders/record-payment-modal.tsx) rather
// than components/orders/payment-history-list.tsx's inline expanding
// reason box, since that one is built for a card-style row inside the
// Order Details drawer, not a dense table row here. Both ultimately call
// the same existing voidPaymentAction (no new RPC/data-layer logic).
export function VoidPaymentModal({
  payment,
  orderNumber,
  onClose,
  onVoided,
}: {
  payment: Payment;
  orderNumber: string;
  onClose: () => void;
  onVoided: () => void;
}) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) {
      setError(t("orders.voidReasonRequired"));
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await voidPaymentAction(payment.id, payment.orderId, reason.trim());
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onVoided();
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
            {t("orders.voidPayment")}
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
          {orderNumber} · {formatCurrency(payment.amount)} ·{" "}
          {payment.paymentMode} · {formatDate(payment.paymentDate)}
        </p>

        <label className="mb-1 block text-[13px] font-medium text-ink-muted">
          {t("orders.voidReason")}
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
        {error && (
          <p className="mt-2 text-sm font-medium text-chip-red-fg">{error}</p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !reason.trim()}
            className="flex-1 rounded-lg bg-chip-red px-4 py-2 text-sm font-semibold text-chip-red-fg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("orders.confirmVoidPayment")}
          </button>
        </div>
      </div>
    </>
  );
}
