"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { getOrderByIdAction } from "@/app/(shell)/orders/actions";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import {
  formatDate,
  ORDER_STATUS_LABEL_KEYS,
} from "@/components/orders/orders-table";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Customer, Order } from "@/lib/types";

// No shop-settings module exists yet (see CLAUDE.md) — using the app's own
// name as a stand-in until a real shop profile/name field is introduced.
const SHOP_NAME = "TailorSaaS";

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

  if (order === undefined) return null;
  if (order === null) notFound();

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
              <span className="text-gray-500">{t("print.paidAdvance")}</span>
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
              <span className="font-semibold">{order.paymentMode}</span>
            </div>
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
