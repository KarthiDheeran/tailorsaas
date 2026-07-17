"use client";

import { useEffect, useRef, useState } from "react";
import type { Customer, Order, OrderAttachment, OrderStatus } from "@/lib/types";
import type { CatalogAddOn, CatalogGarmentType } from "@/lib/catalog";
import { getAddOnsAction, getGarmentTypesAction } from "@/app/(shell)/catalog/actions";
import { saveGarmentMeasurementAction } from "@/app/(shell)/customers/actions";
import { updateOrderAction } from "@/app/(shell)/orders/actions";
import {
  BalanceBadge,
  getAvailableOrderStatuses,
  ORDER_STATUS_LABEL_KEYS,
} from "@/components/orders/orders-table";
import {
  countFilledFields,
  measurementValuesOnly,
} from "@/components/orders/garment-measurement-modal";
import {
  blankDraftItem,
  computeOrderItems,
  NewOrderItemsCard,
  orderItemToDraftItem,
  type DraftItem,
} from "@/components/orders/new-order-items-card";
import {
  detachEditableOrderAttachments,
  makeEditableOrderAttachment,
  OrderAttachmentDraftCard,
  persistEditableOrderAttachments,
  uploadQueuedOrderAttachments,
  type AttachmentItemOption,
  type EditableOrderAttachment,
  type QueuedOrderAttachment,
} from "@/components/orders/order-attachment-draft-card";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function customerArea(customer: Customer | undefined, order: Order) {
  return customer?.area || order.customerSnapshot?.area || "-";
}

function customerName(customer: Customer | undefined, order: Order) {
  return customer?.name || order.customerSnapshot?.name || "Unknown customer";
}

function customerPhone(customer: Customer | undefined, order: Order) {
  return customer?.phone || order.customerSnapshot?.phone || "-";
}

