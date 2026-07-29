"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { voidPaymentAction } from "@/app/(shell)/orders/actions";
import { formatDate } from "@/components/orders/orders-table";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatCurrency } from "@/lib/currency";
import type { Order, Payment, PaymentType } from "@/lib/types";

// Recorded-by (profiles.id) is deliberately not shown here — resolving it to
// a display name would need lib/profiles.ts's getAppUserById, but its RLS
// (profiles_select_own / profiles_select_managed) only lets a caller read
// their own profile or any profile with settings.manageUsers — a Manager
// with orders.viewPayments but not settings.manageUsers couldn't resolve
// another user's name, so every "recorded by" beyond their own would break
// or need new backend surface. Flagging this as deferred rather than
// showing a raw id or silently building new profile-visibility plumbing
// nobody asked for in this chunk.
const PAYMENT_TYPE_LABEL_KEYS: Record<PaymentType, TranslationKey> = {
  Advance: "orders.paymentTypeAdvance",
  Partial: "orders.paymentTypePartial",
  Final: "orders.paymentTypeFinal",
};

const PAYMENT_TYPE_STYLES: Record<PaymentType, { bg: string; fg: string }> = {
  Advance: { bg: "bg-chip-blue", fg: "text-chip-blue-fg" },
  Partial: { bg: "bg-chip-peach", fg: "text-chip-peach-fg" },
  Final: { bg: "bg-chip-mint", fg: "text-chip-mint-fg" },
};

// Exported for reuse by components/reports/payments-report-view.tsx (Phase
// 7D) — same chip, one source of truth for Advance/Partial/Final styling.
export function PaymentTypeChip({ type }: { type: PaymentType }) {
  const { t } = useLanguage();
  const style = PAYMENT_TYPE_STYLES[type];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.fg}`}
    >
      {t(PAYMENT_TYPE_LABEL_KEYS[type])}
    </span>
  );
}

function PaymentRow({
  order,
  payment,
  canVoid,
  onVoided,
}: {
  order: Order;
  payment: Payment;
  canVoid: boolean;
  onVoided: (result: { order: Order; payments: Payment[] }) => void;
}) {
  const { t } = useLanguage();
  const { hasPermission } = useCurrentUser();
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirmVoid() {
    if (!reason.trim()) {
      setError(t("orders.voidReasonRequired"));
      return;
    }
    setSubmitting(true);
    setError("");
    const result = await voidPaymentAction(payment.id, order.id, reason.trim());
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
        payment.voided ? "bg-surface opacity-70" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">
              {formatCurrency(payment.amount)}
            </span>
            <PaymentTypeChip type={payment.paymentType} />
            {payment.voided && (
              <span className="inline-block rounded-full bg-chip-info px-2.5 py-0.5 text-xs font-semibold text-chip-info-fg">
                {t("orders.voided")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {formatDate(payment.paymentDate)} · {payment.paymentMode}
          </p>
          {payment.receivedByOperatorName && (
            <p className="mt-1 text-xs text-ink-muted">Collected by {payment.receivedByOperatorName}</p>
          )}
          {payment.notes && (
            <p className="mt-1 text-xs text-ink-muted">{payment.notes}</p>
          )}
          {payment.voided && (
            <p className="mt-1 text-xs text-ink-faint">
              {t("orders.voidedOn")}{" "}
              {payment.voidedAt ? formatDate(payment.voidedAt.slice(0, 10)) : ""}
              {payment.voidReason ? ` — ${payment.voidReason}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canPrintReceipt && !payment.voided && (
            <Link
              href={`/orders/${order.id}/print/payment/${payment.id}`}
              title="Print payment receipt"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <Printer className="h-3.5 w-3.5" />
            </Link>
          )}
          {canVoid && !payment.voided && !voiding && (
            <button
              type="button"
              onClick={() => setVoiding(true)}
              className="text-xs font-semibold text-chip-red-fg hover:underline"
            >
              {t("orders.voidPayment")}
            </button>
          )}
        </div>
      </div>

      {canVoid && !payment.voided && voiding && (
        <div className="mt-3 space-y-2 rounded-lg border border-border-soft bg-surface p-3">
          <label className="block text-[12px] font-medium text-ink-muted">
            {t("orders.voidReason")}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
          {error && (
            <p className="text-xs font-medium text-chip-red-fg">{error}</p>
          )}
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
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirmVoid}
              disabled={submitting || !reason.trim()}
              className="rounded-lg bg-chip-red px-3 py-1.5 text-xs font-semibold text-chip-red-fg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("orders.confirmVoidPayment")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PaymentHistoryList({
  order,
  payments,
  onVoided,
}: {
  order: Order;
  payments: Payment[];
  onVoided: (result: { order: Order; payments: Payment[] }) => void;
}) {
  const { t } = useLanguage();
  const { hasPermission } = useCurrentUser();
  const canVoid = hasPermission("orders.voidPayment");

  if (payments.length === 0) {
    return <p className="text-sm text-ink-muted">{t("orders.noPaymentsYet")}</p>;
  }

  return (
    <div className="space-y-2">
      {payments.map((payment) => (
        <PaymentRow
          key={payment.id}
          order={order}
          payment={payment}
          canVoid={canVoid}
          onVoided={onVoided}
        />
      ))}
    </div>
  );
}
