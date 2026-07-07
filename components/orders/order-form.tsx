"use client";

import { useRef, useState } from "react";
import { Plus, Ruler, Trash2 } from "lucide-react";
import {
  getGarmentMeasurementDraftSeed,
  paymentModes,
  saveCustomerMeasurements,
  saveGarmentMeasurement,
} from "@/lib/data/stub-data";
import { pickBodyMeasurements } from "@/lib/garment-catalog";
import {
  getActiveGarmentTypes,
  getAddOnsForGarment,
  getGarmentById,
  calculateGarmentAmount,
  measurementFields as catalogMeasurementFieldLibrary,
  type CatalogAddOn,
  type CatalogGarmentType,
} from "@/lib/catalog";
import type { Customer, OrderItem, OrderItemAddOn, PaymentMode } from "@/lib/types";
import {
  GarmentMeasurementModal,
  countFilledFields,
  type GarmentMeasurementDraft,
} from "@/components/orders/garment-measurement-modal";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Global measurement field id -> label, built once from Catalog's field
// library so a garment's linked measurementFieldIds can be rendered with
// their real labels without duplicating the library here.
const CATALOG_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  catalogMeasurementFieldLibrary.map((f) => [f.id, f.label])
);

function garmentMeasurementFields(
  garment: CatalogGarmentType | undefined
): { key: string; label: string }[] {
  if (!garment) return [];
  return garment.measurementFieldIds.map((id) => ({
    key: id,
    label: CATALOG_FIELD_LABELS[id] ?? id,
  }));
}

interface DraftItem {
  // Catalog garment type id (lib/catalog.ts is the source of truth for
  // pricing/measurement fields/add-ons — New Order no longer defines its
  // own garment config).
  garmentTypeId: string;
  qty: number;
  rate: number;
  // Once the shopkeeper edits Rate directly, garment changes stop
  // auto-filling it — manual override always wins for that row.
  rateOverridden: boolean;
  addOnIds: string[];
  // null = not yet touched in this session; the Measurements modal seeds
  // itself from customer/garment history on first open (see
  // measurementDraftFor below). Once saved from the modal, holds the draft
  // so re-opening shows the same in-progress edits.
  measurement: GarmentMeasurementDraft | null;
}

function blankDraftItem(): DraftItem {
  return {
    garmentTypeId: "",
    qty: 1,
    rate: 0,
    rateOverridden: false,
    addOnIds: [],
    measurement: null,
  };
}

export interface OrderFormValues {
  orderDate: string;
  trialDate: string;
  deliveryDate: string;
  items: OrderItem[];
  advancePaid: number;
  paymentMode: PaymentMode;
}

const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

