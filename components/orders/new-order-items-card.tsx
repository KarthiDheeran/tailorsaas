"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Ruler, Tag, Trash2 } from "lucide-react";
import { getGarmentMeasurementDraftSeedAction } from "@/app/(shell)/customers/actions";
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
  GarmentMeasurementModal,
  MEASUREMENT_NOTES_KEY,
  countFilledFields,
  measurementNotesFromValues,
  measurementValuesOnly,
  type GarmentMeasurementDraft,
} from "@/components/orders/garment-measurement-modal";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

const FABRIC_SOURCES: OrderItemFabricSource[] = [
  "Not specified",
  "Customer provided",
  "Shop provided",
];

const ALTERATION_CHARGE_TYPES: AlterationChargeType[] = ["Paid", "Free"];

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
// (app/(shell)/orders/new/page.tsx), and threaded down as plain arrays —
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
  // auto-filling it — manual override always wins for that row.
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
// catalog list (an inactive/renamed garment simply comes back unselected —
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

function isAlterationGarment(
  garment: CatalogGarmentType | undefined
): boolean {
  return (garment?.name ?? "").toLowerCase().includes("alteration");
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

// Item Amount = Qty × (Rate + selected add-ons total) — Rate here is the
// row's current effective rate (Catalog base price, or the shopkeeper's
// manual override), not necessarily the garment's basePrice.
function computeAmount(
  it: DraftItem,
  garmentTypes: CatalogGarmentType[],
  addOns: CatalogAddOn[]
): number {
  return calculateGarmentAmount(it.rate, selectedAddOns(it, garmentTypes, addOns), it.qty);
}

function hasGarmentSpecificDraftData(it: DraftItem): boolean {
  return (
    it.addOnIds.length > 0 ||
    (it.measurement !== null &&
      (countFilledFields(it.measurement) > 0 || it.measurement.notes.trim() !== ""))
  );
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
    // opened/filled the modal for this row (it.measurement !== null) — not
    // silently pulling in auto-seeded baseline values they never confirmed.
    const hasMeasurements =
      it.measurement && countFilledFields(it.measurement) > 0;
    return {
      id: it.orderItemId,
      serialNo: i + 1,
      particular: garment?.name ?? "",
      // Catalog garment type id, so order_items can reference
      // catalog_garment_types "where possible" (Phase 6C) — Edit Order's
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

const itemCardClass = "overflow-hidden rounded-lg border border-border-soft bg-white";
const itemCardHeaderClass =
  "flex items-center justify-between gap-3 border-b border-border-soft bg-primary-tint/60 px-4 py-1.5";
const itemCardBodyClass = "p-4";

function orderItemActionButtonClass({
  disabled,
  saved,
}: {
  disabled?: boolean;
  saved?: boolean;
}) {
  const base =
    "flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors";
  if (disabled) {
    return `${base} cursor-not-allowed border-border-soft text-ink-faint`;
  }
  if (saved) {
    return `${base} cursor-pointer border-primary bg-primary-tint text-primary hover:bg-primary/10`;
  }
  return `${base} cursor-pointer border-border bg-white text-ink hover:bg-surface`;
}

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
      ? `${t("common.addOns")}: ${selected.length} · ${formatCurrency(selectedTotal)}`
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
        className={orderItemActionButtonClass({
          disabled,
          saved: selected.length > 0,
        })}
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
                <span className="text-ink-muted">+{formatCurrency(a.defaultPrice)}</span>
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
  garmentTypes,
  addOns,
  previousOrders = [],
  autoSnapshotDefaultMeasurements = false,
}: {
  // null while the customer is still unsaved (brand-new customer) — the
  // Measurements modal simply has nothing to seed from yet in that case.
  customerId: string | null;
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
  // Phase 6B: fetched once at the page level (active garment types, all
  // add-ons) and passed down here — every lookup in this component is a
  // pure, synchronous find() over these arrays, not its own Supabase call.
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  previousOrders?: Order[];
  autoSnapshotDefaultMeasurements?: boolean;
}) {
  const { t } = useLanguage();
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  // Already pre-filtered to active garments by the page's fetch
  // (getActiveGarmentTypesAction) — no further filtering needed here.
  const activeGarments = garmentTypes;
  // Phase 5A: measurement seeds now come from a Server Action
  // (getGarmentMeasurementDraftSeedAction), not a synchronous stub-data.ts
  // call — cached here since measurementDraftFor/hasMeasurementData are read
  // multiple times per render (once per item row, every render).
  const [seedCache, setSeedCache] = useState<
    Record<string, { values: Record<string, string>; fitNotes: string; notes: string }>
  >({});

  const garmentNames = items
    .map((it) => findGarmentById(garmentTypes, it.garmentTypeId)?.name)
    .filter((n): n is string => !!n);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    const missing = Array.from(new Set(garmentNames)).filter(
      (name) => !(`${customerId}::${name.toLowerCase()}` in seedCache)
    );
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (name) => {
        const seed = await getGarmentMeasurementDraftSeedAction(customerId, name);
        return [`${customerId}::${name.toLowerCase()}`, seed] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setSeedCache((prev) => {
        const next = { ...prev };
        for (const [key, seed] of entries) next[key] = seed;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, garmentNames.join("|")]);

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
    const current = items[index];
    if (
      current.garmentTypeId &&
      current.garmentTypeId !== garmentTypeId &&
      hasGarmentSpecificDraftData(current) &&
      !window.confirm(
        "Changing the garment type will clear this item's add-ons and measurements. Continue?"
      )
    ) {
      return;
    }
    const garment = findGarmentById(garmentTypes, garmentTypeId);
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
    const garmentName = findGarmentById(garmentTypes, it.garmentTypeId)?.name ?? "";
    if (it.measurement) return it.measurement;
    if (!customerId) return {
      garmentType: garmentName,
      values: {},
      fitNotes: "",
      notes: "",
      updateCustomerMeasurements: false,
      hasCustomerDefaultMeasurements: false,
    };
    const seed = seedCache[`${customerId}::${garmentName.toLowerCase()}`];
    if (!seed) return {
      garmentType: garmentName,
      values: {},
      fitNotes: "",
      notes: "",
      updateCustomerMeasurements: false,
      hasCustomerDefaultMeasurements: false,
    };
    const seededDraft = { garmentType: garmentName, ...seed };
    return {
      ...seededDraft,
      updateCustomerMeasurements: false,
      hasCustomerDefaultMeasurements: countFilledFields(seededDraft) > 0,
    };
  }

  useEffect(() => {
    if (!autoSnapshotDefaultMeasurements || !customerId) return;
    let changed = false;
    const nextItems = items.map((it) => {
      if (it.measurement !== null || !it.garmentTypeId) return it;
      const garmentName = findGarmentById(garmentTypes, it.garmentTypeId)?.name ?? "";
      if (!garmentName) return it;
      const seed = seedCache[`${customerId}::${garmentName.toLowerCase()}`];
      if (!seed) return it;
      const seededDraft = { garmentType: garmentName, ...seed };
      const draft: GarmentMeasurementDraft = {
        ...seededDraft,
        updateCustomerMeasurements: false,
        hasCustomerDefaultMeasurements: countFilledFields(seededDraft) > 0,
      };
      if (countFilledFields(draft) === 0) return it;
      changed = true;
      return { ...it, measurement: draft };
    });
    if (changed) onItemsChange(nextItems);
  }, [
    autoSnapshotDefaultMeasurements,
    customerId,
    items,
    garmentTypes,
    seedCache,
    onItemsChange,
  ]);

  function hasMeasurementData(index: number): boolean {
    const it = items[index];
    if (!it.garmentTypeId) return false;
    // Saved-state means this order item has its own measurement snapshot in
    // the draft/order, not merely that customer defaults are available to seed
    // the modal when the user opens it.
    return it.measurement !== null && countFilledFields(it.measurement) > 0;
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
      <div className="space-y-8">
        {items.map((it, i) => {
          const garment = findGarmentById(garmentTypes, it.garmentTypeId);
          const addOnOptions = garment ? getAddOnsForGarment(garment, addOns) : [];
          const amount = computeAmount(it, garmentTypes, addOns);
          const measurementsFilled = hasMeasurementData(i);
          const hasMeasurementFields = (garment?.measurementFieldIds.length ?? 0) > 0;
          const measurementsDisabled = !it.garmentTypeId || !hasMeasurementFields;
          const isAlteration = isAlterationGarment(garment);
          return (
            <div key={i} className={itemCardClass}>
              <div className={itemCardHeaderClass}>
                <p className="text-[15px] font-semibold text-ink">
                  Item {i + 1}
                </p>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  title={t("orders.removeItem")}
                  className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-2.5 text-xs font-medium text-ink-faint transition-colors hover:bg-chip-red hover:text-chip-red-fg disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  {t("orders.deleteItem")}
                </button>
              </div>
              <div className={itemCardBodyClass}>
              <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.6fr_0.7fr_0.9fr_0.9fr]">
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
                <label className="flex min-w-0 flex-col gap-1.5 sm:col-auto">
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
                <label className="flex min-w-0 flex-col gap-1.5 sm:col-auto">
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
                    {formatCurrency(amount)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 border-t border-border-soft pt-3 md:grid-cols-[0.8fr_1fr_1fr]">
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.fabricSource")}
                  </span>
                  <Select
                    value={it.fabricSource}
                    onChange={(e) =>
                      updateItem(i, {
                        fabricSource: e.target.value as OrderItemFabricSource,
                      })
                    }
                  >
                    {FABRIC_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
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
                <label className="flex min-w-0 flex-col gap-1.5">
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
              </div>
              {isAlteration && (
                <div className="mt-3 grid gap-3 border-t border-border-soft pt-3 md:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">
                      Original Issue
                    </span>
                    <textarea
                      value={it.alterationIssue}
                      onChange={(e) => updateItem(i, { alterationIssue: e.target.value })}
                      placeholder="Too tight at waist, sleeve length wrong, torn seam..."
                      rows={2}
                      className="min-h-[44px] w-full min-w-0 resize-y rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5">
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
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">
                      Free / Paid
                    </span>
                    <Select
                      value={it.alterationChargeType}
                      onChange={(e) =>
                        updateItem(i, {
                          alterationChargeType: e.target.value as AlterationChargeType,
                          rate: e.target.value === "Free" ? 0 : it.rate,
                          rateOverridden:
                            e.target.value === "Free" ? true : it.rateOverridden,
                        })
                      }
                    >
                      {ALTERATION_CHARGE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">
                      Linked Original Order
                    </span>
                    <Select
                      value={it.linkedOriginalOrderId}
                      onChange={(e) =>
                        updateItem(i, { linkedOriginalOrderId: e.target.value })
                      }
                    >
                      <option value="">Not linked</option>
                      {previousOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.orderNumber} -{" "}
                          {order.items.map((item) => item.particular).join(", ")}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
              )}
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
                  className={orderItemActionButtonClass({
                    disabled: measurementsDisabled,
                    saved: measurementsFilled,
                  })}
                >
                  <Ruler className="h-3.5 w-3.5 shrink-0" />
                  {measurementsFilled ? t("orders.measurementsAdded") : t("orders.measurements")}
                </button>
              </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeItemIndex !== null && (
        <GarmentMeasurementModal
          initial={measurementDraftFor(activeItemIndex)}
          fields={garmentMeasurementFields(
            findGarmentById(garmentTypes, items[activeItemIndex].garmentTypeId)
          )}
          onCancel={() => setActiveItemIndex(null)}
          onSave={handleSaveMeasurement}
        />
      )}
    </div>
  );
}
