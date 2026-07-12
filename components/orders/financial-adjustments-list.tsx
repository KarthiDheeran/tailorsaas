"use client";

import { useState } from "react";
import { voidFinancialAdjustmentAction } from "@/app/(shell)/orders/actions";
import { formatDate } from "@/components/orders/orders-table";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import type { Order, OrderFinancialAdjustment, Payment } from "@/lib/types";

type AdjustmentResult = {
  order: Order;
  payments: Payment[];
  adjustments: OrderFinancialAdjustment[];
};

function money(amount: number) {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function adjustmentTone(type: OrderFinancialAdjustment["adjustmentType"]) {
  if (type === "Discount") return "bg-chip-mint text-chip-mint-fg";
  if (type === "Extra Charge") return "bg-chip-peach text-chip-peach-fg";
  return "bg-chip-blue text-chip-blue-fg";
}

function signedAmount(adjustment: OrderFinancialAdjustment) {
  if (adjustment.adjustmentType === "Discount") return `-${money(adjustment.amount)}`;
  if (adjustment.adjustmentType === "Extra Charge") return `+${money(adjustment.amount)}`;
  return money(adjustment.amount);
}

function AdjustmentRow({
  order,
  adjustment,
  canVoid,
  onVoided,
}: {
  order: Order;
  adjustment: OrderFinancialAdjustment;
  canVoid: boolean;
  onVoided: (result: AdjustmentResult) => void;
}) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleVoid() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await voidFinancialAdjustmentAction(
      adjustment.id,
      order.id,
      reason.trim()
    );
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onVoided(result.data);
  }

  return (
    <div
      className={`rounded-lg border border-border-soft p-3 ${
        adjustment.voided ? "bg-surface opacity-70" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">
              {signedAmount(adjustment)}
            </span>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${adjustmentTone(
                adjustment.adjustmentType
              )}`}
            >
              {adjustment.adjustmentType}
            </span>
            {adjustment.voided && (
              <span className="inline-block rounded-full bg-chip-info px-2.5 py-0.5 text-xs font-semibold text-chip-info-fg">
                Voided
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {formatDate(adjustment.adjustmentDate)}
            {adjustment.paymentMode ? ` · ${adjustment.paymentMode}` : ""}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{adjustment.reason}</p>
          {adjustment.notes && (
            <p className="mt-1 text-xs text-ink-faint">{adjustment.notes}</p>
          )}
          {adjustment.voided && (
            <p className="mt-1 text-xs text-ink-faint">
              Voided
              {adjustment.voidedAt ? ` on ${formatDate(adjustment.voidedAt.slice(0, 10))}` : ""}
              {adjustment.voidReason ? ` - ${adjustment.voidReason}` : ""}
            </p>
          )}
        </div>
        {canVoid && !adjustment.voided && !voiding && (
          <button
            type="button"
            onClick={() => setVoiding(true)}
            className="shrink-0 text-xs font-semibold text-chip-red-fg hover:underline"
          >
            Void
          </button>
        )}
      </div>

      {canVoid && !adjustment.voided && voiding && (
        <div className="mt-3 space-y-2 rounded-lg border border-border-soft bg-surface p-3">
          <label className="block text-[12px] font-medium text-ink-muted">
            Void reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
          {error && <p className="text-xs font-medium text-chip-red-fg">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setVoiding(false);
                setReason("");
                setError("");
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleVoid}
              disabled={submitting || !reason.trim()}
              className="rounded-lg bg-chip-red px-3 py-1.5 text-xs font-semibold text-chip-red-fg disabled:cursor-not-allowed disabled:opacity-60"
            >
              Confirm Void
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export function FinancialAdjustmentsList({
  order,
  adjustments,
  onVoided,
}: {
  order: Order;
  adjustments: OrderFinancialAdjustment[];
  onVoided: (result: AdjustmentResult) => void;
}) {
  const { hasPermission } = useCurrentUser();
  const canVoid = hasPermission("orders.voidPayment");

  if (adjustments.length === 0) {
    return <p className="text-sm text-ink-muted">No adjustments yet.</p>;
  }

  return (
    <div className="space-y-2">
      {adjustments.map((adjustment) => (
        <AdjustmentRow
          key={adjustment.id}
          order={order}
          adjustment={adjustment}
          canVoid={canVoid}
          onVoided={onVoided}
        />
      ))}
    </div>
  );
}