export function EditOrderForm({
  order,
  customer,
  initialAttachments = [],
  onCancel,
  onSaved,
}: {
  order: Order;
  customer: Customer | undefined;
  initialAttachments?: OrderAttachment[];
  onCancel: () => void;
  onSaved: (order: Order) => void;
}) {
  const { hasPermission, effectivePermissions } = useCurrentUser();
  const { t } = useLanguage();
  const canViewPayments = hasPermission("orders.viewPayments");
  const availableStatuses = getAvailableOrderStatuses(effectivePermissions);

  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [addOns, setAddOns] = useState<CatalogAddOn[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [orderDate, setOrderDate] = useState(order.orderDate);
  const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate);
  const [trialDate, setTrialDate] = useState(order.trialDate ?? "");
  const [deliveryPromiseNote, setDeliveryPromiseNote] = useState(
    order.deliveryPromiseNote ?? ""
  );
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [items, setItems] = useState<DraftItem[]>([blankDraftItem()]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existingAttachments, setExistingAttachments] = useState<
    EditableOrderAttachment[]
  >([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedOrderAttachment[]>([]);
  const attachmentsSectionRef = useRef<HTMLDivElement | null>(null);
  const [highlightAttachments, setHighlightAttachments] = useState(false);

  const initialEditableAttachments = initialAttachments.map((attachment) => {
    const editable = makeEditableOrderAttachment(attachment);
    if (!attachment.orderItemId && attachment.orderItemSerialNo) {
      const item = order.items.find(
        (candidate) => candidate.serialNo === attachment.orderItemSerialNo
      );
      if (item?.id) editable.orderItemKey = `item-${item.id}`;
    }
    return editable;
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGarmentTypesAction(), getAddOnsAction()]).then(
      ([garments, allAddOns]) => {
        if (cancelled) return;
        setGarmentTypes(garments);
        setAddOns(allAddOns);
        setCatalogLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOrderDate(order.orderDate);
    setDeliveryDate(order.deliveryDate);
    setTrialDate(order.trialDate ?? "");
    setDeliveryPromiseNote(order.deliveryPromiseNote ?? "");
    setStatus(order.status);
  }, [order]);

  useEffect(() => {
    if (!catalogLoaded) return;
    setItems(order.items.map((item) => orderItemToDraftItem(item, garmentTypes, addOns)));
  }, [order, catalogLoaded, garmentTypes, addOns]);

  useEffect(() => {
    setExistingAttachments(initialEditableAttachments);
    setRemovedAttachmentIds([]);
    setQueuedAttachments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAttachments]);

  useEffect(() => {
    if (!catalogLoaded || window.location.hash !== "#attachments") return;
    const section = attachmentsSectionRef.current;
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.focus({ preventScroll: true });
    setHighlightAttachments(true);
    const timeout = window.setTimeout(() => setHighlightAttachments(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [catalogLoaded]);

  const { computedItems, totalAmount } = computeOrderItems(items, garmentTypes, addOns);
  const balance = totalAmount - order.advancePaid;
  const validItems = computedItems.filter(
    (it, i) => items[i].garmentTypeId && it.qty > 0 && it.rate >= 0
  );
  const attachmentItemOptions: AttachmentItemOption[] = [];
  const originalAttachmentItemOptions: AttachmentItemOption[] = order.items.map((item) => ({
    key: item.id ? `item-${item.id}` : `saved-${item.serialNo}`,
    label: `Item ${item.serialNo} — ${item.particular}`,
    orderItemId: item.id,
    serialNo: item.serialNo,
  }));
  let predictedSerialNo = 1;
  items.forEach((item, index) => {
    const computed = computedItems[index];
    const valid = item.garmentTypeId && computed.qty > 0 && computed.rate >= 0;
    const label = computed.particular || `Item ${index + 1}`;
    attachmentItemOptions.push({
      key: item.draftKey,
      label: `Item ${index + 1} — ${label}`,
      orderItemId: item.orderItemId,
      serialNo: valid ? predictedSerialNo : undefined,
    });
    if (valid) predictedSerialNo += 1;
  });
  const activeExistingAttachments = existingAttachments.filter(
    (attachment) => !removedAttachmentIds.includes(attachment.id)
  );
  const attachmentValidationError =
    queuedAttachments.find((attachment) => attachment.error)?.error ??
    ([...queuedAttachments, ...activeExistingAttachments].some(
      (attachment) =>
        attachment.orderItemKey &&
        !attachmentItemOptions.some((option) => option.key === attachment.orderItemKey)
    )
      ? "Reassign or remove attachments linked to deleted items."
      : [...queuedAttachments, ...activeExistingAttachments].some(
            (attachment) =>
              attachment.orderItemKey &&
              !attachmentItemOptions.find((option) => option.key === attachment.orderItemKey)
                ?.serialNo
          )
        ? "Attachments can only be linked to valid garment items."
        : undefined);
  const orderDateError = !orderDate ? "Order date is required." : undefined;
  const deliveryDateError = !deliveryDate
    ? "Delivery date is required."
    : deliveryDate < orderDate
      ? "Delivery date cannot be before order date."
      : undefined;
  const trialDateError =
    trialDate && orderDate && trialDate < orderDate
      ? "Trial date cannot be before order date."
      : trialDate && deliveryDate && trialDate > deliveryDate
        ? "Trial date cannot be after delivery date."
        : undefined;
  const itemsError =
    validItems.length === 0 ? "Select at least one valid garment item." : undefined;
  const hasErrors =
    !!orderDateError ||
    !!deliveryDateError ||
    !!trialDateError ||
    !!itemsError ||
    !!attachmentValidationError;
  const draftOrder: Order = {
    ...order,
    orderDate,
    trialDate,
    deliveryDate: deliveryDate || "9999-12-31",
    deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
    items: computedItems,
    totalAmount,
    balance,
    status,
  };

  const isDirty =
    orderDate !== order.orderDate ||
    deliveryDate !== order.deliveryDate ||
    trialDate !== (order.trialDate ?? "") ||
    deliveryPromiseNote !== (order.deliveryPromiseNote ?? "") ||
    status !== order.status ||
    queuedAttachments.length > 0 ||
    removedAttachmentIds.length > 0 ||
    JSON.stringify(existingAttachments) !==
      JSON.stringify(initialEditableAttachments) ||
    (catalogLoaded &&
      JSON.stringify(items) !==
        JSON.stringify(
          order.items.map((item) => orderItemToDraftItem(item, garmentTypes, addOns))
        ));

  function handleCancel() {
    if (isDirty && !window.confirm(t("orders.discardChanges"))) return;
    onCancel();
  }

  async function persistExplicitDefaultMeasurements(customerId: string) {
    const profileUpdateCounts = new Map<string, number>();
    for (let i = 0; i < items.length; i += 1) {
      const draft = items[i].measurement;
      if (!draft?.updateCustomerMeasurements) continue;
      if (countFilledFields(draft) === 0) continue;
      const item = computedItems[i];
      if (!item?.particular) continue;
      profileUpdateCounts.set(
        item.particular,
        (profileUpdateCounts.get(item.particular) ?? 0) + 1
      );
    }
    const duplicate = Array.from(profileUpdateCounts.entries()).find(
      ([, count]) => count > 1
    );
    if (duplicate) {
      return `Choose only one ${duplicate[0]} item to update the customer's saved measurements.`;
    }

    for (let i = 0; i < items.length; i += 1) {
      const draft = items[i].measurement;
      const item = computedItems[i];
      if (!draft?.updateCustomerMeasurements || !item?.particular) continue;
      if (countFilledFields(draft) === 0) continue;
      const result = await saveGarmentMeasurementAction({
        customerId,
        garmentType: item.particular,
        values: measurementValuesOnly(draft.values),
        fitNotes: "",
        notes: draft.notes,
        source: "Edit order",
      });
      if (!result.success) return result.error;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setError(null);
    setAttachmentError(null);
    if (hasErrors) return;
    setSubmitting(true);

    const detachFailures = await detachEditableOrderAttachments(existingAttachments);
    if (detachFailures.length > 0) {
      setSubmitting(false);
      setAttachmentError(detachFailures.join("; "));
      return;
    }

    const updated = await updateOrderAction(order.id, {
      orderDate,
      trialDate,
      deliveryDate,
      deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
      items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
      status,
    });
    if (!updated.success) {
      await persistEditableOrderAttachments({
        attachments: existingAttachments,
        removedIds: [],
        itemOptions: originalAttachmentItemOptions,
      });
      setSubmitting(false);
      setError(updated.error);
      return;
    }

    if (customer) {
      const measurementError = await persistExplicitDefaultMeasurements(customer.id);
      if (measurementError) {
        setSubmitting(false);
        setError(
          `Order was saved, but customer default measurements were not updated: ${measurementError}`
        );
        return;
      }
    }

    const savedAttachmentItemOptions = attachmentItemOptions.map((option) => {
      const savedItem = option.serialNo
        ? updated.data.items.find((item) => item.serialNo === option.serialNo)
        : undefined;
      return {
        ...option,
        orderItemId: savedItem?.id,
        serialNo: savedItem?.serialNo ?? option.serialNo,
      };
    });

    const attachmentFailures = [
      ...(await persistEditableOrderAttachments({
        attachments: activeExistingAttachments,
        removedIds: removedAttachmentIds,
        itemOptions: savedAttachmentItemOptions,
      })),
      ...(await uploadQueuedOrderAttachments({
        orderId: updated.data.id,
        queued: queuedAttachments,
        itemOptions: savedAttachmentItemOptions,
      })),
    ];
    if (attachmentFailures.length > 0) {
      setSubmitting(false);
      setAttachmentError(
        `Order was saved, but some attachment changes failed: ${attachmentFailures.join("; ")}`
      );
      return;
    }

    setSubmitting(false);
    onSaved(updated.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-24">
      {error && (
        <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[17px] font-semibold text-ink">
            {t("orders.customer")}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-ink-muted">Status</span>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="h-9 py-0 text-xs font-semibold"
            >
              {(availableStatuses.includes(status)
                ? availableStatuses
                : [status, ...availableStatuses]
              ).map((s) => (
                <option key={s} value={s}>
                  {t(ORDER_STATUS_LABEL_KEYS[s])}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary-tint px-4 py-3">
          <div className="font-semibold text-ink">
            {customerName(customer, order)}
          </div>
          <div className="mt-1 text-sm text-ink-muted">
            {customerPhone(customer, order)} - {customerArea(customer, order)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <h3 className="mb-4 text-[17px] font-semibold text-ink">
          {t("orders.orderDates")}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              {t("orders.orderDate")}
            </span>
            <input
              type="date"
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className={cn(
                inputClass,
                submitAttempted && orderDateError && "border-chip-red-fg"
              )}
            />
            {submitAttempted && orderDateError && (
              <p className="text-xs text-chip-red-fg">{orderDateError}</p>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              {t("orders.deliveryDate")} <span className="text-chip-red-fg">*</span>
            </span>
            <input
              type="date"
              required
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={cn(
                inputClass,
                submitAttempted && deliveryDateError && "border-chip-red-fg"
              )}
            />
            {submitAttempted && deliveryDateError && (
              <p className="text-xs text-chip-red-fg">{deliveryDateError}</p>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              {t("orders.trialDate")}{" "}
              <span className="font-normal">({t("common.optional")})</span>
            </span>
            <input
              type="date"
              value={trialDate}
              onChange={(e) => setTrialDate(e.target.value)}
              className={cn(
                inputClass,
                submitAttempted && trialDateError && "border-chip-red-fg"
              )}
            />
            {submitAttempted && trialDateError && (
              <p className="text-xs text-chip-red-fg">{trialDateError}</p>
            )}
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-3">
            <span className="text-[13px] font-medium text-ink-muted">
              Delivery Promise Note
            </span>
            <textarea
              value={deliveryPromiseNote}
              onChange={(e) => setDeliveryPromiseNote(e.target.value)}
              rows={2}
              placeholder="Verbal promise, pickup timing, urgency, customer expectation..."
              className="min-h-[44px] rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </label>
        </div>
      </div>

      {catalogLoaded ? (
        <>
          <NewOrderItemsCard
            customerId={customer?.id ?? order.customerId}
            items={items}
            onItemsChange={setItems}
            garmentTypes={garmentTypes}
            addOns={addOns}
            autoSnapshotDefaultMeasurements
          />
          {submitAttempted && itemsError && (
            <p className="-mt-3 text-sm font-medium text-chip-red-fg">{itemsError}</p>
          )}
        </>
      ) : (
        <LoadingState label="Loading order items..." />
      )}

      <div
        id="attachments"
        ref={attachmentsSectionRef}
        tabIndex={-1}
        className={cn(
          "scroll-mt-6 rounded-xl outline-none transition-shadow",
          highlightAttachments && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
      >
        <OrderAttachmentDraftCard
          itemOptions={attachmentItemOptions}
          existing={existingAttachments}
          onExistingChange={setExistingAttachments}
          removedExistingIds={removedAttachmentIds}
          onRemovedExistingIdsChange={setRemovedAttachmentIds}
          queued={queuedAttachments}
          onQueuedChange={setQueuedAttachments}
          error={(submitAttempted && attachmentValidationError) || attachmentError}
        />
      </div>

      {canViewPayments && (
        <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
          <h3 className="mb-4 text-[17px] font-semibold text-ink">
            {t("orders.paymentSummary")}
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("common.total")}</span>
              <span className="font-semibold text-ink">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("common.paid")}</span>
              <span className="font-semibold text-ink">
                {formatCurrency(order.advancePaid)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("common.balance")}</span>
              <span className="font-semibold text-ink">
                {formatCurrency(balance)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("orders.paymentStatus")}</span>
              <BalanceBadge order={draftOrder} todayIso={todayIso()} />
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-soft bg-white/95 px-4 py-3 shadow-soft backdrop-blur lg:left-[250px]">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <button
            type="submit"
            disabled={submitting || !catalogLoaded}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? "Saving..." : t("common.saveChanges")}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </form>
  );
}