function AddOnsPicker({
  addOns,
  selectedIds,
  onToggle,
}: {
  // Only the add-ons linked to the selected garment type (lib/catalog.ts's
  // getAddOnsForGarment) — never the full add-ons master.
  addOns: CatalogAddOn[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const disabled = addOns.length === 0;

  const label =
    selectedIds.length > 0
      ? `${selectedIds.length} add-on${selectedIds.length > 1 ? "s" : ""}`
      : "Add-ons";

  // The item row sits inside a horizontally-scrollable (overflow-x-auto)
  // container, which — per the CSS overflow spec — also forces
  // overflow-y to compute to "auto". An `absolute`-positioned popover
  // there gets clipped to that row's height instead of overlaying the
  // page. Positioning it `fixed` from the button's own viewport rect
  // escapes that clipping entirely.
  function openPicker() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`${inputClass} flex items-center justify-start text-left disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {label}
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-40 w-60 rounded-lg border border-border-soft bg-white p-2 shadow-soft"
          >
            {addOns.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(a.id)}
                    onChange={() => onToggle(a.id)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary-tint"
                  />
                  {a.name}
                </span>
                <span className="text-ink-muted">+₹{a.defaultPrice}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OrderForm({
  customer,
  onSubmit,
}: {
  customer: Customer;
  onSubmit: (data: OrderFormValues) => void;
}) {
  const [orderDate, setOrderDate] = useState(todayIso());
  const [trialDate, setTrialDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [items, setItems] = useState<DraftItem[]>([blankDraftItem()]);
  const [advancePaid, setAdvancePaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const activeGarments = getActiveGarmentTypes();

  function selectedAddOns(it: DraftItem): CatalogAddOn[] {
    const garment = getGarmentById(it.garmentTypeId);
    if (!garment) return [];
    return getAddOnsForGarment(garment).filter((a) =>
      it.addOnIds.includes(a.id)
    );
  }

  // Item Amount = Qty × (Rate + selected add-ons total) — Rate here is the
  // row's current effective rate (Catalog base price, or the shopkeeper's
  // manual override), not necessarily the garment's basePrice.
  function computeAmount(it: DraftItem): number {
    return calculateGarmentAmount(it.rate, selectedAddOns(it), it.qty);
  }

  const computedItems: OrderItem[] = items.map((it, i) => {
    const garment = getGarmentById(it.garmentTypeId);
    const addOns: OrderItemAddOn[] = selectedAddOns(it).map((a) => ({
      key: a.id,
      label: a.name,
      amount: a.defaultPrice,
    }));
    return {
      serialNo: i + 1,
      particular: garment?.name ?? "",
      qty: it.qty,
      rate: it.rate,
      addOns: addOns.length > 0 ? addOns : undefined,
      amount: computeAmount(it),
    };
  });
  const totalAmount = computedItems.reduce((sum, i) => sum + i.amount, 0);
  const balance = totalAmount - advancePaid;

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }
  function addItem() {
    setItems((prev) => [...prev, blankDraftItem()]);
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleGarmentTypeChange(index: number, garmentTypeId: string) {
    const garment = getGarmentById(garmentTypeId);
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const rate = it.rateOverridden ? it.rate : (garment?.basePrice ?? 0);
        return {
          ...it,
          garmentTypeId,
          rate,
          addOnIds: [],
          // Fields differ per garment type, so a measurement draft entered
          // for the previous garment type no longer applies.
          measurement: null,
        };
      })
    );
  }
  function handleRateChange(index: number, rate: number) {
    updateItem(index, { rate, rateOverridden: true });
  }
  function toggleAddOn(index: number, id: string) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const addOnIds = it.addOnIds.includes(id)
          ? it.addOnIds.filter((x) => x !== id)
          : [...it.addOnIds, id];
        return { ...it, addOnIds };
      })
    );
  }

  function measurementDraftFor(index: number): GarmentMeasurementDraft {
    const it = items[index];
    const garmentName = getGarmentById(it.garmentTypeId)?.name ?? "";
    if (it.measurement) return it.measurement;
    const seed = getGarmentMeasurementDraftSeed(customer.id, garmentName);
    return { garmentType: garmentName, ...seed };
  }
  function hasMeasurementData(index: number): boolean {
    const it = items[index];
    if (!it.garmentTypeId) return false;
    return countFilledFields(measurementDraftFor(index)) > 0;
  }
  function handleSaveMeasurement(draft: GarmentMeasurementDraft) {
    if (activeItemIndex === null) return;
    updateItem(activeItemIndex, { measurement: draft });
    setActiveItemIndex(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = computedItems.filter(
      (it, i) => items[i].garmentTypeId && it.qty > 0 && it.rate >= 0
    );
    if (validItems.length === 0 || !orderDate || !deliveryDate) return;

    // Persist any measurement edits: the per-garment-type record (reused for
    // this customer's future orders of the same garment type) and a merge
    // into the customer's general body-measurement baseline, so future
    // garments of any type can auto-fill from it too.
    items.forEach((it) => {
      const garment = getGarmentById(it.garmentTypeId);
      if (!garment || !it.measurement) return;
      if (countFilledFields(it.measurement) === 0) return;
      saveGarmentMeasurement({
        customerId: customer.id,
        garmentType: garment.name,
        values: it.measurement.values,
        fitNotes: it.measurement.fitNotes,
        notes: it.measurement.notes,
      });
      const bodyMeasurements = pickBodyMeasurements(it.measurement.values);
      if (Object.keys(bodyMeasurements).length > 0) {
        saveCustomerMeasurements({
          customerId: customer.id,
          values: bodyMeasurements,
        });
      }
    });

    onSubmit({
      orderDate,
      trialDate,
      deliveryDate,
      items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
      advancePaid,
      paymentMode,
    });
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <h3 className="mb-4 text-[17px] font-semibold text-ink">Order Details</h3>
        <div className="grid grid-cols-3 gap-4">
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
              Trial Date
            </span>
            <input
              type="date"
              value={trialDate}
              onChange={(e) => setTrialDate(e.target.value)}
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
          <h3 className="text-[17px] font-semibold text-ink">Order Items</h3>
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px] space-y-3">
            {items.map((it, i) => {
              const garment = getGarmentById(it.garmentTypeId);
              const addOnOptions = garment ? getAddOnsForGarment(garment) : [];
              const amount = computeAmount(it);
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1.5fr_0.6fr_0.9fr_1fr_0.9fr_auto_auto] items-end gap-3"
                >
                  <label className="flex min-w-0 flex-col gap-1.5">
                    {i === 0 && (
                      <span className="text-[13px] font-medium text-ink-muted">
                        Garment Type
                      </span>
                    )}
                    <select
                      required
                      value={it.garmentTypeId}
                      onChange={(e) =>
                        handleGarmentTypeChange(i, e.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="" disabled>
                        Select...
                      </option>
                      {activeGarments.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
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
                      className={inputClass}
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
                        handleRateChange(i, Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </label>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    {i === 0 && (
                      <span className="text-[13px] font-medium text-ink-muted">
                        Add-ons
                      </span>
                    )}
                    <AddOnsPicker
                      addOns={addOnOptions}
                      selectedIds={it.addOnIds}
                      onToggle={(id) => toggleAddOn(i, id)}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    {i === 0 && (
                      <span className="text-[13px] font-medium text-ink-muted">
                        Amount
                      </span>
                    )}
                    <div className="flex h-11 items-center text-sm font-semibold text-ink">
                      ₹{amount.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    {i === 0 && (
                      <span className="invisible text-[13px] font-medium text-ink-muted">
                        Measurements
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveItemIndex(i)}
                      disabled={!it.garmentTypeId}
                      className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Ruler className="h-3.5 w-3.5" />
                      {hasMeasurementData(i)
                        ? "Edit Measurements"
                        : "Add Measurements"}
                    </button>
                  </div>
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
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex justify-end border-t border-border-soft pt-4">
          <div className="text-base font-semibold text-ink">
            Total: ₹{totalAmount.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <h3 className="mb-4 text-[17px] font-semibold text-ink">Payment</h3>
        <div className="grid grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Advance Paid
            </span>
            <input
              type="number"
              min={0}
              max={totalAmount}
              value={advancePaid}
              onChange={(e) => setAdvancePaid(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Balance
            </span>
            <div className="flex h-11 items-center text-sm font-semibold text-ink">
              ₹{balance.toLocaleString("en-IN")}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Payment Mode
            </span>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              className={inputClass}
            >
              {paymentModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
      >
        Save Order
      </button>
    </form>
    {activeItemIndex !== null && (
      <GarmentMeasurementModal
        initial={measurementDraftFor(activeItemIndex)}
        fields={garmentMeasurementFields(
          getGarmentById(items[activeItemIndex].garmentTypeId)
        )}
        onCancel={() => setActiveItemIndex(null)}
        onSave={handleSaveMeasurement}
      />
    )}
    </>
  );
}
