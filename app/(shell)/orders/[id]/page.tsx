"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  ChevronLeft,
  FileText,
  Pencil,
  Printer,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import {
  getFinancialAdjustmentsForOrderAction,
  getOrderAttachmentsAction,
  getOrderByIdAction,
  getPaymentsForOrderAction,
} from "@/app/(shell)/orders/actions";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import { EditOrderDrawer } from "@/components/orders/edit-order-drawer";
import { FinancialAdjustmentModal } from "@/components/orders/financial-adjustment-modal";
import { FinancialAdjustmentsList } from "@/components/orders/financial-adjustments-list";
import { OrderAttachmentsCard } from "@/components/orders/order-attachments-card";
import {
  BalanceBadge,
  formatDate,
  OrderStatusEditor,
  PaymentStatusBadge,
} from "@/components/orders/orders-table";
import { PaymentHistoryList } from "@/components/orders/payment-history-list";
import { RecordPaymentModal } from "@/components/orders/record-payment-modal";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";
import { measurementFieldLabel } from "@/lib/catalog";
import { isReceivableOrder } from "@/lib/order-finance";
import type {
  Customer,
  Order,
  OrderAttachment,
  OrderFinancialAdjustment,
  OrderItem,
  Payment,
} from "@/lib/types";

const MEASUREMENT_NOTES_KEY = "__measurementNotes";

function money(value: number) {
  return `Rs ${Number(value).toLocaleString("en-IN")}`;
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft"
    >
      <h2 className="mb-4 text-[17px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function measurementEntries(item: OrderItem) {
  const raw = item.measurements ?? {};
  return Object.entries(raw).filter(
    ([key, value]) => key !== MEASUREMENT_NOTES_KEY && value.trim() !== ""
  );
}

function measurementNotes(item: OrderItem) {
  return item.measurements?.[MEASUREMENT_NOTES_KEY]?.trim() ?? "";
}

function OrderDetailsPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canEdit = hasPermission("orders.edit");
  const canViewPayments = hasPermission("orders.viewPayments");
  const canRecordPayment = hasPermission("orders.recordPayment");
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const canPrintJobCard = hasPermission("orders.printJobCard");

  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<OrderFinancialAdjustment[]>([]);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [returningToOrders, setReturningToOrders] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  async function refreshOrder() {
    const refreshed = await getOrderByIdAction(params.id);
    if (refreshed) setOrder(refreshed);
    return refreshed;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const foundOrder = await getOrderByIdAction(params.id);
      if (cancelled) return;
      if (!foundOrder) {
        setOrder(null);
        setLoaded(true);
        return;
      }
      setOrder(foundOrder);
      const [foundCustomer, foundAttachments, foundPayments, foundAdjustments] =
        await Promise.all([
          getCustomerByIdAction(foundOrder.customerId),
          getOrderAttachmentsAction(foundOrder.id),
          canViewPayments ? getPaymentsForOrderAction(foundOrder.id) : Promise.resolve([]),
          canViewPayments
            ? getFinancialAdjustmentsForOrderAction(foundOrder.id)
            : Promise.resolve([]),
        ]);
      if (cancelled) return;
      setCustomer(foundCustomer);
      setAttachments(foundAttachments);
      setPayments(foundPayments);
      setAdjustments(foundAdjustments);
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id, canViewPayments]);

  if (loaded && !order) {
    notFound();
  }

  if (!loaded || !order) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <LoadingState label="Loading order details..." />
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const customerName = customer?.name ?? order.customerSnapshot?.name ?? t("common.unknown");
  const customerPhone = customer?.phone ?? order.customerSnapshot?.phone ?? "";
  const customerArea = customer?.area ?? order.customerSnapshot?.area ?? "";

  function handlePaymentChanged(result: { order: Order; payments: Payment[] }) {
    setOrder(result.order);
    setPayments(result.payments);
  }

  function handleAdjustmentChanged(result: {
    order: Order;
    payments: Payment[];
    adjustments: OrderFinancialAdjustment[];
  }) {
    setOrder(result.order);
    setPayments(result.payments);
    setAdjustments(result.adjustments);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <button
        type="button"
        onClick={() => {
          setReturningToOrders(true);
          router.push("/orders");
        }}
        disabled={returningToOrders}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
      >
        <ChevronLeft className="h-4 w-4" />
        {returningToOrders ? "Opening..." : t("orders.backToOrders")}
      </button>

      <div className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[26px] font-semibold text-ink">
                {order.orderNumber}
              </h1>
              <OrderStatusEditor order={order} onStatusChange={refreshOrder} />
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {customerName}
              {customerPhone ? ` · ${customerPhone}` : ""}
              {customerArea ? ` · ${customerArea}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("orders.editOrder")}
              </button>
            )}
            {canPrintReceipt && (
              <Link
                href={`/orders/${order.id}/print/customer`}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                <Printer className="h-3.5 w-3.5" />
                {t("orders.customerReceipt")}
              </Link>
            )}
            {canPrintJobCard && (
              <Link
                href={`/orders/${order.id}/print/job-card`}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                <FileText className="h-3.5 w-3.5" />
                {t("orders.tailorJobCard")}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Summary">
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-[13px] font-medium text-ink-muted">
                  {t("orders.orderDate")}
                </p>
                <p className="mt-1 font-semibold text-ink">
                  {formatDate(order.orderDate)}
                </p>
              </div>
              <div>
                <p className="text-[13px] font-medium text-ink-muted">
                  {t("orders.deliveryDate")}
                </p>
                <p className="mt-1 font-semibold text-ink">
                  {formatDate(order.deliveryDate)}
                </p>
              </div>
              {order.trialDate && (
                <div>
                  <p className="text-[13px] font-medium text-ink-muted">
                    {t("orders.trialDate")}
                  </p>
                  <p className="mt-1 font-semibold text-ink">
                    {formatDate(order.trialDate)}
                  </p>
                </div>
              )}
            </div>
            {order.deliveryPromiseNote && (
              <div className="mt-4 border-t border-border-soft pt-3">
                <p className="text-[13px] font-medium text-ink-muted">
                  Delivery Promise
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                  {order.deliveryPromiseNote}
                </p>
              </div>
            )}
          </Section>

          <Section title={t("orders.items")}>
            <div className="space-y-4">
              {order.items.map((item) => {
                const measurements = measurementEntries(item);
                const notes = measurementNotes(item);
                return (
                  <article
                    key={item.serialNo}
                    className="overflow-hidden rounded-lg border border-border-soft bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft bg-primary-tint/60 px-4 py-3">
                      <div>
                        <p className="font-semibold text-ink">
                          {item.serialNo}. {item.particular}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Qty {item.qty} · Rate {money(item.rate)} · Amount{" "}
                          {money(item.amount)}
                        </p>
                      </div>
                      {item.addOns && item.addOns.length > 0 && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary">
                          {item.addOns.length} add-ons
                        </span>
                      )}
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-[13px] font-medium text-ink-muted">
                            {t("orders.fabricSource")}
                          </p>
                          <p className="mt-1 text-ink">
                            {item.fabricSource ?? "Not specified"}
                          </p>
                        </div>
                        {item.fabricNotes && (
                          <div>
                            <p className="text-[13px] font-medium text-ink-muted">
                              {t("orders.fabricNotes")}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-ink">
                              {item.fabricNotes}
                            </p>
                          </div>
                        )}
                        {item.designNotes && (
                          <div>
                            <p className="text-[13px] font-medium text-ink-muted">
                              {t("orders.designNotes")}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-ink">
                              {item.designNotes}
                            </p>
                          </div>
                        )}
                      </div>

                      {item.addOns && item.addOns.length > 0 && (
                        <div className="border-t border-border-soft pt-3">
                          <p className="mb-2 text-[13px] font-medium text-ink-muted">
                            Add-ons
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {item.addOns.map((addOn) => (
                              <span
                                key={addOn.key}
                                className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted"
                              >
                                {addOn.label} · {money(addOn.amount)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {(measurements.length > 0 || notes) && (
                        <div className="border-t border-border-soft pt-3">
                          <p className="mb-2 text-[13px] font-medium text-ink-muted">
                            Measurement Snapshot
                          </p>
                          {measurements.length > 0 ? (
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                              {measurements.map(([key, value]) => (
                                <div key={key}>
                                  <dt className="text-[13px] text-ink-muted">
                                    {measurementFieldLabel(key)}
                                  </dt>
                                  <dd className="font-semibold text-ink">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="text-sm text-ink-muted">
                              No measurement fields saved.
                            </p>
                          )}
                          {notes && (
                            <div className="mt-3 border-t border-border-soft pt-2.5">
                              <p className="text-[13px] font-medium text-ink-muted">
                                Measurement Notes
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                                {notes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {(item.alterationIssue ||
                        item.alterationRequiredChange ||
                        item.alterationChargeType ||
                        item.linkedOriginalOrderId) && (
                        <div className="border-t border-border-soft pt-3 text-sm">
                          <p className="mb-2 text-[13px] font-medium text-ink-muted">
                            Alteration Details
                          </p>
                          {item.alterationIssue && (
                            <p className="text-ink-muted">
                              Original issue:{" "}
                              <span className="text-ink">{item.alterationIssue}</span>
                            </p>
                          )}
                          {item.alterationRequiredChange && (
                            <p className="text-ink-muted">
                              Required change:{" "}
                              <span className="text-ink">
                                {item.alterationRequiredChange}
                              </span>
                            </p>
                          )}
                          {item.alterationChargeType && (
                            <p className="text-ink-muted">
                              Charge:{" "}
                              <span className="text-ink">
                                {item.alterationChargeType}
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </Section>

          <Section id="attachments" title="Attachments">
            <OrderAttachmentsCard
              order={order}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              canEdit={canEdit}
            />
          </Section>
        </div>

        <div className="space-y-5">
          {canViewPayments && (
            <Section title={t("orders.paymentSummary")}>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{t("common.total")}</span>
                  <span className="font-semibold text-ink">
                    {money(order.totalAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{t("common.paid")}</span>
                  <span className="font-semibold text-ink">
                    {money(order.advancePaid)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{t("common.balance")}</span>
                  <span className="font-semibold text-ink">
                    {money(order.balance)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">
                    {t("orders.paymentStatus")}
                  </span>
                  <PaymentStatusBadge order={order} />
                </div>
                <div className="pt-1">
                  <BalanceBadge order={order} todayIso={todayIso} />
                </div>
              </div>
              {canRecordPayment && (
                <div className="mt-4 grid gap-2">
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
            </Section>
          )}

          {canViewPayments && (
            <Section id="adjustments" title="Adjustments">
              <FinancialAdjustmentsList
                order={order}
                adjustments={adjustments}
                onVoided={handleAdjustmentChanged}
              />
            </Section>
          )}

          {canViewPayments && (
            <Section id="payments" title={t("orders.paymentHistory")}>
              <PaymentHistoryList
                order={order}
                payments={payments}
                onVoided={handlePaymentChanged}
              />
            </Section>
          )}

          <Section title="Timeline">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Created</span>
                <span className="font-medium text-ink">
                  {order.createdAt ? formatDate(order.createdAt.slice(0, 10)) : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Last updated</span>
                <span className="font-medium text-ink">
                  {order.updatedAt ? formatDate(order.updatedAt.slice(0, 10)) : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Current status</span>
                <OrderStatusEditor order={order} onStatusChange={refreshOrder} />
              </div>
            </div>
          </Section>
        </div>
      </div>

      {editing && (
        <EditOrderDrawer
          order={order}
          customer={customer}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setOrder(updated);
            setEditing(false);
          }}
        />
      )}

      {showRecordModal && (
        <RecordPaymentModal
          order={order}
          onClose={() => setShowRecordModal(false)}
          onRecorded={(result) => {
            handlePaymentChanged(result);
            setShowRecordModal(false);
          }}
        />
      )}

      {showAdjustmentModal && (
        <FinancialAdjustmentModal
          order={order}
          onClose={() => setShowAdjustmentModal(false)}
          onRecorded={(result) => {
            handleAdjustmentChanged(result);
            setShowAdjustmentModal(false);
          }}
        />
      )}
    </div>
  );
}

export default function OrderDetailsPage({ params }: { params: { id: string } }) {
  return (
    <RequirePermission permission="orders.view">
      <OrderDetailsPageContent params={params} />
    </RequirePermission>
  );
}
