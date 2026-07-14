"use client";

import { useEffect, useState } from "react";
import { Plus, Ruler, Trash2, X } from "lucide-react";
import type {
  Customer,
  GarmentMeasurement,
  Order,
  OrderItem,
  OrderItemAddOn,
  AlterationChargeType,
  OrderItemFabricSource,
  OrderStatus,
} from "@/lib/types";
import {
  getGarmentMeasurementAction,
  saveGarmentMeasurementAction,
  updateCustomerAction,
} from "@/app/(shell)/customers/actions";
import { updateOrderAction } from "@/app/(shell)/orders/actions";
import { getMeasurementFields } from "@/lib/garment-catalog";
import {
  BalanceBadge,
  formatDate,
  getAvailableOrderStatuses,
  ORDER_STATUS_LABEL_KEYS,
} from "@/components/orders/orders-table";
import {
  GarmentMeasurementModal,
  blankGarmentDraft,
  countFilledFields,
  type GarmentMeasurementDraft,
} from "@/components/orders/garment-measurement-modal";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

// size/addOns aren't editable in this drawer (no garment-type dropdown here
// yet — particular stays free text), but are carried through untouched so
// saving an edit doesn't silently drop them from an item created via the
// New Order flow's garment catalog.
type DraftItem = {
  particular: string;
  qty: number;
  rate: number;
  garmentTypeId?: string;
  size?: string;
  addOns?: OrderItemAddOn[];
  fabricSource: OrderItemFabricSource;
  fabricNotes: string;
  designNotes: string;
  alterationIssue: string;
  alterationRequiredChange: string;
  alterationChargeType: AlterationChargeType;
  linkedOriginalOrderId: string;
  measurements?: Record<string, string>;
};

function toDraftItems(items: OrderItem[]): DraftItem[] {
  return items.map((i) => ({
    particular: i.particular,
    qty: i.qty,
    rate: i.rate,
    garmentTypeId: i.garmentTypeId,
    size: i.size,
    addOns: i.addOns,
    fabricSource: i.fabricSource ?? "Not specified",
    fabricNotes: i.fabricNotes ?? "",
    designNotes: i.designNotes ?? "",
    alterationIssue: i.alterationIssue ?? "",
    alterationRequiredChange: i.alterationRequiredChange ?? "",
    alterationChargeType: i.alterationChargeType ?? "Paid",
    linkedOriginalOrderId: i.linkedOriginalOrderId ?? "",
    measurements: i.measurements,
  }));
}

function addOnsAmount(addOns: OrderItemAddOn[] | undefined): number {
  return addOns?.reduce((sum, a) => sum + a.amount, 0) ?? 0;
}

function garmentKey(garmentType: string): string {
  return garmentType.trim().toLowerCase();
}

