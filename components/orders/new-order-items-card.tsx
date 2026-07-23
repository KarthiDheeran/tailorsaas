"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { getGarmentMeasurementDraftSeedAction } from "@/app/(shell)/customers/actions";
import {
  getRecentMeasurementSnapshotsForCustomerGarmentAction,
  type HistoricalMeasurementSnapshot,
} from "@/app/(shell)/orders/actions";
import {
  getAddOnsForGarment,
  calculateGarmentAmount,
  measurementFieldLabel,
  type CatalogAddOn,
  type CatalogGarmentType,
} from "@/lib/catalog";
import type {
  AlterationChargeType,
  Order,
  OrderItem,
  OrderItemAddOn,
  OrderItemFabricSource,
} from "@/lib/types";
import {
  MEASUREMENT_NOTES_KEY,
  countFilledFields,
  measurementNotesFromValues,
  measurementValuesOnly,
  type GarmentMeasurementDraft,
} from "@/components/orders/garment-measurement-modal";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

function garmentMeasurementFields(
  garment: CatalogGarmentType | undefined
): { key: string; label: string }[] {
  if (!garment) return [];
  return garment.measurementFieldIds.map((id) => ({
    key: id,
    label: measurementFieldLabel(id),
  }));
}

// Phase 6B: Catalog data is now fetched once, at the page level
// (app/(shell)/orders/new/page.tsx), and threaded down as plain arrays -
// every lookup below is a pure, synchronous find() over that already-
// fetched data rather than its own Supabase call, so per-row/per-render
// computations stay exactly as fast as they were against the old mock
// arrays.
function findGarmentById(
  garmentTypes: CatalogGarmentType[],
  id: string
): CatalogGarmentType | undefined {
  return garmentTypes.find((g) => g.id === id);
}

export interface DraftItem {
  draftKey: string;
  orderItemId?: string;
  // Catalog garment type id (lib/catalog.ts is the source of truth for
  // pricing/measurement fields/add-ons).
  garmentTypeId: string;
  qty: number;
  rate: number;
  // Once the shopkeeper edits Rate directly, garment changes stop
  // auto-filling it - manual override always wins for that row.
  rateOverridden: boolean;
  addOnIds: string[];
  fabricSource: OrderItemFabricSource;
  fabricNotes: string;
  designNotes: string;
  alterationIssue: string;
  alterationRequiredChange: string;
  alterationChargeType: AlterationChargeType;
  linkedOriginalOrderId: string;
  // null = no order-item snapshot in this draft yet. New Order may copy
  // customer defaults here as the starting snapshot; Edit Order keeps null
  // for old items that truly have no saved snapshot.
  measurement: GarmentMeasurementDraft | null;
}

export function blankDraftItem(): DraftItem {
  return {
    draftKey: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    orderItemId: undefined,
    garmentTypeId: "",
    qty: 1,
    rate: 0,
    rateOverridden: false,
    addOnIds: [],
    fabricSource: "Not specified",
    fabricNotes: "",
    designNotes: "",
    alterationIssue: "",
    alterationRequiredChange: "",
    alterationChargeType: "Paid",
    linkedOriginalOrderId: "",
    measurement: null,
  };
}

// Reverse-maps a previously saved order item back into a draft row, for the
// Repeat Order action. Garment is matched by name against the *active*
// catalog list (an inactive/renamed garment simply comes back unselected -
// qty/rate still carry over so the shopkeeper only needs to re-pick it).
// Rate is always treated as an override so the customer's previously agreed
// price is preserved even if the catalog's base price has since changed.
export function orderItemToDraftItem(
  item: OrderItem,
  garmentTypes: CatalogGarmentType[],
  addOns: CatalogAddOn[]
): DraftItem {
  const garment =
    garmentTypes.find((g) => g.id === item.garmentTypeId) ??
    garmentTypes.find(
      (g) => g.name.toLowerCase() === item.particular.trim().toLowerCase()
    );
  const addOnIds = garment
    ? getAddOnsForGarment(garment, addOns)
        .filter((a) =>
          item.addOns?.some(
            (io) => io.label.toLowerCase() === a.name.toLowerCase()
          )
        )
        .map((a) => a.id)
    : [];
  return {
    draftKey: item.id ? `item-${item.id}` : `saved-${item.serialNo}`,
    orderItemId: item.id,
    garmentTypeId: garment?.id ?? "",
    qty: item.qty,
    rate: item.rate,
    rateOverridden: true,
    addOnIds,
    fabricSource: item.fabricSource ?? "Not specified",
    fabricNotes: item.fabricNotes ?? "",
    designNotes: item.designNotes ?? "",
    alterationIssue: item.alterationIssue ?? "",
    alterationRequiredChange: item.alterationRequiredChange ?? "",
    alterationChargeType: item.alterationChargeType ?? "Paid",
    linkedOriginalOrderId: item.linkedOriginalOrderId ?? "",
    measurement: item.measurements
      ? {
          garmentType: item.particular,
          values: measurementValuesOnly(item.measurements),
          fitNotes: "",
          notes: measurementNotesFromValues(item.measurements),
          updateCustomerMeasurements: false,
          hasCustomerDefaultMeasurements: false,
        }
      : null,
  };
}

