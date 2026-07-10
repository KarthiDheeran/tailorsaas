"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import {
  getOrderByIdAction,
  getPaymentsForOrderAction,
} from "@/app/(shell)/orders/actions";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import {
  formatDate,
  ORDER_STATUS_LABEL_KEYS,
} from "@/components/orders/orders-table";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Customer, Order, Payment } from "@/lib/types";

// No shop-settings module exists yet (see CLAUDE.md) — using the app's own
// name as a stand-in until a real shop profile/name field is introduced.
const SHOP_NAME = "TailorSaaS";

// Phase 7E: the receipt used to show order.paymentMode directly, as if an
// order only ever had one payment — not true once an order can have an
// advance, a partial, and a final payment each recorded in a different
// mode. Kept deliberately simple per this chunk's own instruction (no
// itemized ledger on the receipt — that's what the Order Details drawer's
// Payment History and the Reports Payments tab are for): voided payments
// are excluded entirely, then collapsed to "—" (none), the one mode (one
// payment), or "Multiple" with a small per-mode breakdown (more than one).
type PaymentModeSummary =
  | { kind: "none" }
  | { kind: "single"; mode: string }
  | { kind: "multiple"; breakdown: { mode: string; amount: number }[] };

function summarizePaymentModes(payments: Payment[]): PaymentModeSummary {
  const counted = payments.filter((p) => !p.voided);
  if (counted.length === 0) return { kind: "none" };
  if (counted.length === 1) return { kind: "single", mode: counted[0].paymentMode };
  const byMode = new Map<string, number>();
  for (const p of counted) {
    byMode.set(p.paymentMode, (byMode.get(p.paymentMode) ?? 0) + p.amount);
  }
  return {
    kind: "multiple",
    breakdown: Array.from(byMode.entries()).map(([mode, amount]) => ({ mode, amount })),
  };
}

function CustomerReceiptPrintPageContent({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();
  const { hasPermission } = useCurrentUser();
  // Phase 5D: orders.printCustomerReceipt and orders.viewPayments are
  // siblings under orders.view, not parent/child — a custom role could
  // grant one without the other. Every other payment display in the app
  // (OrdersTable, OrderDetailsDrawer, EditOrderDrawer, New Order) already
  // hides figures behind this same check; this print page was the one
  // place that didn't, so a role without orders.viewPayments could still
  // see Total/Paid/Balance/Payment Mode here.
  const canViewPayments = hasPermission("orders.viewPayments");

  // Phase 6C: order/customer data now comes from real Supabase tables via
  // Server Actions, not a direct synchronous stub-data.ts read — this page
  // never had its data source converted before now (Phase 5D only added
  // the permission gate above), so it needed the same effect-driven
  // fetch/loading-state conversion every other client component already
  // went through in 5A/6B.
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    let cancelled = false;
    getOrderByIdAction(params.id).then((result) => {
      if (cancelled) return;
      setOrder(result ?? null);
      if (result) {
        getCustomerByIdAction(result.customerId).then((c) => {
          if (!cancelled) setCustomer(c);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Phase 7E: only fetched when the caller can see payment figures at all —
  // getPaymentsForOrderAction already re-checks orders.viewPayments
  // server-side and would just return [] otherwise, but there's no reason
  // to make the round trip when this block won't even render.
  useEffect(() => {
    if (!canViewPayments) {
      setPayments([]);
      return;
    }
    let cancelled = false;
    getPaymentsForOrderAction(params.id).then((result) => {
      if (!cancelled) setPayments(result);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id, canViewPayments]);

  if (order === undefined) return null;
  if (order === null) notFound();

  const modeSummary = summarizePaymentModes(payments);

  return (
    <PrintPageFrame backHref="/orders">
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">{SHOP_NAME}</h1>
        <p className="text-sm text-gray-600">{t("print.customerReceipt")}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">{t("print.orderNo")}</p>
          <p className="font-semibold">{order.orderNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.orderStatus")}</p>
          <p className="font-semibold">
            {t(ORDER_STATUS_LABEL_KEYS[order.status])}
          </p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.orderDate")}</p>
          <p className="font-semibold">{formatDate(order.orderDate)}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.deliveryDate")}</p>
          <p className="font-semibold">{formatDate(order.deliveryDate)}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.customerName")}</p>
          <p className="font-semibold">{customer?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.customerPhone")}</p>
          <p className="font-semibold">{customer?.phone ?? "—"}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 border-b border-gray-300 pb-1 text-sm font-semibold uppercase tracking-wide">
          {t("print.items")}
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1.5">{t("print.particular")}</th>
              <th className="py-1.5 text-right">{t("print.qty")}</th>
              <th className="py-1.5 text-right">{t("print.rate")}</th>
              <th className="py-1.5 text-right">{t("print.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.serialNo} className="border-b border-gray-200">
                <td className="py-1.5">{item.particular}</td>
                <td className="py-1.5 text-right">{item.qty}</td>
                <td className="py-1.5 text-right">
                  ₹{(item.finalRate ?? item.rate).toLocaleString("en-IN")}
                </td>
                <td className="py-1.5 text-right">
                  ₹{item.amount.toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canViewPayments && (
        <div className="mt-6 flex justify-end">
          <div className="w-64 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-gray-500">{t("print.total")}</span>
              <span className="font-semibold">
                ₹{order.totalAmount.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">{t("print.paid")}</span>
              <span className="font-semibold">
                ₹{order.advancePaid.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between border-t border-black py-1.5 text-base">
              <span className="font-semibold">{t("print.balance")}</span>
              <span className="font-bold">
                ₹{order.balance.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">{t("print.paymentMode")}</span>
              <span className="font-semibold">
                {modeSummary.kind === "none" && "—"}
                {modeSummary.kind === "single" && modeSummary.mode}
                {modeSummary.kind === "multiple" && t("print.multiplePaymentModes")}
              </span>
            </div>
            {modeSummary.kind === "multiple" && (
              <div className="flex justify-end">
                <span className="text-right text-xs text-gray-500">
                  {modeSummary.breakdown
                    .map((b) => `${b.mode} ₹${b.amount.toLocaleString("en-IN")}`)
                    .join(" · ")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-10 border-t border-gray-300 pt-4 text-center text-xs text-gray-600">
        {t("print.bringReceipt")}
      </p>
    </PrintPageFrame>
  );
}

export default function CustomerReceiptPrintPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RequirePermission permission="orders.printCustomerReceipt">
      <CustomerReceiptPrintPageContent params={params} />
    </RequirePermission>
  );
}
