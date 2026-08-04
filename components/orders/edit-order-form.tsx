"use client";

import { useEffect, useRef, useState } from "react";
import type { Customer, Order, OrderAttachment, OrderStatus } from "@/lib/types";
import type { CatalogAddOn, CatalogGarmentType, GarmentTypeConfiguration } from "@/lib/catalog";
import {
  getAddOnsAction,
  getGarmentTypeConfigurationsAction,
  getGarmentTypesAction,
} from "@/app/(shell)/catalog/actions";
import { saveGarmentMeasurementAction } from "@/app/(shell)/customers/actions";
import { updateOrderAction } from "@/app/(shell)/orders/actions";
import { getOrderPricingBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
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
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import { getOrderTaxBreakdown } from "@/lib/order-tax";
import { cn } from "@/lib/utils";
import {
  readGarmentConfigurationCache,
  writeGarmentConfigurationCache,
} from "@/lib/garment-configuration-browser-cache";

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
  initialGarmentTypes,
  initialAddOns,
  initialGarmentConfigurations,
  initialBillingSettings,
  onCancel,
  onSaved,
}: {
  order: Order;
  customer: Customer | undefined;
  initialAttachments?: OrderAttachment[];
  initialGarmentTypes?: CatalogGarmentType[];
  initialAddOns?: CatalogAddOn[];
  initialGarmentConfigurations?: GarmentTypeConfiguration[];
  initialBillingSettings?: ShopBillingSettings;
  onCancel: () => void;
  onSaved: (order: Order) => void;
}) {
  const { hasPermission, effectivePermissions } = useCurrentUser();
  const { t } = useLanguage();
  const canViewPayments = hasPermission("orders.viewPayments");
  const availableStatuses = getAvailableOrderStatuses(effectivePermissions);

  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>(initialGarmentTypes ?? []);
  const [addOns, setAddOns] = useState<CatalogAddOn[]>(initialAddOns ?? []);
  const [garmentConfigurations, setGarmentConfigurations] = useState<GarmentTypeConfiguration[]>(initialGarmentConfigurations ?? []);
  const [catalogLoaded, setCatalogLoaded] = useState(Boolean(initialGarmentTypes && initialAddOns && initialGarmentConfigurations));
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
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings>(
    initialBillingSettings ?? DEFAULT_SHOP_BILLING_SETTINGS
  );

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
    if (initialGarmentTypes && initialAddOns && initialGarmentConfigurations) {
      setGarmentTypes(initialGarmentTypes);
      setAddOns(initialAddOns);
      setGarmentConfigurations(initialGarmentConfigurations);
      setBillingSettings(initialBillingSettings ?? DEFAULT_SHOP_BILLING_SETTINGS);
      setCatalogLoaded(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      getGarmentTypesAction(),
      getAddOnsAction(),
      getOrderPricingBillingSettingsAction(),
    ]).then(
      async ([garments, allAddOns, settings]) => {
        const garmentIds = garments.map((garment) => garment.id);
        const cachedConfigurations = readGarmentConfigurationCache();
        const cacheCoversActiveGarments =
          cachedConfigurations !== null &&
          garmentIds.every((id) => cachedConfigurations.some((item) => item.garment.id === id));
        const configurations = cacheCoversActiveGarments
          ? cachedConfigurations
          : await getGarmentTypeConfigurationsAction(garmentIds);
        if (cancelled) return;
        setGarmentTypes(garments);
        setAddOns(allAddOns);
        setGarmentConfigurations(configurations);
        setBillingSettings(settings);
        setCatalogLoaded(true);
        if (!cacheCoversActiveGarments) writeGarmentConfigurationCache(configurations);
        if (cacheCoversActiveGarments) {
          getGarmentTypeConfigurationsAction(garmentIds).then((freshConfigurations) => {
            if (cancelled) return;
            setGarmentConfigurations(freshConfigurations);
            writeGarmentConfigurationCache(freshConfigurations);
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [initialAddOns, initialBillingSettings, initialGarmentConfigurations, initialGarmentTypes]);

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

  const { computedItems, totalAmount: taxableSubtotal } = computeOrderItems(
    items,
    garmentTypes,
    addOns
  );
  const taxBreakdown = getOrderTaxBreakdown(taxableSubtotal, billingSettings);
  const totalAmount = taxBreakdown?.totalWithTax ?? taxableSubtotal;
  const balance = totalAmount - order.advancePaid;
  const validItems = computedItems.filter(
    (it, i) => items[i].garmentTypeId && it.qty > 0 && it.rate >= 0
  );
  const attachmentItemOptions: AttachmentItemOption[] = [];
  const originalAttachmentItemOptions: AttachmentItemOption[] = order.items.map((item) => ({
    key: item.id ? `item-${item.id}` : `saved-${item.serialNo}`,
    label: `Item ${item.serialNo} - ${item.particular}`,
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
      label: `Item ${index + 1} - ${label}`,
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
  const itemsError =
    validItems.length === 0 ? "Select at least one valid garment item." : undefined;
  const hasErrors =
    !!orderDateError ||
    !!deliveryDateError ||
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

    let updated: Awaited<ReturnType<typeof updateOrderAction>>;
    try {
      updated = await updateOrderAction(order.id, {
        orderDate,
        trialDate,
        deliveryDate,
        deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
        items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
        status,
      });
    } catch (submitError) {
      await persistEditableOrderAttachments({
        attachments: existingAttachments,
        removedIds: [],
        itemOptions: originalAttachmentItemOptions,
      });
      setSubmitting(false);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not update the order. Please try again."
      );
      return;
    }
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
    <form onSubmit={handleSubmit} className="space-y-2 pb-24">
      {error && (
        <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-[#c9d7ea] bg-white p-3 shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-border-soft pb-2">
          <div>
            <p className="text-sm font-semibold text-ink">Order Information</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Editing {order.orderNumber} for {customerName(customer, order)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary-tint px-3 py-1.5 text-sm font-bold text-primary">
              {order.orderNumber}
            </span>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="h-8 rounded-md py-0 text-xs font-semibold"
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

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-[340px_minmax(420px,1fr)_260px] xl:items-start 2xl:grid-cols-[360px_minmax(460px,1fr)_280px]">
          <div className="min-h-0 rounded-md border border-[#d5e0f0] bg-[#fbfdff] p-2">
            <p className="text-[11px] font-medium text-ink-muted">
              {t("orders.customer")}
            </p>
            <p className="truncate text-base font-bold leading-5 text-ink">
              {customerName(customer, order)}
            </p>
            <p className="truncate text-xs leading-4 text-ink-muted">
              {customerPhone(customer, order)} <span aria-hidden="true">-</span> {customerArea(customer, order)}
            </p>
          </div>

          <div className="min-w-0 rounded-md border border-[#d5e0f0] bg-[#fbfdff] p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                {t("orders.orderDates")}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
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
                    "h-8 rounded-md px-2 text-xs",
                    submitAttempted && orderDateError && "border-chip-red-fg"
                  )}
                />
                {submitAttempted && orderDateError && (
                  <p className="text-xs text-chip-red-fg">{orderDateError}</p>
                )}
              </label>
              <label className="flex flex-col gap-1">
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
                    "h-8 rounded-md px-2 text-xs",
                    submitAttempted && deliveryDateError && "border-chip-red-fg"
                  )}
                />
                {submitAttempted && deliveryDateError && (
                  <p className="text-xs text-chip-red-fg">{deliveryDateError}</p>
                )}
              </label>
            </div>
          </div>

          <div
            id="attachments"
            ref={attachmentsSectionRef}
            tabIndex={-1}
            className={cn(
              "min-w-0 scroll-mt-6 rounded-md border border-[#d5e0f0] bg-[#fbfdff] p-2 outline-none transition-shadow",
              highlightAttachments && "ring-2 ring-primary ring-offset-2 ring-offset-background"
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Photo / Attachments</span>
            </div>
            <OrderAttachmentDraftCard
              existing={existingAttachments}
              removedExistingIds={removedAttachmentIds}
              onRemovedExistingIdsChange={setRemovedAttachmentIds}
              inlineSummary
              compactSummary
              queued={queuedAttachments}
              onQueuedChange={setQueuedAttachments}
              error={(submitAttempted && attachmentValidationError) || attachmentError}
            />
          </div>
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
            garmentConfigurations={garmentConfigurations}
            garmentConfigurationsLoaded={catalogLoaded}
            paymentStrip={
              canViewPayments ? (
                <div className="grid gap-2 rounded-md bg-[#eef4ff] p-2 text-sm sm:grid-cols-5 xl:grid-cols-5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="block text-[11px] font-medium text-ink-muted">
                      {taxBreakdown && !taxBreakdown.pricesIncludeTax ? t("common.total") : "Subtotal"}
                    </span>
                    <span className="flex h-8 items-center text-sm font-bold text-ink">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="block text-[11px] font-medium text-ink-muted">
                      {t("common.paid")}
                    </span>
                    <span className="flex h-8 items-center text-sm font-bold text-ink">
                      {formatCurrency(order.advancePaid)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="block text-[11px] font-medium text-ink-muted">
                      {t("common.balance")}
                    </span>
                    <span className={cn("flex h-8 items-center text-sm font-bold", balance > 0 ? "text-warning" : "text-success")}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="block text-[11px] font-medium text-ink-muted">
                      {t("orders.paymentMode")}
                    </span>
                    <span className="flex h-8 items-center text-sm font-bold text-ink">
                      {order.paymentMode}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="block text-[11px] font-medium text-ink-muted">
                      {t("orders.paymentStatus")}
                    </span>
                    <div className="flex h-8 items-center">
                      <BalanceBadge order={draftOrder} todayIso={todayIso()} />
                    </div>
                  </div>
                </div>
              ) : undefined
            }
            autoSnapshotDefaultMeasurements
            excludeOrderId={order.id}
            compact
          />
          {submitAttempted && itemsError && (
            <p className="-mt-3 text-sm font-medium text-chip-red-fg">{itemsError}</p>
          )}
        </>
      ) : (
        <LoadingState label="Loading order items..." />
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-soft bg-white shadow-soft">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7 2xl:max-w-[1760px]">
          <div className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm text-ink-muted">
            {attachmentError ? (
              <span className="whitespace-nowrap font-medium text-chip-red-fg">{attachmentError}</span>
            ) : canViewPayments ? (
              <>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-ink-muted">{t("common.total")}</span>
                  <span className="text-base font-bold text-ink">{formatCurrency(totalAmount)}</span>
                </span>
                <span aria-hidden="true" className="h-5 w-px bg-border" />
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-ink-muted">{t("common.paid")}</span>
                  <span className="text-base font-bold text-ink">{formatCurrency(order.advancePaid)}</span>
                </span>
                <span aria-hidden="true" className="h-5 w-px bg-border" />
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-ink-muted">{t("common.balance")}</span>
                  <span className={cn("text-base font-bold", balance > 0 ? "text-warning" : "text-success")}>
                    {formatCurrency(balance)}
                  </span>
                </span>
              </>
            ) : (
              <span>
                {validItems.length} item{validItems.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg px-3 py-2 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !catalogLoaded}
              className="h-12 min-w-[150px] rounded-lg bg-primary px-6 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Saving..." : t("common.saveChanges")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
