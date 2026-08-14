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
import type { Customer, Order, OrderItemAddOn, Payment } from "@/lib/types";

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

const ROWS_PER_RECEIPT_PAGE = 12;
const RECEIPT_PRINT_PAGE_WIDTH_MM = 210;
const RECEIPT_PRINT_PAGE_HEIGHT_MM = 297;
const CUSTOMER_RECEIPT_WIDTH = "6in";
const CUSTOMER_RECEIPT_HEIGHT = "4in";
const CUSTOMER_RECEIPT_WIDTH_MM = 152.4;
const CUSTOMER_RECEIPT_HEIGHT_MM = 101.6;
const CUSTOMER_RECEIPT_PADDING_MM = 4;
const CUSTOMER_RECEIPT_CONTENT_WIDTH_MM = 132;
const CUSTOMER_RECEIPT_BARCODE_OPTIONS = {
  height: 32,
  moduleWidth: 1.35,
  quietZoneModules: 10,
};

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

function addOnReceiptQuantity(addOn: OrderItemAddOn, itemQty: number): number {
  const qty = typeof addOn.qty === "number" ? addOn.qty : Number(addOn.qty);
  return Number.isFinite(qty) && qty > 0 ? qty : itemQty;
}

function addOnReceiptRate(addOn: OrderItemAddOn): number {
  const rate = typeof addOn.rate === "number" ? addOn.rate : Number(addOn.rate);
  if (Number.isFinite(rate)) return rate;
  const qty = typeof addOn.qty === "number" ? addOn.qty : Number(addOn.qty);
  if (Number.isFinite(qty) && qty > 0) return addOn.amount / qty;
  return addOn.amount;
}

function addOnReceiptTotal(addOn: OrderItemAddOn, fallbackQty: number, fallbackRate: number): number {
  const total = typeof addOn.total === "number" ? addOn.total : Number(addOn.total);
  if (Number.isFinite(total)) return total;
  return fallbackQty * fallbackRate;
}

function normalizedTableAddOnLabel(label: string): string {
  return label.replace(/\s+-\s+\d+$/, "").trim();
}