function toDraft(garmentType: string, persisted: GarmentMeasurement | undefined): GarmentMeasurementDraft {
  if (!persisted) return blankGarmentDraft(garmentType);
  return {
    garmentType,
    values: { ...persisted.values },
    fitNotes: persisted.fitNotes ?? "",
    notes: persisted.notes ?? "",
  };
}

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export function EditOrderDrawer({
  order,
  customer,
  onCancel,
  onSaved,
}: {
  order: Order | null;
  customer: Customer | undefined;
  onCancel: () => void;
  onSaved: (order: Order) => void;
}) {
  const { hasPermission, effectivePermissions } = useCurrentUser();
  const { t } = useLanguage();
  const canViewPayments = hasPermission("orders.viewPayments");
  const availableStatuses = getAvailableOrderStatuses(effectivePermissions);

  // Re-keyed by order.id from the parent (see app/orders/page.tsx) so this
  // local state resets to fresh initial values whenever a different order is
  // opened for editing, without needing a useEffect sync.
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [area, setArea] = useState(customer?.area ?? "");
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? "");
  const [deliveryDate, setDeliveryDate] = useState(order?.deliveryDate ?? "");
  const [deliveryPromiseNote, setDeliveryPromiseNote] = useState(
    order?.deliveryPromiseNote ?? ""
  );
  const [status, setStatus] = useState<OrderStatus>(
    order?.status ?? "In Progress"
  );
  const [items, setItems] = useState<DraftItem[]>(
    order
      ? toDraftItems(order.items)
      : [{
          particular: "",
          qty: 1,
          rate: 0,
          fabricSource: "Not specified",
          fabricNotes: "",
          designNotes: "",
          alterationIssue: "",
          alterationRequiredChange: "",
          alterationChargeType: "Paid",
          linkedOriginalOrderId: "",
        }]
  );
  // Measurement edits saved from the modal, keyed by garmentKey(garmentType).
  // Kept in local form state only — nothing is written to stub-data until
  // Save Changes on the order itself, so Cancel discards these too.
  const [measurementsByGarment, setMeasurementsByGarment] = useState<
    Record<string, GarmentMeasurementDraft>
  >({});
  const [activeGarmentType, setActiveGarmentType] = useState<string | null>(
    null
  );
  // Phase 5A: persisted garment-measurement records now come from a Server
  // Action (getGarmentMeasurementAction), not a synchronous stub-data.ts
  // call — cached here per garment type since persistedDraftFor is read
  // several times per render (summary list, dirty-check).
  const [persistedCache, setPersistedCache] = useState<
    Record<string, GarmentMeasurement | undefined>
  >({});

  // Distinct garment types among the current item rows, in first-seen order.
  const distinctGarments: string[] = [];
  const seenGarmentKeys = new Set<string>();
  for (const it of items) {
    const trimmed = it.particular.trim();
    if (!trimmed || seenGarmentKeys.has(garmentKey(trimmed))) continue;
    seenGarmentKeys.add(garmentKey(trimmed));
    distinctGarments.push(trimmed);
  }

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    const missing = distinctGarments.filter(
      (g) => !(garmentKey(g) in persistedCache)
    );
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (g) => {
        const record = await getGarmentMeasurementAction(customer.id, g);
        return [garmentKey(g), record] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setPersistedCache((prev) => {
        const next = { ...prev };
        for (const [key, record] of entries) next[key] = record;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, distinctGarments.join("|")]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!order) return null;

  function persistedDraftFor(garmentType: string): GarmentMeasurementDraft {
    return toDraft(garmentType, persistedCache[garmentKey(garmentType)]);
  }

  function draftFor(garmentType: string): GarmentMeasurementDraft {
    return (
      measurementsByGarment[garmentKey(garmentType)] ??
      persistedDraftFor(garmentType)
    );
  }

  const computedItems: OrderItem[] = items.map((it, i) => ({
    serialNo: i + 1,
    particular: it.particular,
    qty: it.qty,
    rate: it.rate,
    garmentTypeId: it.garmentTypeId,
    size: it.size,
    addOns: it.addOns,
    addOnsTotal: addOnsAmount(it.addOns) || undefined,
    finalRate: it.rate + addOnsAmount(it.addOns),
    amount: it.qty * (it.rate + addOnsAmount(it.addOns)),
    measurements: measurementsByGarment[garmentKey(it.particular)]?.values ?? it.measurements,
    fabricSource: it.fabricSource,
    fabricNotes: it.fabricNotes.trim() || undefined,
    designNotes: it.designNotes.trim() || undefined,
    alterationIssue: it.alterationIssue.trim() || undefined,
    alterationRequiredChange: it.alterationRequiredChange.trim() || undefined,
    alterationChargeType:
      it.alterationIssue.trim() || it.alterationRequiredChange.trim()
        ? it.alterationChargeType
        : undefined,
    linkedOriginalOrderId: it.linkedOriginalOrderId || undefined,
  }));
  const totalAmount = computedItems.reduce((sum, i) => sum + i.amount, 0);
  const balance = totalAmount - order.advancePaid;
  const todayIso = new Date().toISOString().slice(0, 10);

  // A draft view of the order for BalanceBadge's overdue/paid logic, so
  // Payment Status reuses the exact same computation as the table/drawer
  // instead of a second copy of the paid/due/overdue rules.
  const draftOrder: Order = {
    ...order,
    orderDate,
    deliveryDate,
    deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
    items: computedItems,
    totalAmount,
    balance,
    status,
  };

  const measurementsDirty = Object.values(measurementsByGarment).some(
    (draft) =>
      JSON.stringify(draft) !== JSON.stringify(persistedDraftFor(draft.garmentType))
  );

  const isDirty =
    name !== (customer?.name ?? "") ||
    phone !== (customer?.phone ?? "") ||
    address !== (customer?.address ?? "") ||
    area !== (customer?.area ?? "") ||
    orderDate !== order.orderDate ||
    deliveryDate !== order.deliveryDate ||
    deliveryPromiseNote !== (order.deliveryPromiseNote ?? "") ||
    status !== order.status ||
    JSON.stringify(items) !== JSON.stringify(toDraftItems(order.items)) ||
    measurementsDirty;

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        particular: "",
        qty: 1,
        rate: 0,
        fabricSource: "Not specified",
        fabricNotes: "",
        designNotes: "",
        alterationIssue: "",
        alterationRequiredChange: "",
        alterationChargeType: "Paid",
        linkedOriginalOrderId: "",
      },
    ]);
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function openMeasurement(garmentType: string) {
    setActiveGarmentType(garmentType);
  }
  function handleSaveMeasurement(draft: GarmentMeasurementDraft) {
    setMeasurementsByGarment((prev) => ({
      ...prev,
      [garmentKey(draft.garmentType)]: draft,
    }));
    setActiveGarmentType(null);
  }

  function handleClose() {
    if (isDirty && !window.confirm(t("orders.discardChanges"))) return;
    onCancel();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setError(null);
    const validItems = computedItems.filter(
      (it) => it.particular.trim() && it.qty > 0 && it.rate >= 0
    );
    if (
      !name.trim() ||
      !phone.trim() ||
      !deliveryDate ||
      !orderDate ||
      validItems.length === 0
    )
      return;

    setSubmitting(true);

    if (customer) {
      const customerResult = await updateCustomerAction(customer.id, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        area: area.trim(),
        gender: customer.gender,
      });
      if (!customerResult.success) {
        setSubmitting(false);
        setError(customerResult.error);
        return;
      }
      for (const draft of Object.values(measurementsByGarment)) {
        const measurementResult = await saveGarmentMeasurementAction({
          customerId: customer.id,
          garmentType: draft.garmentType,
          values: draft.values,
          fitNotes: draft.fitNotes,
          notes: draft.notes,
          source: "Edit order",
        });
        if (!measurementResult.success) {
          setSubmitting(false);
          setError(measurementResult.error);
          return;
        }
      }
    }
    const updated = await updateOrderAction(order.id, {
      orderDate,
      deliveryDate,
      deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
      items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
      status,
    });
    setSubmitting(false);
    if (!updated.success) {
      setError(updated.error);
      return;
    }
    onSaved(updated.data);
  }

  return (
    <>
      <div
        onClick={handleClose}
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft sm:w-[600px] md:w-[760px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">{t("orders.editOrder")}</p>
            <p className="text-sm text-ink-muted">{order.orderNumber}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className={`${inputClass} h-9 py-0 text-xs font-semibold`}
            >
              {/* order.status may not be in availableStatuses (e.g. Cancelled
                  without orders.cancel) — always include it so the select
                  doesn't silently jump to a different value. */}
              {(availableStatuses.includes(status)
                ? availableStatuses
                : [status, ...availableStatuses]
              ).map((s) => (
                <option key={s} value={s}>
                  {t(ORDER_STATUS_LABEL_KEYS[s])}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t("common.close")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col justify-between"
        >
          <div className="space-y-5 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
                {error}
              </div>
            )}

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-4 text-[17px] font-semibold text-ink">
                {t("orders.customer")}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("customers.customerName")}
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.phone")}
                  </span>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.address")}
                  </span>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.area")}
                  </span>
                  <input
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-4 text-[17px] font-semibold text-ink">
                {t("orders.dates")}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.orderDate")}
                  </span>
                  <input
                    type="date"
                    required
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.deliveryDate")}
                  </span>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
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

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[17px] font-semibold text-ink">{t("orders.items")}</h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
                >
                  <Plus className="h-4 w-4" /> {t("orders.addItem")}
                </button>
              </div>
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-2 items-end gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto_auto]"
                  >
                    <label className="flex min-w-0 flex-col gap-1.5">
                      {i === 0 && (
                        <span className="text-[13px] font-medium text-ink-muted">
                          {t("orders.particular")}
                        </span>
                      )}
                      <input
                        value={it.particular}
                        onChange={(e) =>
                          updateItem(i, { particular: e.target.value })
                        }
                        placeholder="e.g. Shirt"
                        className={`${inputClass} w-full min-w-0`}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      {i === 0 && (
                        <span className="text-[13px] font-medium text-ink-muted">
                          {t("common.qty")}
                        </span>
                      )}
                      <input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) =>
                          updateItem(i, { qty: Number(e.target.value) })
                        }
                        className={`${inputClass} w-full min-w-0`}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      {i === 0 && (
                        <span className="text-[13px] font-medium text-ink-muted">
                          {t("common.rate")}
                        </span>
                      )}
                      <input
                        type="number"
                        min={0}
                        value={it.rate}
                        onChange={(e) =>
                          updateItem(i, { rate: Number(e.target.value) })
                        }
                        className={`${inputClass} w-full min-w-0`}
                      />
                    </label>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      {i === 0 && (
                        <span className="text-[13px] font-medium text-ink-muted">
                          {t("common.amount")}
                        </span>
                      )}
                      <div className="flex h-11 items-center text-sm font-semibold text-ink">
                        ₹{(it.qty * it.rate + addOnsAmount(it.addOns)).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openMeasurement(it.particular)}
                      disabled={!it.particular.trim()}
                      title={
                        it.particular.trim()
                          ? t("orders.measurementBtnTitle")
                          : t("orders.enterParticularFirst")
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-primary-tint hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={t("orders.measurementBtnTitle")}
                    >
                      <Ruler className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-chip-red hover:text-chip-red-fg disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={t("orders.removeItem")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <label className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-2">
                      <span className="text-[13px] font-medium text-ink-muted">
                        {t("orders.fabricSource")}
                      </span>
                      <select
                        value={it.fabricSource}
                        onChange={(e) =>
                          updateItem(i, {
                            fabricSource: e.target.value as OrderItemFabricSource,
                          })
                        }
                        className={`${inputClass} w-full min-w-0`}
                      >
                        <option value="Not specified">Not specified</option>
                        <option value="Customer provided">Customer provided</option>
                        <option value="Shop provided">Shop provided</option>
                      </select>
                    </label>
                    <label className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-2">
                      <span className="text-[13px] font-medium text-ink-muted">
                        {t("orders.fabricNotes")}
                      </span>
                      <textarea
                        value={it.fabricNotes}
                        onChange={(e) => updateItem(i, { fabricNotes: e.target.value })}
                        placeholder={t("orders.fabricNotesPlaceholder")}
                        rows={2}
                        className="min-h-[44px] w-full min-w-0 resize-y rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </label>
                    <label className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-2">
                      <span className="text-[13px] font-medium text-ink-muted">
                        {t("orders.designNotes")}
                      </span>
                      <textarea
                        value={it.designNotes}
                        onChange={(e) => updateItem(i, { designNotes: e.target.value })}
                        placeholder={t("orders.designNotesPlaceholder")}
                        rows={2}
                        className="min-h-[44px] w-full min-w-0 resize-y rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </label>
                    {it.particular.toLowerCase().includes("alteration") && (
                      <>
                        <label className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-3">
                          <span className="text-[13px] font-medium text-ink-muted">
                            Original Issue
                          </span>
                          <textarea
                            value={it.alterationIssue}
                            onChange={(e) =>
                              updateItem(i, { alterationIssue: e.target.value })
                            }
                            placeholder="Too tight at waist, sleeve length wrong, torn seam..."
                            rows={2}
                            className="min-h-[44px] w-full min-w-0 resize-y rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                          />
                        </label>
                        <label className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-3">
                          <span className="text-[13px] font-medium text-ink-muted">
                            Required Change
                          </span>
                          <textarea
                            value={it.alterationRequiredChange}
                            onChange={(e) =>
                              updateItem(i, { alterationRequiredChange: e.target.value })
                            }
                            placeholder="Loosen waist 1 inch, shorten sleeves, replace zip..."
                            rows={2}
                            className="min-h-[44px] w-full min-w-0 resize-y rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                          />
                        </label>
                        <label className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-2">
                          <span className="text-[13px] font-medium text-ink-muted">
                            Free / Paid
                          </span>
                          <select
                            value={it.alterationChargeType}
                            onChange={(e) =>
                              updateItem(i, {
                                alterationChargeType: e.target.value as AlterationChargeType,
                                rate: e.target.value === "Free" ? 0 : it.rate,
                              })
                            }
                            className={`${inputClass} w-full min-w-0`}
                          >
                            <option value="Paid">Paid</option>
                            <option value="Free">Free</option>
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {distinctGarments.length > 0 && (
              <div className="rounded-lg bg-surface p-4">
                <p className="mb-2 text-[13px] font-medium text-ink-muted">
                  {t("orders.measurements")}
                </p>
                <ul className="space-y-1">
                  {distinctGarments.map((garmentType) => {
                    const key = garmentKey(garmentType);
                    const pending = measurementsByGarment[key];
                    const persisted = persistedCache[key];
                    const draft = pending ?? persistedDraftFor(garmentType);
                    const count = countFilledFields(draft);
                    let statusText: string;
                    if (count === 0) {
                      statusText = t("orders.noMeasurementsSavedYet");
                    } else if (
                      pending &&
                      JSON.stringify(pending) !==
                        JSON.stringify(persistedDraftFor(garmentType))
                    ) {
                      statusText = `${count} ${t("orders.fieldsSaved")}, ${t("orders.unsavedChanges")}`;
                    } else {
                      statusText = `${count} ${t("orders.fieldsSaved")}${
                        persisted
                          ? `, ${t("orders.updated")} ${formatDate(persisted.updatedAt)}`
                          : ""
                      }`;
                    }
                    return (
                      <li
                        key={key}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-medium text-ink">
                          {garmentType}
                        </span>
                        <span className="text-ink-muted">{statusText}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {canViewPayments && (
              <div className="rounded-lg bg-surface p-4">
                <p className="mb-2 text-[13px] font-medium text-ink-muted">
                  {t("orders.paymentSummary")}
                </p>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-muted">{t("common.total")}</span>
                  <span className="text-sm font-semibold text-ink">
                    ₹{totalAmount.toLocaleString("en-IN")}
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
                    ₹{balance.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-muted">{t("orders.paymentStatus")}</span>
                  <BalanceBadge order={draftOrder} todayIso={todayIso} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Saving…" : t("common.saveChanges")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
      {activeGarmentType && (
        <GarmentMeasurementModal
          initial={draftFor(activeGarmentType)}
          fields={getMeasurementFields(activeGarmentType)}
          onCancel={() => setActiveGarmentType(null)}
          onSave={handleSaveMeasurement}
        />
      )}
    </>
  );
}
