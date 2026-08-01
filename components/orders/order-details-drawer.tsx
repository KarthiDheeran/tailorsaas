"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  Mail,
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
  formatOptionalDate,
  OrderStatusEditor,
  PaymentStatusBadge,
} from "@/components/orders/orders-table";
import {
  getFinancialAdjustmentsForOrderAction,
  getOrderAttachmentsAction,
  getPaymentsForOrderAction,
} from "@/app/(shell)/orders/actions";
import { RecordPaymentModal } from "@/components/orders/record-payment-modal";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { isReceivableOrder } from "@/lib/order-finance";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { logWhatsAppMessageAction } from "@/app/(shell)/communications/actions";
import { formatCurrency } from "@/lib/currency";

function PrintMenu({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [openingPrint, setOpeningPrint] = useState<"receipt" | "job-card" | null>(null);
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");

  if (!canPrintReceipt) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
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
                  href={`/orders/${order.id}/print/customer`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setOpeningPrint("receipt");
                    window.setTimeout(() => {
                      setOpeningPrint(null);
                      setOpen(false);
                    }, 900);
                  }}
                  className="block px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-1.5">
                    {openingPrint === "receipt" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {openingPrint === "receipt" ? "Opening..." : t("orders.customerReceipt")}
                  </span>
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
  return formatCurrency(value);
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

function hasMeasurementSnapshot(item: Order["items"][number]) {
  return Object.values(item.measurements ?? {}).some((value) =>
    typeof value === "string" ? value.trim() !== "" : value !== null
  );
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
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
      <a
        href={buildWhatsAppUrl(customer.phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={logWhatsAppOpen}
        title="Share invoice on WhatsApp"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <WhatsAppIcon className="h-3.5 w-3.5" />
      </a>
      <a
        href={mailto}
        title="Share invoice by email"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
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
  onOrderUpdated,
}: {
  order: Order | null;
  // Phase 5A: resolved by the parent (which already fetched customers
  // server-side), rather than this drawer looking it up itself via the old
  // client-side lib/data/stub-data.ts import.
  customer: Customer | undefined;
  onClose: () => void;
  onStatusChange: () => void;
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
  const [openingEdit, setOpeningEdit] = useState(false);
  const [openingFullOrder, setOpeningFullOrder] = useState(false);
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

  const formattedTrialDate = formatOptionalDate(order?.trialDate);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          order ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-soft transition-transform duration-300 ease-in-out sm:w-[520px] lg:w-[560px] ${
          order ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {order && (
          <>
            <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between border-b border-border-soft bg-white px-6 py-4">
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
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
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
                {formattedTrialDate && (
                  <div>
                    <p className="text-[13px] font-medium text-ink-muted">
                      {t("orders.trialDate")}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {formattedTrialDate}
                    </p>
                  </div>
                )}
              </div>

              {(order.createdByOperatorName || order.measurementTakenByOperatorName || order.deliveredByOperatorName) && (
                <div className="rounded-lg border border-border-soft bg-surface-muted p-3">
                  <p className="text-[13px] font-semibold text-ink">Staff activity</p>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    {order.createdByOperatorName && <p className="text-ink-muted">Order created by <span className="font-semibold text-ink">{order.createdByOperatorName}</span></p>}
                    {order.measurementTakenByOperatorName && <p className="text-ink-muted">Measurements by <span className="font-semibold text-ink">{order.measurementTakenByOperatorName}</span></p>}
                    {order.deliveredByOperatorName && <p className="text-ink-muted">Delivered by <span className="font-semibold text-ink">{order.deliveredByOperatorName}</span></p>}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-muted">
                  {t("orders.items")}
                </p>
                <div className="overflow-hidden rounded-lg border border-border-soft">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-muted text-[12px] font-semibold text-ink-muted">
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
                            <div className="font-medium">{item.particular}{item.size?.trim() ? ` · ${item.size.trim()}` : ""}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {item.addOns && item.addOns.length > 0 && (
                                <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[11px] font-semibold text-primary">
                                  {item.addOns.length} add-ons
                                </span>
                              )}
                              {hasMeasurementSnapshot(item) && (
                                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                                  Measurements saved
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-ink-muted">
                            {item.qty}
                          </td>
                          {canViewPayments && (
                            <>
                              <td className="px-3 py-2 text-right text-ink-muted">
                                {formatCurrency(item.rate)}
                              </td>
                              <td className="px-3 py-2 text-right text-ink">
                                {formatCurrency(item.amount)}
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
                <div className="rounded-lg bg-surface-muted p-4">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">{t("common.total")}</span>
                    <span className="text-sm font-semibold text-ink">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">{t("common.paid")}</span>
                    <span className="text-sm font-semibold text-ink">
                      {formatCurrency(order.advancePaid)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">{t("common.balance")}</span>
                    <span className="text-sm font-semibold text-ink">
                      {formatCurrency(order.balance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-ink-muted">
                      {t("orders.paymentStatus")}
                    </span>
                    <PaymentStatusBadge order={order} />
                  </div>
                  {canRecordPayment && (
                    <div className="mt-3 space-y-2">
                      {isReceivableOrder(order) && (
                        <button
                          type="button"
                          onClick={() => setShowRecordModal(true)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary-tint px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          {t("orders.recordPayment")}
                        </button>
                      )}
                      <Link
                        href={`/orders/${order.id}#adjustments`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-primary hover:underline"
                      >
                        <SlidersHorizontal className="h-3 w-3" />
                        Manage adjustments
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {(payments.length > 0 || adjustments.length > 0 || attachments.length > 0) && (
                <div className="rounded-lg border border-border-soft bg-white p-4">
                  <p className="mb-3 text-[13px] font-medium text-ink-muted">
                    Details
                  </p>
                  <div className="space-y-2 text-sm">
                    {canViewPayments && payments.length > 0 && (
                      <Link
                        href={`/orders/${order.id}#payments`}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-ink transition-colors hover:bg-surface-muted"
                      >
                        <span>Payments</span>
                        <span className="font-semibold">{payments.length}</span>
                      </Link>
                    )}
                    {canViewPayments && adjustments.length > 0 && (
                      <Link
                        href={`/orders/${order.id}#adjustments`}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-ink transition-colors hover:bg-surface-muted"
                      >
                        <span>Adjustments</span>
                        <span className="font-semibold">{adjustments.length}</span>
                      </Link>
                    )}
                    {attachments.length > 0 && (
                      <Link
                        href={`/orders/${order.id}#attachments`}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-ink transition-colors hover:bg-surface-muted"
                      >
                        <span>Attachments</span>
                        <span className="font-semibold">{attachments.length}</span>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 space-y-3 border-t border-border-soft px-6 py-4">
              <Link
                href={`/orders/${order.id}`}
                onClick={() => setOpeningFullOrder(true)}
                aria-busy={openingFullOrder}
                className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
              >
                {openingFullOrder ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                {openingFullOrder ? "Opening..." : "View Full Order"}
              </Link>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <Link
                      href={`/orders/${order.id}/edit`}
                      onClick={() => setOpeningEdit(true)}
                      aria-busy={openingEdit}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
                    >
                      {openingEdit ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5" />
                      )}
                      {openingEdit ? "Opening..." : "Edit"}
                    </Link>
                  )}
                  <PrintMenu order={order} />
                </div>
                {customer && <InvoiceShareActions order={order} customer={customer} />}
              </div>
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
    </>
  );
}
