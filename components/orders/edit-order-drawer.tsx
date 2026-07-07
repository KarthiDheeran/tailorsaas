"use client";

import { useState } from "react";
import { Plus, Ruler, Trash2, X } from "lucide-react";
import type {
  Customer,
  Order,
  OrderItem,
  OrderItemAddOn,
  OrderStatus,
} from "@/lib/types";
import {
  getGarmentMeasurement,
  orderStatuses,
  saveGarmentMeasurement,
  updateCustomer,
  updateOrder,
} from "@/lib/data/stub-data";
import { getMeasurementFields } from "@/lib/garment-catalog";
import { BalanceBadge, formatDate } from "@/components/orders/orders-table";
import {
  GarmentMeasurementModal,
  blankGarmentDraft,
  countFilledFields,
  type GarmentMeasurementDraft,
} from "@/components/orders/garment-measurement-modal";

// size/addOns aren't editable in this drawer (no garment-type dropdown here
// yet — particular stays free text), but are carried through untouched so
// saving an edit doesn't silently drop them from an item created via the
// New Order flow's garment catalog.
type DraftItem = {
  particular: string;
  qty: number;
  rate: number;
  size?: string;
  addOns?: OrderItemAddOn[];
};

function toDraftItems(items: OrderItem[]): DraftItem[] {
  return items.map((i) => ({
    particular: i.particular,
    qty: i.qty,
    rate: i.rate,
    size: i.size,
    addOns: i.addOns,
  }));
}

function addOnsAmount(addOns: OrderItemAddOn[] | undefined): number {
  return addOns?.reduce((sum, a) => sum + a.amount, 0) ?? 0;
}

function garmentKey(garmentType: string): string {
  return garmentType.trim().toLowerCase();
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
  // Re-keyed by order.id from the parent (see app/orders/page.tsx) so this
  // local state resets to fresh initial values whenever a different order is
  // opened for editing, without needing a useEffect sync.
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [area, setArea] = useState(customer?.area ?? "");
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? "");
  const [deliveryDate, setDeliveryDate] = useState(order?.deliveryDate ?? "");
  const [status, setStatus] = useState<OrderStatus>(
    order?.status ?? "In Progress"
  );
  const [items, setItems] = useState<DraftItem[]>(
    order ? toDraftItems(order.items) : [{ particular: "", qty: 1, rate: 0 }]
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

  if (!order) return null;

  function persistedDraftFor(garmentType: string): GarmentMeasurementDraft {
    const persisted = customer
      ? getGarmentMeasurement(customer.id, garmentType)
      : undefined;
    if (!persisted) return blankGarmentDraft(garmentType);
    return {
      garmentType,
      values: { ...persisted.values },
      fitNotes: persisted.fitNotes ?? "",
      notes: persisted.notes ?? "",
    };
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
    size: it.size,
    addOns: it.addOns,
    amount: it.qty * it.rate + addOnsAmount(it.addOns),
  }));
  const totalAmount = computedItems.reduce((sum, i) => sum + i.amount, 0);
  const balance = totalAmount - order.advancePaid;
  const todayIso = new Date().toISOString().slice(0, 10);

  // Distinct garment types among the current item rows, in first-seen order,
  // for the Measurements summary section below.
  const distinctGarments: string[] = [];
  const seenGarmentKeys = new Set<string>();
  for (const it of items) {
    const trimmed = it.particular.trim();
    if (!trimmed || seenGarmentKeys.has(garmentKey(trimmed))) continue;
    seenGarmentKeys.add(garmentKey(trimmed));
    distinctGarments.push(trimmed);
  }
  // A draft view of the order for BalanceBadge's overdue/paid logic, so
  // Payment Status reuses the exact same computation as the table/drawer
  // instead of a second copy of the paid/due/overdue rules.
  const draftOrder: Order = {
    ...order,
    orderDate,
    deliveryDate,
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
    status !== order.status ||
    JSON.stringify(items) !== JSON.stringify(toDraftItems(order.items)) ||
    measurementsDirty;

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }
  function addItem() {
    setItems((prev) => [...prev, { particular: "", qty: 1, rate: 0 }]);
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
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    onCancel();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
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

    if (customer) {
      updateCustomer(customer.id, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        area: area.trim(),
        gender: customer.gender,
      });
      for (const draft of Object.values(measurementsByGarment)) {
        saveGarmentMeasurement({
          customerId: customer.id,
          garmentType: draft.garmentType,
          values: draft.values,
          fitNotes: draft.fitNotes,
          notes: draft.notes,
        });
      }
    }
    const updated = updateOrder(order.id, {
      orderDate,
      deliveryDate,
      items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
      status,
    });
    if (updated) onSaved(updated);
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
            <p className="text-[17px] font-semibold text-ink">Edit Order</p>
            <p className="text-sm text-ink-muted">{order.orderNumber}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className={`${inputClass} h-9 py-0 text-xs font-semibold`}
            >
              {orderStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
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
            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-4 text-[17px] font-semibold text-ink">
                Customer
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Customer Name
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
                    Phone
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
                    Address
                  </span>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Area / Locality
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
                Dates
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Order Date
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
                    Delivery Date
                  </span>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[17px] font-semibold text-ink">Items</h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
                >
                  <Plus className="h-4 w-4" /> Add Item
                </button>
              </div>
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_auto_auto] items-end gap-3"
                  >
                    <label className="flex min-w-0 flex-col gap-1.5">
                      {i === 0 && (
                        <span className="text-[13px] font-medium text-ink-muted">
                          Particular
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
                          Qty
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
                          Rate
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
                          Amount
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
                          ? "Measurement"
                          : "Enter a particular first"
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-primary-tint hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Measurement"
                    >
                      <Ruler className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-chip-red hover:text-chip-red-fg disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {distinctGarments.length > 0 && (
              <div className="rounded-lg bg-surface p-4">
                <p className="mb-2 text-[13px] font-medium text-ink-muted">
                  Measurements
                </p>
                <ul className="space-y-1">
                  {distinctGarments.map((garmentType) => {
                    const key = garmentKey(garmentType);
                    const pending = measurementsByGarment[key];
                    const persisted = customer
                      ? getGarmentMeasurement(customer.id, garmentType)
                      : undefined;
                    const draft = pending ?? persistedDraftFor(garmentType);
                    const count = countFilledFields(draft);
                    let statusText: string;
                    if (count === 0) {
                      statusText = "No measurements saved yet";
                    } else if (
                      pending &&
                      JSON.stringify(pending) !==
                        JSON.stringify(persistedDraftFor(garmentType))
                    ) {
                      statusText = `${count} field${count === 1 ? "" : "s"} saved, unsaved changes`;
                    } else {
                      statusText = `${count} field${count === 1 ? "" : "s"} saved${
                        persisted ? `, updated ${formatDate(persisted.updatedAt)}` : ""
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

            <div className="rounded-lg bg-surface p-4">
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                Payment Summary
              </p>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-ink-muted">Total</span>
                <span className="text-sm font-semibold text-ink">
                  ₹{totalAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-ink-muted">Paid</span>
                <span className="text-sm font-semibold text-ink">
                  ₹{order.advancePaid.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-ink-muted">Balance</span>
                <span className="text-sm font-semibold text-ink">
                  ₹{balance.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-ink-muted">Payment Status</span>
                <BalanceBadge order={draftOrder} todayIso={todayIso} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              Cancel
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