function receiptRows(order: Order): ReceiptRow[] {
  const groups = new Map<string, { item: Extract<ReceiptRow, { type: "item" }>; addOns: Map<string, Extract<ReceiptRow, { type: "addon" }>> }>();
  for (const item of order.items) {
    const displayParticular = item.particular.trim();
    const groupKey = `${displayParticular.toLocaleLowerCase()}|${item.rate}`;
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
      const addOnQty = addOnReceiptQuantity(addOn, item.qty);
      const addOnRate = addOnReceiptRate(addOn);
      const addOnTotal = addOnReceiptTotal(addOn, addOnQty, addOnRate);
      const isTableAddOn = addOn.key.startsWith("table:");
      const normalizedLabel = isTableAddOn ? normalizedTableAddOnLabel(addOn.label) : addOn.label.trim();
      const addOnKey = isTableAddOn
        ? `${normalizedLabel.toLocaleLowerCase()}|${addOnRate}`
        : `${addOn.label.trim().toLocaleLowerCase()}|${addOnRate}`;
      const row =
        group.addOns.get(addOnKey) ??
        {
          type: "addon" as const,
          key: `addon-${groupKey}-${addOnKey}`,
          label: isTableAddOn ? normalizedLabel : addOn.label,
          qty: 0,
          rate: addOnRate,
          total: 0,
        };
      row.qty += addOnQty;
      row.total += addOnTotal;
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
  const barcodeMetrics = barcodeSvgMetrics(scanPayload, CUSTOMER_RECEIPT_BARCODE_OPTIONS);

  return (
    <section className="receipt-page">
      <div className="receipt-main-content">
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
      </div>

      <footer className="receipt-bottom-row">
        <div className="receipt-preprinted-reserved" aria-hidden="true" />
        <div className="receipt-barcode" aria-label={`Scan to open ${order.orderNumber}`}>
            <Image
              src={barcodeSvgDataUri(scanPayload, CUSTOMER_RECEIPT_BARCODE_OPTIONS)}
              alt=""
              width={barcodeMetrics.width}
              height={barcodeMetrics.height}
              unoptimized
            />
            <span>{order.orderNumber}</span>
          <small>{billingSettings.footerNote || "Please bring this receipt during pickup."}</small>
          {pageCount > 1 && (
            <span className="receipt-page-number">
              Page {pageNumber} of {pageCount}
            </span>
          )}
        </div>
        {canViewPayments && isFinalPage && (
          <div className="receipt-amount-summary">
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
          size: A4 portrait;
          margin: 0;
        }

        .receipt-preview-frame {
          width: ${RECEIPT_PRINT_PAGE_WIDTH_MM}mm;
          max-width: ${RECEIPT_PRINT_PAGE_WIDTH_MM}mm;
          padding: 0;
          background: transparent;
          box-shadow: none;
        }

        .receipt-print-page {
          position: relative;
          width: ${RECEIPT_PRINT_PAGE_WIDTH_MM}mm;
          height: ${RECEIPT_PRINT_PAGE_HEIGHT_MM}mm;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: white;
          break-after: page;
          page-break-after: always;
        }

        .receipt-print-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        .receipt-preview-frame {
          padding: 0;
          background: transparent;
          box-shadow: none;
        }

        .receipt-page {
          position: absolute;
          top: 0;
          left: 50%;
          width: ${CUSTOMER_RECEIPT_WIDTH};
          height: ${CUSTOMER_RECEIPT_HEIGHT};
          --customer-receipt-width-mm: ${CUSTOMER_RECEIPT_WIDTH_MM};
          --customer-receipt-height-mm: ${CUSTOMER_RECEIPT_HEIGHT_MM};
          --customer-receipt-content-width: ${CUSTOMER_RECEIPT_CONTENT_WIDTH_MM}mm;
          box-sizing: border-box;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: ${CUSTOMER_RECEIPT_PADDING_MM}mm 5mm;
          transform: translateX(-50%);
          background: white;
          color: #111827;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          contain: layout paint;
        }

        .receipt-main-content {
          width: 100%;
          max-width: var(--customer-receipt-content-width);
          margin: 0 auto;
          min-height: 0;
          overflow: hidden;
        }

        .receipt-header {
          display: grid;
          grid-template-columns: 1.25fr 1fr;
          gap: 3mm;
          border-bottom: 1px solid #111827;
          padding-bottom: 1mm;
        }

        .receipt-shop-name {
          font-size: 16px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }

        .receipt-tagline {
          margin-top: 1px;
          font-size: 7.5px;
          color: #4b5563;
        }

        .receipt-details {
          margin: 1mm 0 0;
          display: grid;
          gap: 0.4mm;
          font-size: 9.2px;
          line-height: 1.08;
        }

        .receipt-details div {
          display: grid;
          grid-template-columns: 17mm 1fr;
          gap: 1.5mm;
          min-width: 0;
          max-width: 100%;
        }

        .receipt-customer .receipt-details div {
          grid-template-columns: 12mm 1fr;
        }

        .receipt-barcode {
          display: flex;
          min-width: 35mm;
          max-width: 42mm;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 1px;
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
          max-width: 42mm;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 9px;
          line-height: 1.1;
          font-weight: 800;
          color: #111827;
        }

        .receipt-barcode small {
          max-width: 42mm;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 6.8px;
          line-height: 1;
          color: #4b5563;
        }

        .receipt-details dt {
          color: #4b5563;
          font-weight: 600;
        }

        .receipt-details dd {
          margin: 0;
          min-width: 0;
          overflow: hidden;
          overflow-wrap: anywhere;
          white-space: normal;
          font-weight: 700;
        }

        .receipt-body {
          min-height: 0;
          padding-top: 1mm;
          overflow: hidden;
        }

        .receipt-items {
          width: 100%;
          max-width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 10.8px;
          line-height: 1.14;
        }

        .receipt-items th {
          border-bottom: 1px solid #111827;
          padding: 1.5px 2px;
          text-align: left;
          font-size: 10px;
          font-weight: 800;
          overflow: hidden;
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
          padding: 1.8px 2px;
          vertical-align: top;
          border-bottom: 1px solid #e5e7eb;
          break-inside: avoid;
          overflow: hidden;
          overflow-wrap: anywhere;
        }

        .receipt-items td:first-child {
          font-weight: 650;
          white-space: normal;
        }

        .receipt-items .addon-row td {
          color: #4b5563;
          font-size: 9.6px;
          border-bottom-color: #f1f5f9;
        }

        .receipt-items .addon-row td:first-child {
          padding-left: 4mm;
          font-weight: 500;
        }

        .num {
          text-align: right !important;
          white-space: nowrap;
          overflow-wrap: normal !important;
        }

        .receipt-bottom-row {
          margin-top: auto;
          display: grid;
          width: 100%;
          max-width: var(--customer-receipt-content-width);
          margin-left: auto;
          margin-right: auto;
          grid-template-columns: minmax(42mm, 1fr) auto 34mm;
          column-gap: 4mm;
          align-items: end;
          border-top: 1px solid #111827;
          padding-top: 1mm;
          min-height: 0;
          overflow: hidden;
        }

        .receipt-preprinted-reserved {
          min-width: 42mm;
          min-height: 20mm;
        }

        .receipt-page-number {
          font-weight: 700;
          color: #111827;
        }

        .receipt-amount-summary {
          width: 34mm;
          justify-self: end;
          font-size: 9px;
          line-height: 1.08;
          text-align: right;
          overflow: hidden;
        }

        .receipt-amount-summary div {
          display: grid;
          grid-template-columns: 1fr;
          justify-items: end;
          padding: 0.5px 0;
        }

        .receipt-amount-summary span {
          color: #4b5563;
          white-space: nowrap;
        }

        .receipt-amount-summary strong {
          white-space: nowrap;
          font-weight: 800;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .receipt-amount-summary .balance {
          margin-top: 1px;
          border-top: 1px solid #111827;
          padding-top: 1px;
          font-size: 10px;
        }

        @media screen {
          .receipt-preview-frame {
            display: block;
          }

          .receipt-print-page {
            box-shadow: 0 10px 25px rgba(15, 23, 42, 0.16);
            outline: 1px solid #d1d5db;
          }

          .receipt-page {
            outline: 1px dashed #9ca3af;
          }
        }

        @media print {
          html,
          body {
            width: ${RECEIPT_PRINT_PAGE_WIDTH_MM}mm;
            height: ${RECEIPT_PRINT_PAGE_HEIGHT_MM}mm;
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
            width: ${RECEIPT_PRINT_PAGE_WIDTH_MM}mm !important;
            max-width: none !important;
          }

          .receipt-print-page {
            position: relative !important;
            width: ${RECEIPT_PRINT_PAGE_WIDTH_MM}mm !important;
            height: ${RECEIPT_PRINT_PAGE_HEIGHT_MM}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
          }

          .receipt-page {
            position: absolute !important;
            top: 0 !important;
            left: 50% !important;
            width: ${CUSTOMER_RECEIPT_WIDTH} !important;
            height: ${CUSTOMER_RECEIPT_HEIGHT} !important;
            margin: 0 !important;
            padding: ${CUSTOMER_RECEIPT_PADDING_MM}mm 5mm !important;
            box-shadow: none !important;
            transform: translateX(-50%) !important;
          }
        }
      `}</style>
      {pages.map((pageRows, index) => (
        <div className="receipt-print-page" key={index}>
          <ReceiptPage
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
        </div>
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
