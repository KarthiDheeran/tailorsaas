"use client";

import { useRef, useState } from "react";
import { Plus, Ruler, Tag, Trash2 } from "lucide-react";
import { getGarmentMeasurementDraftSeed } from "@/lib/data/stub-data";
import {
  getActiveGarmentTypes,
  getAddOnsForGarment,
  getGarmentById,
  calculateGarmentAmount,
  measurementFields as catalogMeasurementFieldLibrary,
  type CatalogAddOn,
  type CatalogGarmentType,
} from "@/lib/catalog";
import type { OrderItem, OrderItemAddOn } from "@/lib/types";
import {
  GarmentMeasurementModal,
  countFilledFields,
  type GarmentMeasurementDraft,
} from "@/components/orders/garment-measurement-modal";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/components/i18n/language-provider";

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

export interface DraftItem {
  // Catalog garment type id (lib/catalog.ts is the source of truth for
  // pricing/measurement fields/add-ons).
  garmentTypeId: string;
  qty: number;
  rate: number;
  // Once the shopkeeper edits Rate directly, garment changes stop
  // auto-filling it — manual override always wins for that row.
  rateOverridden: boolean;
  addOnIds: string[];
  // null = not yet touched in this session; the Measurements modal seeds
  // itself from customer/garment history on first open.
  measurement: GarmentMeasurementDraft | null;
}

export function blankDraftItem(): DraftItem {
  return {
    garmentTypeId: "",
    qty: 1,
    rate: 0,
    rateOverridden: false,
    addOnIds: [],
    measurement: null,
  };
}

// Reverse-maps a previously saved order item back into a draft row, for the
// Repeat Order action. Garment is matched by name against the *active*
// catalog list (an inactive/renamed garment simply comes back unselected —
// qty/rate still carry over so the shopkeeper only needs to re-pick it).
// Rate is always treated as an override so the customer's previously agreed
// price is preserved even if the catalog's base price has since changed.
export function orderItemToDraftItem(item: OrderItem): DraftItem {
  const garment = getActiveGarmentTypes().find(
    (g) => g.name.toLowerCase() === item.particular.trim().toLowerCase()
  );
  const addOnIds = garment
    ? getAddOnsForGarment(garment)
        .filter((a) =>
          item.addOns?.some(
            (io) => io.label.toLowerCase() === a.name.toLowerCase()
          )
        )
        .map((a) => a.id)
    : [];
  return {
    garmentTypeId: garment?.id ?? "",
    qty: item.qty,
    rate: item.rate,
    rateOverridden: true,
    addOnIds,
    measurement: null,
  };
}

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

export function computeOrderItems(items: DraftItem[]): {
  computedItems: OrderItem[];
  totalAmount: number;
} {
  const computedItems: OrderItem[] = items.map((it, i) => {
    const garment = getGarmentById(it.garmentTypeId);
    const addOns: OrderItemAddOn[] = selectedAddOns(it).map((a) => ({
      key: a.id,
      label: a.name,
      amount: a.defaultPrice,
    }));
    const addOnsTotal = addOns.reduce((sum, a) => sum + a.amount, 0);
    const finalRate = it.rate + addOnsTotal;
    // Only snapshot measurements onto the item when the shopkeeper actually
    // opened/filled the modal for this row (it.measurement !== null) — not
    // silently pulling in auto-seeded baseline values they never confirmed.
    const hasMeasurements =
      it.measurement && countFilledFields(it.measurement) > 0;
    return {
      serialNo: i + 1,
      particular: garment?.name ?? "",
      qty: it.qty,
      rate: it.rate,
      addOns: addOns.length > 0 ? addOns : undefined,
      addOnsTotal: addOnsTotal > 0 ? addOnsTotal : undefined,
      finalRate,
      amount: finalRate * it.qty,
      measurements: hasMeasurements ? { ...it.measurement!.values } : undefined,
    };
  });
  const totalAmount = computedItems.reduce((sum, i) => sum + i.amount, 0);
  return { computedItems, totalAmount };
}

const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