function selectedAddOns(
  it: DraftItem,
  garmentTypes: CatalogGarmentType[],
  addOns: CatalogAddOn[]
): CatalogAddOn[] {
  const garment = findGarmentById(garmentTypes, it.garmentTypeId);
  if (!garment) return [];
  return getAddOnsForGarment(garment, addOns).filter((a) =>
    it.addOnIds.includes(a.id)
  );
}

function formatGarmentCodeName(garment: CatalogGarmentType): string {
  return `${garmentCodeLabel(garment)} - ${garment.name}`;
}

function formatOrderDate(date: string): string {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type ItemModalMode = "add" | "edit";

function configuredDraftItems(items: DraftItem[]): Array<{ item: DraftItem; index: number }> {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.garmentTypeId);
}

function newDraftForGarment(garment: CatalogGarmentType): DraftItem {
  return {
    ...blankDraftItem(),
    garmentTypeId: garment.id,
    rate: garment.basePrice,
  };
}

function ConfigureItemModal({
  mode,
  draft,
  garment,
  addOns,
  customerId,
  excludeOrderId,
  autoSnapshotDefaultMeasurements,
  onCancel,
  onSave,
}: {
  mode: ItemModalMode;
  draft: DraftItem;
  garment: CatalogGarmentType;
  addOns: CatalogAddOn[];
  customerId: string | null;
  excludeOrderId?: string;
  autoSnapshotDefaultMeasurements: boolean;
  onCancel: () => void;
  onSave: (draft: DraftItem) => void;
}) {
  const firstMeasurementRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const fields = garmentMeasurementFields(garment);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>(draft.addOnIds);
  const [measurement, setMeasurement] = useState<GarmentMeasurementDraft>(
    draft.measurement ?? {
      garmentType: garment.name,
      values: {},
      fitNotes: "",
      notes: "",
      updateCustomerMeasurements: false,
      hasCustomerDefaultMeasurements: false,
    }
  );
  const [history, setHistory] = useState<HistoricalMeasurementSnapshot[]>([]);
  const [defaultSeed, setDefaultSeed] = useState<{
    values: Record<string, string>;
    fitNotes: string;
    notes: string;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const addOnOptions = getAddOnsForGarment(garment, addOns).filter(
    (addOn) => addOn.isActive
  );
  const defaultHasMeasurements =
    defaultSeed !== null &&
    (Object.values(defaultSeed.values).some((value) => value.trim() !== "") ||
      defaultSeed.notes.trim() !== "");
  const selectedAddOnsForModal = addOnOptions.filter((addOn) =>
    selectedAddOnIds.includes(addOn.id)
  );

  useEffect(() => {
    firstMeasurementRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!customerId) {
      setHistory([]);
      setDefaultSeed(null);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    Promise.all([
      getGarmentMeasurementDraftSeedAction(customerId, garment.name),
      getRecentMeasurementSnapshotsForCustomerGarmentAction(
        customerId,
        garment.id,
        excludeOrderId
      ),
    ]).then(([seed, snapshots]) => {
      if (cancelled) return;
      setDefaultSeed(seed);
      setHistory(snapshots);
      setLoadingHistory(false);
      if (!draft.measurement && autoSnapshotDefaultMeasurements) {
        const seededDraft: GarmentMeasurementDraft = {
          garmentType: garment.name,
          values: seed.values,
          fitNotes: seed.fitNotes,
          notes: seed.notes,
          updateCustomerMeasurements: false,
          hasCustomerDefaultMeasurements:
            Object.values(seed.values).some((value) => value.trim() !== "") ||
            seed.notes.trim() !== "",
        };
        setMeasurement(seededDraft);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    autoSnapshotDefaultMeasurements,
    customerId,
    draft.measurement,
    excludeOrderId,
    garment.id,
    garment.name,
  ]);

  function toggleAddOn(id: string) {
    setSelectedAddOnIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]
    );
  }

  function loadMeasurementValues(values: Record<string, string>, notes?: string) {
    setMeasurement((current) => ({
      ...current,
      values: measurementValuesOnly(values),
      notes: measurementNotesFromValues(values) || notes || "",
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      measurement.updateCustomerMeasurements &&
      measurement.hasCustomerDefaultMeasurements &&
      !window.confirm(
        `This will replace the customer's saved ${garment.name} measurements after the order is saved. Continue?`
      )
    ) {
      return;
    }

    const hasMeasurementContent = countFilledFields(measurement) > 0;
    onSave({
      ...draft,
      garmentTypeId: garment.id,
      addOnIds: selectedAddOnIds,
      measurement: hasMeasurementContent || measurement.updateCustomerMeasurements
        ? measurement
        : null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onCancel} />
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        onKeyDown={handleKeyDown}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="configure-item-title"
          className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border-soft bg-white shadow-soft"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
            <div>
              <p className="text-[13px] font-medium text-ink-muted">
                {formatGarmentCodeName(garment)}
              </p>
              <h3 id="configure-item-title" className="text-[18px] font-semibold text-ink">
                Configure {garment.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section>
                <h4 className="mb-3 text-[15px] font-semibold text-ink">Previous measurements</h4>
                <div className="space-y-2 rounded-lg border border-border-soft bg-surface p-3">
                  {defaultSeed && defaultHasMeasurements && (
                      <button
                        type="button"
                        onClick={() => loadMeasurementValues(defaultSeed.values, defaultSeed.notes)}
                        className="flex w-full items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-primary-tint"
                      >
                        <span>Customer default measurements</span>
                        <span className="text-xs text-ink-muted">
                          {Object.values(defaultSeed.values).filter((value) => value.trim()).length} fields
                        </span>
                      </button>
                    )}
                  {loadingHistory ? (
                    <p className="text-sm text-ink-muted">Loading previous measurements...</p>
                  ) : history.length === 0 && !defaultHasMeasurements ? (
                    <p className="text-sm text-ink-muted">
                      No previous measurements found for this customer and garment.
                    </p>
                  ) : (
                    history.map((snapshot) => (
                      <button
                        key={`${snapshot.orderId}-${snapshot.serialNo}`}
                        type="button"
                        onClick={() => loadMeasurementValues(snapshot.measurements)}
                        className="flex w-full items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-primary-tint"
                      >
                        <span>
                          {snapshot.orderNumber} - {formatOrderDate(snapshot.orderDate)}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {Object.values(measurementValuesOnly(snapshot.measurements)).filter((value) => value.trim()).length} fields
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-[15px] font-semibold text-ink">Measurements</h4>
                {fields.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {fields.map(({ key, label }, index) => (
                      <label key={key} className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-medium text-ink-muted">{label}</span>
                        <input
                          ref={(node) => {
                            if (index === 0) firstMeasurementRef.current = node;
                          }}
                          type="text"
                          inputMode="decimal"
                          value={measurement.values[key] ?? ""}
                          onChange={(event) =>
                            setMeasurement((current) => ({
                              ...current,
                              values: { ...current.values, [key]: event.target.value },
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted">
                    No standard measurement fields for this garment.
                  </p>
                )}
                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Measurement Notes</span>
                  <textarea
                    ref={(node) => {
                      if (fields.length === 0) firstMeasurementRef.current = node;
                    }}
                    value={measurement.notes}
                    onChange={(event) =>
                      setMeasurement((current) => ({ ...current, notes: event.target.value }))
                    }
                    rows={3}
                    className="rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                  />
                </label>
                <label className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={measurement.updateCustomerMeasurements ?? false}
                    onChange={(event) =>
                      setMeasurement((current) => ({
                        ...current,
                        updateCustomerMeasurements: event.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary-tint"
                  />
                  <span className="text-[13px] font-medium text-ink-muted">
                    Save as customer&apos;s default {garment.name} measurements
                  </span>
                </label>
              </section>

              <section>
                <h4 className="mb-3 text-[15px] font-semibold text-ink">Add-ons</h4>
                {addOnOptions.length === 0 ? (
                  <p className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted">
                    No add-ons configured for this garment.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {addOnOptions.map((addOn) => (
                      <label
                        key={addOn.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border-soft bg-white px-3 py-2 text-sm transition-colors hover:bg-surface"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedAddOnIds.includes(addOn.id)}
                            onChange={() => toggleAddOn(addOn.id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary-tint"
                          />
                          <span className="font-medium text-ink">{addOn.name}</span>
                        </span>
                        <span className="text-ink-muted">+{formatCurrency(addOn.defaultPrice)}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-sm text-ink-muted">
                  {selectedAddOnsForModal.length > 0
                    ? `Selected add-ons: ${selectedAddOnsForModal.map((addOn) => addOn.name).join(", ")}`
                    : "No add-ons selected"}
                </p>
              </section>

            </div>

            <div className="flex items-center gap-2 border-t border-border-soft bg-white px-5 py-4">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
              >
                {mode === "add" ? "Save Item Details" : "Update Item Details"}
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
      </div>
    </>
  );
}

export function NewOrderItemsCard({
  customerId,
  items,
  onItemsChange,
  garmentTypes,
  addOns,
  autoSnapshotDefaultMeasurements = false,
  focusFirstGarmentRequest = 0,
  excludeOrderId,
}: {
  customerId: string | null;
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  previousOrders?: Order[];
  autoSnapshotDefaultMeasurements?: boolean;
  focusFirstGarmentRequest?: number;
  excludeOrderId?: string;
}) {
  const selectorRef = useRef<HTMLInputElement | null>(null);
  const editButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rateInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeGarments = useMemo(
    () => sortGarmentsForKeyboard(garmentTypes),
    [garmentTypes]
  );
  const rows = configuredDraftItems(items);
  const [modal, setModal] = useState<null | {
    mode: ItemModalMode;
    index?: number;
    draft: DraftItem;
    returnKey?: string;
  }>(null);

  useEffect(() => {
    if (focusFirstGarmentRequest <= 0) return;
    window.setTimeout(() => selectorRef.current?.focus(), 0);
  }, [focusFirstGarmentRequest]);

  function openAddModal(garmentTypeId: string) {
    const garment = findGarmentById(garmentTypes, garmentTypeId);
    if (!garment) return;
    setModal({ mode: "add", draft: newDraftForGarment(garment) });
  }

  function saveModalDraft(nextDraft: DraftItem) {
    if (modal?.mode === "edit" && typeof modal.index === "number") {
      onItemsChange(items.map((item, index) => (index === modal.index ? nextDraft : item)));
      const returnKey = modal.returnKey ?? nextDraft.draftKey;
      setModal(null);
      window.setTimeout(() => editButtonRefs.current[returnKey]?.focus(), 0);
      return;
    }
    onItemsChange([...items.filter((item) => item.garmentTypeId), nextDraft]);
    setModal(null);
    window.setTimeout(() => qtyInputRefs.current[nextDraft.draftKey]?.focus(), 0);
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    onItemsChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function deleteRow(index: number) {
    if (!window.confirm("Remove this item?")) return;
    onItemsChange(items.filter((_, itemIndex) => itemIndex !== index));
    window.setTimeout(() => selectorRef.current?.focus(), 0);
  }

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold text-ink">Order Items</h3>
          <p className="text-sm text-ink-muted">Select a garment code to configure an item.</p>
        </div>
        <div className="w-full max-w-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">Garment Type</span>
            <GarmentTypeCombobox
              value=""
              garments={activeGarments}
              inputRef={(node) => {
                selectorRef.current = node;
              }}
              onChange={openAddModal}
              onSelected={() => undefined}
            />
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-soft bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          No items added yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-soft">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-[13px] font-semibold text-ink-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">Garment</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Qty</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Rate</th>
                <th className="whitespace-nowrap px-4 py-3">Add-ons</th>
                <th className="whitespace-nowrap px-4 py-3">Measurements</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, index }) => {
                const garment = findGarmentById(garmentTypes, item.garmentTypeId);
                const selected = selectedAddOns(item, garmentTypes, addOns);
                const measurementCount = item.measurement ? countFilledFields(item.measurement) : 0;
                const amount = computeAmount(item, garmentTypes, addOns);
                return (
                  <tr key={item.draftKey} className="border-t border-border-soft">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">
                      {garment ? formatGarmentCodeName(garment) : "Unknown garment"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ink">
                      <input
                        ref={(node) => {
                          qtyInputRefs.current[item.draftKey] = node;
                        }}
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(event) =>
                          updateItem(index, { qty: Number(event.target.value) })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            rateInputRefs.current[item.draftKey]?.focus();
                          }
                        }}
                        className="h-9 w-20 rounded-lg border border-border bg-white px-2.5 text-right text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ink">
                      <input
                        ref={(node) => {
                          rateInputRefs.current[item.draftKey] = node;
                        }}
                        type="number"
                        min={0}
                        value={item.rate}
                        onChange={(event) =>
                          updateItem(index, {
                            rate: Number(event.target.value),
                            rateOverridden: true,
                          })
                        }
                        className="h-9 w-28 rounded-lg border border-border bg-white px-2.5 text-right text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {selected.length > 0 ? selected.map((addOn) => addOn.name).join(", ") : "None"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {measurementCount > 0 ? `${measurementCount} fields` : "Not entered"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">
                      {formatCurrency(amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          ref={(node) => {
                            editButtonRefs.current[item.draftKey] = node;
                          }}
                          onClick={() => setModal({
                            mode: "edit",
                            index,
                            draft: item,
                            returnKey: item.draftKey,
                          })}
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(index)}
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-ink-faint transition-colors hover:bg-chip-red hover:text-chip-red-fg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (() => {
        const garment = findGarmentById(garmentTypes, modal.draft.garmentTypeId);
        if (!garment) return null;
        return (
          <ConfigureItemModal
            mode={modal.mode}
            draft={modal.draft}
            garment={garment}
            addOns={addOns}
            customerId={customerId}
            excludeOrderId={excludeOrderId}
            autoSnapshotDefaultMeasurements={autoSnapshotDefaultMeasurements}
            onCancel={() => {
              const returnKey = modal.returnKey;
              setModal(null);
              window.setTimeout(() => {
                if (returnKey) {
                  editButtonRefs.current[returnKey]?.focus();
                } else {
                  selectorRef.current?.focus();
                }
              }, 0);
            }}
            onSave={saveModalDraft}
          />
        );
      })()}
    </div>
  );
}

// Item Amount = Qty Ã- (Rate + selected add-ons total) - Rate here is the
// row's current effective rate (Catalog base price, or the shopkeeper's
// manual override), not necessarily the garment's basePrice.
function computeAmount(
  it: DraftItem,
  garmentTypes: CatalogGarmentType[],
  addOns: CatalogAddOn[]
): number {
  return calculateGarmentAmount(it.rate, selectedAddOns(it, garmentTypes, addOns), it.qty);
}

export function computeOrderItems(
  items: DraftItem[],
  garmentTypes: CatalogGarmentType[],
  addOns: CatalogAddOn[]
): {
  computedItems: OrderItem[];
  totalAmount: number;
} {
  const computedItems: OrderItem[] = items.map((it, i) => {
    const garment = findGarmentById(garmentTypes, it.garmentTypeId);
    const itemAddOns: OrderItemAddOn[] = selectedAddOns(it, garmentTypes, addOns).map((a) => ({
      key: a.id,
      label: a.name,
      amount: a.defaultPrice,
    }));
    const addOnsTotal = itemAddOns.reduce((sum, a) => sum + a.amount, 0);
    const finalRate = it.rate + addOnsTotal;
    // Only snapshot measurements onto the item when the shopkeeper actually
    // opened/filled the modal for this row (it.measurement !== null) - not
    // silently pulling in auto-seeded baseline values they never confirmed.
    const hasMeasurements =
      it.measurement && countFilledFields(it.measurement) > 0;
    return {
      id: it.orderItemId,
      serialNo: i + 1,
      particular: garment?.name ?? "",
      // Catalog garment type id, so order_items can reference
      // catalog_garment_types "where possible" (Phase 6C) - Edit Order's
      // own items never set this, since that flow has no Catalog dropdown.
      garmentTypeId: it.garmentTypeId || undefined,
      qty: it.qty,
      rate: it.rate,
      addOns: itemAddOns.length > 0 ? itemAddOns : undefined,
      addOnsTotal: addOnsTotal > 0 ? addOnsTotal : undefined,
      finalRate,
      amount: finalRate * it.qty,
      measurements: hasMeasurements
        ? {
            ...measurementValuesOnly(it.measurement!.values),
            ...(it.measurement!.notes.trim()
              ? { [MEASUREMENT_NOTES_KEY]: it.measurement!.notes.trim() }
              : {}),
          }
        : undefined,
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
    };
  });
  const totalAmount = computedItems.reduce((sum, i) => sum + i.amount, 0);
  return { computedItems, totalAmount };
}

const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

function garmentCodeLabel(garment: CatalogGarmentType): string {
  return garment.shortcutCode === null ? "-" : String(garment.shortcutCode);
}

function garmentDisplayLabel(garment: CatalogGarmentType): string {
  return `${garmentCodeLabel(garment)} - ${garment.name}`;
}

function sortGarmentsForKeyboard(
  garments: CatalogGarmentType[]
): CatalogGarmentType[] {
  return [...garments].sort((a, b) => {
    if (a.shortcutCode !== null && b.shortcutCode !== null) {
      return a.shortcutCode - b.shortcutCode;
    }
    if (a.shortcutCode !== null) return -1;
    if (b.shortcutCode !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

function GarmentTypeCombobox({
  value,
  garments,
  required,
  inputRef,
  onChange,
  onSelected,
}: {
  value: string;
  garments: CatalogGarmentType[];
  required?: boolean;
  inputRef?: (node: HTMLInputElement | null) => void;
  onChange: (garmentTypeId: string) => void;
  onSelected: () => void;
}) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const selectedGarment = garments.find((g) => g.id === value);
  const trimmedQuery = query.trim();
  const numericQuery = /^\d+$/.test(trimmedQuery);

  const filteredGarments = useMemo(() => {
    if (!trimmedQuery) return garments;
    const normalized = trimmedQuery.toLowerCase();
    if (numericQuery) {
      return garments.filter((garment) =>
        garment.shortcutCode?.toString().startsWith(trimmedQuery)
      );
    }
    return garments.filter((garment) =>
      garment.name.toLowerCase().includes(normalized)
    );
  }, [garments, numericQuery, trimmedQuery]);

  const inputValue = open
    ? query
    : selectedGarment
      ? garmentDisplayLabel(selectedGarment)
      : "";

  function selectGarment(garment: CatalogGarmentType) {
    setError(null);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    onChange(garment.id);
    window.setTimeout(onSelected, 0);
  }

  function handleEnter() {
    if (numericQuery) {
      const exactMatch = garments.find(
        (garment) => garment.shortcutCode?.toString() === trimmedQuery
      );
      if (exactMatch) {
        selectGarment(exactMatch);
        return;
      }
      setError(`No garment found for code ${trimmedQuery}`);
      setOpen(true);
      return;
    }

    const activeGarment = filteredGarments[activeIndex];
    if (activeGarment) selectGarment(activeGarment);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        filteredGarments.length === 0
          ? 0
          : Math.min(current + 1, filteredGarments.length - 1)
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnter();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      setError(null);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        ref={inputRef}
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && filteredGarments[activeIndex]
            ? `${listboxId}-${filteredGarments[activeIndex].id}`
            : undefined
        }
        autoComplete="off"
        value={inputValue}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setError(null);
          setActiveIndex(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setError(null);
          setActiveIndex(0);
        }}
        onKeyDown={handleInputKeyDown}
        placeholder={t("common.selectEllipsis")}
        className={inputClass}
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-soft bg-white py-1 shadow-soft"
        >
          {filteredGarments.length === 0 ? (
            <div className="px-3 py-2 text-sm text-ink-muted">No garments found</div>
          ) : (
            filteredGarments.map((garment, index) => (
              <button
                key={garment.id}
                id={`${listboxId}-${garment.id}`}
                type="button"
                role="option"
                aria-selected={garment.id === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectGarment(garment)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  index === activeIndex
                    ? "bg-primary-tint text-primary"
                    : "text-ink hover:bg-surface"
                }`}
              >
                <span className="min-w-8 rounded-md border border-border-soft bg-white px-1.5 py-0.5 text-center font-mono text-xs font-semibold text-primary">
                  {garmentCodeLabel(garment)}
                </span>
                <span className="text-ink-faint">-</span>
                <span className="min-w-0 truncate font-medium">{garment.name}</span>
              </button>
            ))
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs font-medium text-chip-red-fg">{error}</p>}
    </div>
  );
}
