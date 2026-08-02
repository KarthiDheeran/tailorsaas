"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  getOrderByIdAction,
  getPaymentsForOrderAction,
} from "@/app/(shell)/orders/actions";
import { getPrintableBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import { formatDate } from "@/components/orders/orders-table";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import { barcodeSvgDataUri, barcodeSvgMetrics } from "@/lib/barcode-code128";
import { formatCurrency } from "@/lib/currency";
import type { Customer, Order, Payment } from "@/lib/types";

type PaymentModeSummary =
  | { kind: "none" }
  | { kind: "single"; mode: string }
  | { kind: "multiple"; breakdown: { mode: string; amount: number }[] };

type ReceiptRow =
  | {
      type: "item";
      key: string;
      particular: string;
      qty: number;
      rate: number;
      total: number;
    }
  | {
      type: "addon";
      key: string;
      label: string;
      qty: number;
      rate: number;
      total: number;
    };

const ROWS_PER_RECEIPT_PAGE = 11;

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

function paymentModeLabel(summary: PaymentModeSummary) {
  if (summary.kind === "none") return "";
  if (summary.kind === "single") return summary.mode;
  return "Multiple";
}

function receiptRows(order: Order): ReceiptRow[] {
  const groups = new Map<string, { item: Extract<ReceiptRow, { type: "item" }>; addOns: Map<string, Extract<ReceiptRow, { type: "addon" }>> }>();
  for (const item of order.items) {
    const color = item.size?.trim() ?? "";
    const displayParticular = color ? `${item.particular} · ${color}` : item.particular;
    const groupKey = `${item.particular.trim().toLocaleLowerCase()}|${color.toLocaleLowerCase()}|${item.rate}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        item: { type: "item", key: `item-${groupKey}`, particular: displayParticular, qty: 0, rate: item.rate, total: 0 },
        addOns: new Map(),
      };
      groups.set(groupKey, group);
    }
    group.item.qty += item.qty;
    group.item.total += item.qty * item.rate;
    for (const addOn of item.addOns ?? []) {
      const addOnKey = `${addOn.label.trim().toLocaleLowerCase()}|${addOn.amount}`;
      const row = group.addOns.get(addOnKey) ?? { type: "addon" as const, key: `addon-${groupKey}-${addOnKey}`, label: addOn.label, qty: 0, rate: addOn.amount, total: 0 };
      row.qty += item.qty;
      row.total += item.qty * addOn.amount;
      group.addOns.set(addOnKey, row);
    }
  }
  return Array.from(groups.values()).flatMap((group) => [group.item, ...Array.from(group.addOns.values())]);
}

function paginateRows(rows: ReceiptRow[]) {
  const pages: ReceiptRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_RECEIPT_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_RECEIPT_PAGE));
  }
  return pages.length > 0 ? pages : [[]];
}

function ReceiptPage({
  order,
  customer,
  payments,
  billingSettings,
  scanPayload,
  rows,
  pageNumber,
  pageCount,
  canViewPayments,
}: {
  order: Order;
  customer: Customer | undefined;
  payments: Payment[];
  billingSettings: ShopBillingSettings;
  scanPayload: string;
  rows: ReceiptRow[];
  pageNumber: number;
  pageCount: number;
  canViewPayments: boolean;
}) {
  const modeSummary = summarizePaymentModes(payments);
  const modeLabel = paymentModeLabel(modeSummary);
  const isFinalPage = pageNumber === pageCount;
  const barcodeMetrics = barcodeSvgMetrics(scanPayload);

  return (
    <section className="receipt-page">
      <header className="receipt-header">
        <div className="receipt-shop">
          <div className="receipt-shop-name">{billingSettings.shopName || "NewLook"}</div>
          {billingSettings.tagline && (
            <div className="receipt-tagline">{billingSettings.tagline}</div>
          )}
          <dl className="receipt-details">
            <div>
              <dt>Order No</dt>
              <dd>{order.orderNumber}</dd>
            </div>
            <div>
              <dt>Order Date</dt>
              <dd>{formatDate(order.orderDate)}</dd>
            </div>
            <div>
              <dt>Delivery Date</dt>
              <dd>{formatDate(order.deliveryDate)}</dd>
            </div>
          </dl>
        </div>
        <div className="receipt-customer">
          <dl className="receipt-details">
            <div>
              <dt>Name</dt>
              <dd>{customer?.name ?? "-"}</dd>
            </div>
            <div>
              <dt>Mobile</dt>
              <dd>{customer?.phone ?? "-"}</dd>
            </div>
            {customer?.area && (
              <div>
                <dt>Area</dt>
                <dd>{customer.area}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <main className="receipt-body">
        <table className="receipt-items">
          <thead>
            <tr>
              <th>Particular</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.type === "item" ? (
                <tr key={row.key}>
                  <td>{row.particular}</td>
                  <td className="num">{row.qty}</td>
                  <td className="num">{formatCurrency(row.rate)}</td>
                  <td className="num">{formatCurrency(row.total)}</td>
                </tr>
              ) : (
                <tr key={row.key} className="addon-row">
                  <td>+ {row.label}</td>
                  <td className="num">{row.qty}</td>
                  <td className="num">{formatCurrency(row.rate)}</td>
                  <td className="num">{formatCurrency(row.total)}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </main>

      <footer className="receipt-footer">
        <div className="receipt-note">
          <div className="receipt-barcode" aria-label={`Scan to open ${order.orderNumber}`}>
            <Image
              src={barcodeSvgDataUri(scanPayload)}
              alt=""
              width={barcodeMetrics.width}
              height={barcodeMetrics.height}
              unoptimized
            />
            <span>{order.orderNumber}</span>
          </div>
          <span>{billingSettings.footerNote || "Please bring this receipt during pickup."}</span>
          {pageCount > 1 && (
            <span className="receipt-page-number">
              Page {pageNumber} of {pageCount}
            </span>
          )}
        </div>
        {canViewPayments && isFinalPage && (
          <div className="receipt-summary">
            <div>
              <span>Bill Amount</span>
              <strong>{formatCurrency(order.totalAmount)}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>{formatCurrency(order.advancePaid)}</strong>
            </div>
            <div className="balance">
              <span>Balance</span>
              <strong>{formatCurrency(order.balance)}</strong>
            </div>
            {modeLabel && (
              <div>
                <span>Payment Mode</span>
                <strong>{modeLabel}</strong>
              </div>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}

function CustomerReceiptPrintPageContent({
  params,
}: {
  params: { id: string };
}) {
  const { hasPermission } = useCurrentUser();
  useLanguage();
  const canViewPayments = hasPermission("orders.viewPayments");
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [payments, setPayments] = useState<Payment[]>([]);
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
    return () => {
      cancelled = true;
    };
  }, [params.id]);

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

  const pages = useMemo(() => {
    if (!order) return [[]] as ReceiptRow[][];
    return paginateRows(receiptRows(order));
  }, [order]);

  if (order === undefined) return null;
  if (order === null) notFound();

  const scanPayload = order.orderNumber;

  return (
    <PrintPageFrame showClose contentClassName="receipt-preview-frame">
      <style jsx global>{`
        @page {
          size: 6in 4in;
          margin: 0;
        }

        .receipt-preview-frame {
          width: 6in;
          max-width: 6in;
          padding: 0;
          background: transparent;
          box-shadow: none;
        }

        .receipt-page {
          width: 6in;
          height: 4in;
          box-sizing: border-box;
          overflow: hidden;
          break-after: page;
          page-break-after: always;
          display: grid;
          grid-template-rows: auto 1fr auto;
          padding: 0.22in 0.25in 0.18in;
          background: white;
          color: #111827;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .receipt-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        .receipt-header {
          display: grid;
          grid-template-columns: 1.25fr 1fr;
          gap: 0.14in;
          border-bottom: 1px solid #111827;
          padding-bottom: 0.04in;
        }

        .receipt-shop-name {
          font-size: 16px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: 0;
        }

        .receipt-tagline {
          margin-top: 2px;
          font-size: 7.5px;
          color: #4b5563;
        }

        .receipt-details {
          margin: 0.04in 0 0;
          display: grid;
          gap: 1px;
          font-size: 7.8px;
        }

        .receipt-details div {
          display: grid;
          grid-template-columns: 0.62in 1fr;
          gap: 0.05in;
          min-width: 0;
        }

        .receipt-customer .receipt-details div {
          grid-template-columns: 0.42in 1fr;
        }

        .receipt-barcode {
          margin-bottom: 0.03in;
          display: grid;
          gap: 2px;
          justify-items: center;
          overflow: visible;
          flex-shrink: 0;
        }

        .receipt-barcode img {
          display: block;
          width: auto;
          height: auto;
          max-width: none;
          object-fit: contain;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .receipt-barcode span {
          max-width: 2.6in;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.1;
          font-weight: 800;
          color: #111827;
        }

        .receipt-details dt {
          color: #4b5563;
          font-weight: 600;
        }

        .receipt-details dd {
          margin: 0;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 700;
        }

        .receipt-body {
          min-height: 0;
          padding-top: 0.04in;
        }

        .receipt-items {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 7.8px;
          line-height: 1.08;
        }

        .receipt-items th {
          border-bottom: 1px solid #111827;
          padding: 2px 2px;
          text-align: left;
          font-size: 8px;
          font-weight: 800;
        }

        .receipt-items th:first-child {
          width: 58%;
        }

        .receipt-items th:nth-child(2) {
          width: 10%;
        }

        .receipt-items th:nth-child(3),
        .receipt-items th:nth-child(4) {
          width: 16%;
        }

        .receipt-items td {
          padding: 2px 2px;
          vertical-align: top;
          border-bottom: 1px solid #e5e7eb;
          break-inside: avoid;
        }

        .receipt-items td:first-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 650;
        }

        .receipt-items .addon-row td {
          color: #4b5563;
          font-size: 7.2px;
          border-bottom-color: #f1f5f9;
        }

        .receipt-items .addon-row td:first-child {
          padding-left: 0.14in;
          font-weight: 500;
        }

        .num {
          text-align: right !important;
          white-space: nowrap;
        }

        .receipt-footer {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 0.1in;
          align-items: end;
          border-top: 1px solid #111827;
          padding-top: 0.04in;
        }

        .receipt-note {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 6.8px;
          color: #4b5563;
        }

        .receipt-page-number {
          font-weight: 700;
          color: #111827;
        }

        .receipt-summary {
          width: 1.45in;
          font-size: 7.6px;
        }

        .receipt-summary div {
          display: flex;
          justify-content: space-between;
          gap: 0.12in;
          padding: 1px 0;
        }

        .receipt-summary span {
          color: #4b5563;
          white-space: nowrap;
        }

        .receipt-summary strong {
          white-space: nowrap;
          font-weight: 800;
        }

        .receipt-summary .balance {
          margin-top: 2px;
          border-top: 1px solid #111827;
          padding-top: 2px;
          font-size: 8.6px;
        }

        @media screen {
          .receipt-preview-frame {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
          }

          .receipt-page {
            box-shadow: 0 10px 25px rgba(15, 23, 42, 0.16);
          }
        }

        @media print {
          html,
          body {
            width: 6in;
            min-height: 4in;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          * {
            animation: none !important;
            transition: none !important;
          }

          .receipt-preview-frame {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .receipt-page {
            box-shadow: none !important;
          }
        }
      `}</style>
      {pages.map((pageRows, index) => (
        <ReceiptPage
          key={index}
          order={order}
          customer={customer}
          payments={payments}
          billingSettings={billingSettings}
          scanPayload={scanPayload}
          rows={pageRows}
          pageNumber={index + 1}
          pageCount={pages.length}
          canViewPayments={canViewPayments}
        />
      ))}
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