function AddOnsPicker({
  addOns,
  selectedIds,
  onToggle,
  garmentSelected,
}: {
  // Only the add-ons linked to the selected garment type (lib/catalog.ts's
  // getAddOnsForGarment) — never the full add-ons master.
  addOns: CatalogAddOn[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  garmentSelected: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const disabled = !garmentSelected || addOns.length === 0;
  const selected = addOns.filter((a) => selectedIds.includes(a.id));
  const selectedTotal = selected.reduce((sum, a) => sum + a.defaultPrice, 0);
  // Shows the add-ons total inline so it's visible alongside Rate/Amount —
  // otherwise Amount = (Rate + add-ons) × Qty looks like an unexplained
  // mismatch against Rate alone.
  const label =
    selected.length > 0
      ? `${t("common.addOns")}: ${selected.length} · ₹${selectedTotal.toLocaleString("en-IN")}`
      : t("common.addOns");

  // Popover is positioned `fixed` (computed from the trigger button's own
  // viewport rect) rather than `absolute`, so it isn't clipped by any
  // ancestor's overflow/stacking context.
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
        title={
          !garmentSelected
            ? t("orders.selectGarmentFirst")
            : addOns.length === 0
              ? t("orders.noAddOnsConfigured")
              : t("orders.selectAddOns")
        }
        className={`flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors ${
          disabled
            ? "cursor-not-allowed border-border-soft text-ink-faint"
            : "cursor-pointer border-border text-ink hover:bg-surface"
        }`}
      >
        <Tag className="h-3.5 w-3.5 shrink-0" />
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

export function NewOrderItemsCard({
  customerId,
  items,
  onItemsChange,
}: {
  // null while the customer is still unsaved (brand-new customer) — the
  // Measurements modal simply has nothing to seed from yet in that case.
  customerId: string | null;
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
}) {
  const { t } = useLanguage();
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const activeGarments = getActiveGarmentTypes();

  function updateItem(index: number, patch: Partial<DraftItem>) {
    onItemsChange(
      items.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }
  function addItem() {
    onItemsChange([...items, blankDraftItem()]);
  }
  function removeItem(index: number) {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function handleGarmentTypeChange(index: number, garmentTypeId: string) {
    const garment = getGarmentById(garmentTypeId);
    onItemsChange(
      items.map((it, i) => {
        if (i !== index) return it;
        const rate = it.rateOverridden ? it.rate : garment?.basePrice ?? 0;
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
    onItemsChange(
      items.map((it, i) => {
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
    if (!customerId) return { garmentType: garmentName, values: {}, fitNotes: "", notes: "" };
    const seed = getGarmentMeasurementDraftSeed(customerId, garmentName);
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

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold text-ink">{t("orders.orderItems")}</h3>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
        >
          <Plus className="h-4 w-4" /> {t("orders.addItem")}
        </button>
      </div>
      <div className="space-y-3">
        {items.map((it, i) => {
          const garment = getGarmentById(it.garmentTypeId);
          const addOnOptions = garment ? getAddOnsForGarment(garment) : [];
          const amount = computeAmount(it);
          const measurementsFilled = hasMeasurementData(i);
          const hasMeasurementFields = (garment?.measurementFieldIds.length ?? 0) > 0;
          const measurementsDisabled = !it.garmentTypeId || !hasMeasurementFields;
          return (
            <div key={i} className="rounded-lg border border-border-soft p-3">
              <div className="grid grid-cols-[1.6fr_0.7fr_0.9fr_0.9fr] items-end gap-3">
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.garmentType")}
                  </span>
                  <Select
                    required
                    value={it.garmentTypeId}
                    onChange={(e) => handleGarmentTypeChange(i, e.target.value)}
                  >
                    <option value="" disabled>
                      {t("common.selectEllipsis")}
                    </option>
                    {activeGarments.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.qty")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.rate")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={it.rate}
                    onChange={(e) => handleRateChange(i, Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.amount")}
                  </span>
                  <div className="flex h-11 items-center text-sm font-semibold text-ink">
                    ₹{amount.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border-soft pt-3">
                <AddOnsPicker
                  addOns={addOnOptions}
                  selectedIds={it.addOnIds}
                  onToggle={(id) => toggleAddOn(i, id)}
                  garmentSelected={!!it.garmentTypeId}
                />
                <button
                  type="button"
                  onClick={() => setActiveItemIndex(i)}
                  disabled={measurementsDisabled}
                  title={
                    !it.garmentTypeId
                      ? t("orders.selectGarmentFirst")
                      : !hasMeasurementFields
                        ? t("orders.noMeasurementFieldsConfigured")
                        : undefined
                  }
                  className={`flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors ${
                    measurementsDisabled
                      ? "cursor-not-allowed border-border-soft text-ink-faint"
                      : measurementsFilled
                        ? "cursor-pointer border-primary text-primary hover:bg-primary-tint"
                        : "cursor-pointer border-border text-ink hover:bg-surface"
                  }`}
                >
                  <Ruler className="h-3.5 w-3.5 shrink-0" />
                  {measurementsFilled ? t("orders.measurementsAdded") : t("orders.measurements")}
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  title={t("orders.removeItem")}
                  className="ml-auto flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-sm font-medium text-ink-faint transition-colors hover:bg-chip-red hover:text-chip-red-fg disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  {t("orders.deleteItem")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
    </div>
  );
}
