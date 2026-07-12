"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import {
  getOrderByIdAction,
  getPaymentsForOrderAction,
} from "@/app/(shell)/orders/actions";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import { getPrintableBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { formatDate } from "@/components/orders/orders-table";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import type { Customer, Order, Payment } from "@/lib/types";

function money(value: number) {
  return `Rs ${Number(value).toLocaleString("en-IN")}`;
}

function receiptNumber(order: Order, payment: Payment, settings: ShopBillingSettings) {
  const invoiceNumber = order.invoiceNumber ?? `${settings.receiptPrefix}-${order.orderNumber}`;
  return `${invoiceNumber}-PAY-${payment.id.slice(0, 8).toUpperCase()}`;
}

function PaymentReceiptPrintPageContent({
  params,
}: {
  params: { id: string; paymentId: string };
}) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [payment, setPayment] = useState<Payment | null | undefined>(undefined);
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings>(
    DEFAULT_SHOP_BILLING_SETTINGS
  );

  useEffect(() => {
    let cancelled = false;

    getPrintableBillingSettingsAction().then((settings) => {
      if (!cancelled) setBillingSettings(settings);
    });

    getOrderByIdAction(params.id).then((result) => {
      if (cancelled) return;
      setOrder(result ?? null);
      if (result) {
        getCustomerByIdAction(result.customerId).then((c) => {
          if (!cancelled) setCustomer(c);
        });
      }
    });

    getPaymentsForOrderAction(params.id).then((result) => {
      if (!cancelled) {
        setPayment(result.find((p) => p.id === params.paymentId) ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [params.id, params.paymentId]);

  if (order === undefined || payment === undefined) return null;
  if (order === null || payment === null) notFound();

  const invoiceNumber = order.invoiceNumber ?? `${billingSettings.receiptPrefix}-${order.orderNumber}`;

  return (
    <PrintPageFrame backHref={`/orders?view=${order.id}`}>
      <div className="border-b-2 border-black pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold">{billingSettings.shopName}</h1>
            {billingSettings.tagline && (
              <p className="text-sm text-gray-600">{billingSettings.tagline}</p>
            )}
            {(billingSettings.phone || billingSettings.email) && (
              <p className="text-xs text-gray-600">
                {[billingSettings.phone, billingSettings.email].filter(Boolean).join(" | ")}
              </p>
            )}
            {billingSettings.address && (
              <p className="mt-1 max-w-md whitespace-pre-line text-xs text-gray-600">
                {billingSettings.address}
              </p>
            )}
            {billingSettings.gstin && (
              <p className="mt-1 text-xs font-semibold text-gray-700">
                GSTIN: {billingSettings.gstin}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Payment Receipt
            </p>
            <p className="mt-1 text-xs text-gray-500">Receipt No</p>
            <p className="font-semibold">{receiptNumber(order, payment, billingSettings)}</p>
            {payment.voided && (
              <p className="mt-2 inline-block border border-black px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                Voided
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Order No</p>
          <p className="font-semibold">{order.orderNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">Invoice No</p>
          <p className="font-semibold">{invoiceNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">Customer Name</p>
          <p className="font-semibold">{customer?.name ?? "-"}</p>
        </div>
        <div>
          <p className="text-gray-500">Customer Phone</p>
          <p className="font-semibold">{customer?.phone ?? "-"}</p>
        </div>
        <div>
          <p className="text-gray-500">Payment Date</p>
          <p className="font-semibold">{formatDate(payment.paymentDate)}</p>
        </div>
        <div>
          <p className="text-gray-500">Payment Type</p>
          <p className="font-semibold">{payment.paymentType}</p>
        </div>
      </div>

      <div className="mt-8 border-y border-black py-5 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
          Amount Received
        </p>
        <p className="mt-2 text-3xl font-bold">{money(payment.amount)}</p>
        <p className="mt-1 text-sm text-gray-600">{payment.paymentMode}</p>
      </div>

      {payment.notes && (
        <div className="mt-5 text-sm">
          <p className="font-semibold text-gray-700">Notes</p>
          <p className="mt-1 text-gray-600">{payment.notes}</p>
        </div>
      )}

      {payment.voided && (
        <div className="mt-5 border border-black p-3 text-sm">
          <p className="font-semibold">Void Details</p>
          <p className="mt-1 text-gray-700">
            {payment.voidedAt ? `Voided on ${formatDate(payment.voidedAt.slice(0, 10))}` : "Voided"}
            {payment.voidReason ? ` - ${payment.voidReason}` : ""}
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Order Total</span>
            <span className="font-semibold">{money(order.totalAmount)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Paid To Date</span>
            <span className="font-semibold">{money(order.advancePaid)}</span>
          </div>
          <div className="flex justify-between border-t border-black py-1.5">
            <span className="font-semibold">Current Balance</span>
            <span className="font-bold">{money(order.balance)}</span>
          </div>
        </div>
      </div>

      <p className="mt-10 border-t border-gray-300 pt-4 text-center text-xs text-gray-600">
        {billingSettings.footerNote}
      </p>
    </PrintPageFrame>
  );
}

export default function PaymentReceiptPrintPage({
  params,
}: {
  params: { id: string; paymentId: string };
}) {
  return (
    <RequirePermission allOf={["orders.printCustomerReceipt", "orders.viewPayments"]}>
      <PaymentReceiptPrintPageContent params={params} />
    </RequirePermission>
  );
}
