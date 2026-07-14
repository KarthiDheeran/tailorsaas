"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import type {
  Customer,
  Order,
  OrderAttachment,
  OrderFinancialAdjustment,
  Payment,
} from "@/lib/types";
import {
  formatDate,
  OrderStatusEditor,
  PaymentStatusBadge,
} from "@/components/orders/orders-table";
import {
  getFinancialAdjustmentsForOrderAction,
  getOrderAttachmentsAction,
  getPaymentsForOrderAction,
} from "@/app/(shell)/orders/actions";
import { RecordPaymentModal } from "@/components/orders/record-payment-modal";
import { PaymentHistoryList } from "@/components/orders/payment-history-list";
import { FinancialAdjustmentModal } from "@/components/orders/financial-adjustment-modal";
import { FinancialAdjustmentsList } from "@/components/orders/financial-adjustments-list";
import { OrderAttachmentsCard } from "@/components/orders/order-attachments-card";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { isReceivableOrder } from "@/lib/order-finance";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { logWhatsAppMessageAction } from "@/app/(shell)/communications/actions";

// Print routes are opened in the SAME tab (client-side <Link> navigation),
// not a new tab, deliberately: stub-data's in-memory orders/customers arrays
// only live in this browser tab's JS session (see lib/data/stub-data.ts) —
// a genuinely new tab would re-run from seed data and could show "order not
// found" for any order created this session. Same-tab Link navigation keeps
// the existing in-memory state intact.
function PrintMenu({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const canPrintJobCard = hasPermission("orders.printJobCard");

  if (!canPrintReceipt && !canPrintJobCard) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
      >
        <Printer className="h-3.5 w-3.5" />
        {t("orders.print")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute bottom-full right-0 z-20 mb-1 w-48 overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
            {canPrintReceipt && (
              <li>
                <Link
                  href={`/orders/${orderId}/print/customer`}
                  className="block px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface"
                >
                  {t("orders.customerReceipt")}
                </Link>
              </li>
            )}
            {canPrintJobCard && (
              <li>
                <Link
                  href={`/orders/${orderId}/print/job-card`}
                  className="block px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface"
                >
                  {t("orders.tailorJobCard")}
                </Link>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function money(value: number) {
  return `Rs ${Number(value).toLocaleString("en-IN")}`;
}

function receiptUrl(orderId: string) {
  if (typeof window === "undefined") return `/orders/${orderId}/print/customer`;
  return `${window.location.origin}/orders/${orderId}/print/customer`;
}

function buildInvoiceShareMessage(order: Order, customer: Customer, url: string) {
  const invoiceNumber = order.invoiceNumber ?? order.orderNumber;
  return [
    `Hi ${customer.name},`,
    `Invoice ${invoiceNumber} for order ${order.orderNumber}:`,
    `Total: ${money(order.totalAmount)}`,
    `Paid: ${money(order.advancePaid)}`,
    `Balance: ${money(order.balance)}`,
    `Delivery: ${formatDate(order.deliveryDate)}`,
    `Receipt: ${url}`,
  ].join("\n");
}

function InvoiceShareActions({
  order,
  customer,
}: {
  order: Order;
  customer: Customer;
}) {
  const url = receiptUrl(order.id);
  const message = buildInvoiceShareMessage(order, customer, url);
  const subject = `Invoice ${order.invoiceNumber ?? order.orderNumber}`;
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  function logWhatsAppOpen() {
    void logWhatsAppMessageAction({
      phone: customer.phone,
      message,
      contextType: "Payment",
      contextId: order.id,
      status: "Opened",
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <a
        href={`tel:${customer.phone}`}
        title="Call"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
      <a
        href={buildWhatsAppUrl(customer.phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={logWhatsAppOpen}
        title="Share invoice on WhatsApp"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
      <a
        href={mailto}
        title="Share invoice by email"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <Mail className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function OrderDetailsDrawer({
  order,
  customer,
  onClose,
  onStatusChange,
  onEdit,
  onOrderUpdated,
}: {
  order: Order | null;
  // Phase 5A: resolved by the parent (which already fetched customers
  // server-side), rather than this drawer looking it up itself via the old
  // client-side lib/data/stub-data.ts import.
  customer: Customer | undefined;
  onClose: () => void;
  onStatusChange: () => void;
  onEdit: (order: Order) => void;
  // Phase 7C: called with the freshly re-fetched Order after a payment is
  // recorded or voided (advance_paid/balance/payment_status all change via
  // the ledger trigger). The parent owns `order` as state (it's what gets
  // passed back in as this same prop), so updating there — rather than
  // this drawer holding a second, locally-synced copy — is what keeps this
  // drawer's own display and the page's OrdersTable/BalanceBadge correct
  // from a single source of truth, with no useEffect-based prop-mirroring.
  onOrderUpdated: (order: Order) => void;
}) {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canViewPayments = hasPermission("orders.viewPayments");
  const canRecordPayment = hasPermission("orders.recordPayment");
  const canEdit = hasPermission("orders.edit");

  const [payments, setPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<OrderFinancialAdjustment[]>([]);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const orderId = order?.id;

  useEffect(() => {
    if (!order || !canViewPayments) {
      setPayments([]);
      setAdjustments([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      getPaymentsForOrderAction(order.id),
      getFinancialAdjustmentsForOrderAction(order.id),
    ]).then(([paymentResult, adjustmentResult]) => {
      if (!cancelled) {
        setPayments(paymentResult);
        setAdjustments(adjustmentResult);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, canViewPayments]);

  useEffect(() => {
    if (!orderId) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    getOrderAttachmentsAction(orderId).then((result) => {
      if (!cancelled) setAttachments(result);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function handlePaymentChanged(result: { order: Order; payments: Payment[] }) {
    setPayments(result.payments);
    onOrderUpdated(result.order);
  }

  function handleAdjustmentChanged(result: {
    order: Order;
    payments: Payment[];
    adjustments: OrderFinancialAdjustment[];
  }) {
    setPayments(result.payments);
    setAdjustments(result.adjustments);
    onOrderUpdated(result.order);
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          order ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft transition-transform duration-300 ease-in-out sm:w-[420px] ${
          order ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {order && (
          <>
            <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
              <div>
                <p className="text-[17px] font-semibold text-ink">
                  {order.orderNumber}
                </p>
                <div className="mt-1.5">
                  <OrderStatusEditor
                    order={order}
                    onStatusChange={onStatusChange}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 px-6 py-5">
              <div>
                <p className="text-[13px] font-medium text-ink-muted">
                  {t("orders.customer")}
                </p>
                {customer ? (
                  <Link
                    href={`/customers/${customer.id}`}
                    className="mt-1 block text-sm font-semibold text-ink hover:text-primary hover:underline"
                  >
                    {customer.name}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-ink">{t("common.unknown")}</p>
                )}
                {customer && (
                  <p className="text-sm text-ink-muted">{customer.phone}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[13px] font-medium text-ink-muted">
                    {t("orders.orderDate")}
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {formatDate(order.orderDate)}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-ink-muted">
                    {t("orders.deliveryDate")}
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {formatDate(order.deliveryDate)}
                  </p>
                </div>
                {order.deliveryPromiseNote && (
                  <div className="sm:col-span-2">
                    <p className="text-[13px] font-medium text-ink-muted">
                      Delivery Promise
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                      {order.deliveryPromiseNote}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-muted">
                  {t("orders.items")}
                </p>
                <div className="overflow-hidden rounded-lg border border-border-soft">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface text-[12px] font-semibold text-ink-muted">
                      <tr>
                        <th className="px-3 py-2">{t("orders.particular")}</th>
                        <th className="px-3 py-2 text-right">{t("common.qty")}</th>
                        {canViewPayments && (
                          <>
                            <th className="px-3 py-2 text-right">{t("common.rate")}</th>
                            <th className="px-3 py-2 text-right">{t("common.amount")}</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr
                          key={item.serialNo}
                          className="border-t border-border-soft"
                        >
                          <td className="px-3 py-2 text-ink">
                            {item.particular}
                            {(item.fabricSource && item.fabricSource !== "Not specified") ||
                            item.fabricNotes ||
                            item.designNotes ||
                            item.alterationIssue ||
                            item.alterationRequiredChange ||
                            item.alterationChargeType ||
                            item.linkedOriginalOrderId ? (
                              <div className="mt-1 space-y-0.5 text-xs text-ink-muted">
                                {item.fabricSource && item.fabricSource !== "Not specified" && (
                                  <div>{t("orders.fabricSource")}: {item.fabricSource}</div>
                                )}
                                {item.fabricNotes && (
                                  <div>{t("orders.fabricNotes")}: {item.fabricNotes}</div>
                                )}
                                {item.designNotes && (
                                  <div>{t("orders.designNotes")}: {item.designNotes}</div>
                                )}
                                {item.alterationIssue && (
                                  <div>Original issue: {item.alterationIssue}</div>
                                )}
                                {item.alterationRequiredChange && (
                                  <div>Required change: {item.alterationRequiredChange}</div>
                                )}
                                {item.alterationChargeType && (
                                  <div>Alteration charge: {item.alterationChargeType}</div>
                                )}
                                {item.linkedOriginalOrderId && (
                                  <div>Linked original order: {item.linkedOriginalOrderId}</div>
                                )}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-muted">
                            {item.qty}
                          </td>
                          {canViewPayments && (
                            <>
                              <td className="px-3 py-2 text-right text-ink-muted">
                                ₹{item.rate.toLocaleString("en-IN")}
                              </td>
                              <td className="px-3 py-2 text-right text-ink">
                                ₹{item.amount.toLocaleString("en-IN")}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {canViewPayments && (
                <div className="rounded-lg bg-surface p-4">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">{t("common.total")}</span>
                    <span className="text-sm font-semibold text-ink">
                      ₹{order.totalAmount.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">{t("common.paid")}</span>
                    <span className="text-sm font-semibold text-ink">
                      ₹{order.advancePaid.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">{t("common.balance")}</span>
                    <span className="text-sm font-semibold text-ink">
                      ₹{order.balance.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">
                      {t("orders.paymentStatus")}
                    </span>
                    <PaymentStatusBadge order={order} />
                  </div>
                  {canRecordPayment && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {isReceivableOrder(order) && (
                        <button
                          type="button"
                          onClick={() => setShowRecordModal(true)}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary-tint px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          {t("orders.recordPayment")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAdjustmentModal(true)}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Adjustment
                      </button>
                    </div>
                  )}
                </div>
              )}

              {canViewPayments && (
                <>
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-ink-muted">
                      Adjustments
                    </p>
                    <FinancialAdjustmentsList
                      order={order}
                      adjustments={adjustments}
                      onVoided={handleAdjustmentChanged}
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-[13px] font-medium text-ink-muted">
                      {t("orders.paymentHistory")}
                    </p>
                    <PaymentHistoryList
                      order={order}
                      payments={payments}
                      onVoided={handlePaymentChanged}
                    />
                  </div>
                </>
              )}

              <OrderAttachmentsCard
                order={order}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                canEdit={canEdit}
              />
            </div>

            <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(order)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("orders.editOrder")}
                </button>
              )}
              <PrintMenu orderId={order.id} />
              {customer && (
                <InvoiceShareActions order={order} customer={customer} />
              )}
            </div>
          </>
        )}
      </div>
      {order && showRecordModal && (
        <RecordPaymentModal
          order={order}
          onClose={() => setShowRecordModal(false)}
          onRecorded={(result) => {
            handlePaymentChanged(result);
            setShowRecordModal(false);
          }}
        />
      )}
      {order && showAdjustmentModal && (
        <FinancialAdjustmentModal
          order={order}
          onClose={() => setShowAdjustmentModal(false)}
          onRecorded={(result) => {
            handleAdjustmentChanged(result);
            setShowAdjustmentModal(false);
          }}
        />
      )}
    </>
  );
}
