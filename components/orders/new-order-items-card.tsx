"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pencil, Shirt, ShoppingBag, Trash2, X } from "lucide-react";
import {
  getMeasurementPickerDataAction,
  type HistoricalMeasurementSnapshot,
  type MeasurementPickerData,
} from "@/app/(shell)/orders/actions";
import { getGarmentTypeConfigurationAction } from "@/app/(shell)/catalog/actions";
import {
  getAddOnsForGarment,
  calculateGarmentAmount,
  measurementFieldLabel,
  type CatalogGarmentTypeField,
  type CatalogAddOn,
  type CatalogGarmentType,
  type GarmentTypeConfiguration,
  type GarmentSection,
} from "@/lib/catalog";
import {
  createGarmentFieldDraft,
  resolveRuntimeGarmentFields,
  serializeGarmentFieldDraft,
  shouldPrintMeasurementsOnJobCard,
  type GarmentFieldValue,
  type GarmentFieldDraft,
  type RuntimeGarmentField,
} from "@/lib/garment-form-runtime";
import { GarmentFormFields } from "@/components/orders/garment-form-fields";
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

const measurementPickerCache = new Map<string, MeasurementPickerData>();
const measurementPickerRequests = new Map<string, Promise<MeasurementPickerData>>();

function measurementPickerCacheKey(
  customerId: string,
  garmentTypeId: string,
  excludeOrderId?: string
) {
  return `${customerId}:${garmentTypeId}:${excludeOrderId ?? "new"}`;
}

function garmentMeasurementFields(
  garment: CatalogGarmentType | undefined
): { key: string; label: string }[] {
  if (!garment) return [];
  return garment.measurementFieldIds.map((id) => ({
    key: id,
    label: measurementFieldLabel(id),
  }));
}

function legacyStringMeasurementValues(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  );
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
  color: string;
  qty: number;
  rate: number;
  // Once the shopkeeper edits Rate directly, garment changes stop
  // auto-filling it - manual override always wins for that row.
  rateOverridden: boolean;
  addOnIds: string[];
  printMeasurementsOnJobCard: boolean;
  fabricSource: OrderItemFabricSource;
  fabricNotes: string;
  designNotes: string;
  alterationIssue: string;
  alterationRequiredChange: string;
  alterationChargeType: AlterationChargeType;
  linkedOriginalOrderId: string;
  // Typed field draft shared by New Order and Edit Order. The legacy
  // `measurement` draft remains during rollout for customer-profile updates.
  typedFieldDraft?: GarmentFieldDraft;
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
    color: "",
    qty: 1,
    rate: 0,
    rateOverridden: false,
    addOnIds: [],
    printMeasurementsOnJobCard: true,
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
    color: item.size ?? "",
    qty: item.qty,
    rate: item.rate,
    rateOverridden: true,
    addOnIds,
    printMeasurementsOnJobCard: shouldPrintMeasurementsOnJobCard(item.fieldSchemaSnapshot),
    fabricSource: item.fabricSource ?? "Not specified",
    fabricNotes: item.fabricNotes ?? "",
    designNotes: item.designNotes ?? "",
    alterationIssue: item.alterationIssue ?? "",
    alterationRequiredChange: item.alterationRequiredChange ?? "",
    alterationChargeType: item.alterationChargeType ?? "Paid",
    linkedOriginalOrderId: item.linkedOriginalOrderId ?? "",
    typedFieldDraft: createGarmentFieldDraft(item.measurements ?? {}, []),
    measurement: item.measurements
      ? {
          garmentType: item.particular,
          values: legacyStringMeasurementValues(item.measurements),
          fitNotes: "",
          notes: measurementNotesFromValues(legacyStringMeasurementValues(item.measurements)),
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

type PreviousMeasurementOption = {
  id: string;
  label: string;
  values: Record<string, unknown>;
  notes?: string;
  addOnIds?: string[];
};

type FloatingMenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
};

function mergeAddOnInstructionNames(
  existing: string,
  addOnName: string | null,
  knownAddOnNames: string[]
): string {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const namesByNormalizedValue = new Map(
    knownAddOnNames.map((name) => [normalize(name), name.trim()])
  );
  const selectedNames = new Set<string>();
  const manualLines: string[] = [];

  for (const rawLine of existing.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const withoutLegacyPrefix = line.replace(/^add-on:\s*/i, "").trim();
    const canonicalName = namesByNormalizedValue.get(normalize(withoutLegacyPrefix));
    if (canonicalName) selectedNames.add(canonicalName);
    else manualLines.push(line);
  }

  if (addOnName?.trim()) selectedNames.add(addOnName.trim());
  const addOnLine = Array.from(selectedNames).join(" ");
  return [...manualLines, addOnLine].filter(Boolean).join("\n");
}

function configuredDraftItems(items: DraftItem[]): Array<{ item: DraftItem; index: number }> {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.garmentTypeId);
}

function newDraftForGarment(garment: CatalogGarmentType, source?: DraftItem): DraftItem {
  const draft = {
    ...blankDraftItem(),
    garmentTypeId: garment.id,
    rate: garment.basePrice,
  };
  if (!source) return draft;
  return {
    ...draft,
    typedFieldDraft: source.typedFieldDraft
      ? {
          typedValues: { ...source.typedFieldDraft.typedValues },
          passthroughValues: { ...source.typedFieldDraft.passthroughValues },
        }
      : undefined,
    measurement: source.measurement
      ? { ...source.measurement, values: { ...source.measurement.values }, updateCustomerMeasurements: false }
      : null,
    printMeasurementsOnJobCard: source.printMeasurementsOnJobCard,
    addOnIds: [...source.addOnIds],
    color: source.color,
  };
}

function removeAddOnInstructionName(existing: string, addOnName: string): string {
  const escaped = addOnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return existing
    .split("\n")
    .map((line) => line.replace(new RegExp(`(?:add-on:\\s*)?${escaped}`, "gi"), "").replace(/^[,;\s]+|[,;\s]+$/g, "").replace(/\s{2,}/g, " "))
    .filter((line) => line.trim() !== "")
    .join("\n");
}

function ConfigureItemModal({
  mode,
  draft,
  garment,
  addOns,
  preloadedConfiguration,
  configurationsPreloaded,
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
  preloadedConfiguration?: GarmentTypeConfiguration;
  configurationsPreloaded: boolean;
  customerId: string | null;
  excludeOrderId?: string;
  autoSnapshotDefaultMeasurements: boolean;
  onCancel: () => void;
  onSave: (draft: DraftItem) => void;
}) {
  const firstMeasurementRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const previousMeasurementsRef = useRef<HTMLDivElement | null>(null);
  const addOnsComboboxRef = useRef<HTMLDivElement | null>(null);
  const addOnsInputRef = useRef<HTMLInputElement | null>(null);
  const addOnsDropdownRef = useRef<HTMLDivElement | null>(null);
  const addOnOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousMeasurementsListId = useId();
  const addOnsListId = useId();
  const fields = useMemo(() => garmentMeasurementFields(garment), [garment]);
  const [metadataFields, setMetadataFields] = useState<CatalogGarmentTypeField[] | null>(
    preloadedConfiguration?.fields ?? null
  );
  const [metadataLoading, setMetadataLoading] = useState(!configurationsPreloaded);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>(draft.addOnIds);
  const [quantity, setQuantity] = useState(Math.max(1, draft.qty));
  const [color, setColor] = useState(draft.color);
  const [printMeasurementsOnJobCard, setPrintMeasurementsOnJobCard] = useState(
    draft.printMeasurementsOnJobCard
  );
  const legacyRuntimeFields = useMemo<RuntimeGarmentField[]>(
    () =>
      fields.map((field, index) => ({
        code: field.key,
        name: field.label,
        fieldType: "measurement",
        inputType: "number",
        sectionId: null,
        sectionName: "Measurements",
        sectionOrder: 0,
        displayOrder: index,
        required: false,
        unit: "inch",
        placeholder: null,
        options: [],
        min: null,
        max: null,
        decimalPlaces: 2,
        defaultValue: null,
      })),
    [fields]
  );
  const runtimeFields = useMemo(
    () => resolveRuntimeGarmentFields(metadataFields, []) ?? legacyRuntimeFields,
    [legacyRuntimeFields, metadataFields]
  );
  const runtimeDraftFields = useMemo(
    () => runtimeFields.map((field) => ({ code: field.code, inputType: field.inputType })),
    [runtimeFields]
  );
  const [typedFieldDraft, setTypedFieldDraft] = useState<GarmentFieldDraft>(() =>
    createGarmentFieldDraft(
      draft.typedFieldDraft
        ? serializeGarmentFieldDraft(draft.typedFieldDraft)
        : draft.measurement?.values ?? {},
      runtimeDraftFields
    )
  );
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
    values: Record<string, unknown>;
    fitNotes: string;
    notes: string;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedPreviousMeasurement, setSelectedPreviousMeasurement] = useState(
    draft.measurement ? "current-item" : ""
  );
  const [previousMeasurementsOpen, setPreviousMeasurementsOpen] = useState(false);
  const [activePreviousMeasurementIndex, setActivePreviousMeasurementIndex] = useState(0);
  const [addOnSearch, setAddOnSearch] = useState("");
  const [addOnsOpen, setAddOnsOpen] = useState(false);
  const [activeAddOnIndex, setActiveAddOnIndex] = useState(0);
  const [addOnsPosition, setAddOnsPosition] = useState<FloatingMenuPosition | null>(null);
  const addOnOptions = useMemo(
    () => getAddOnsForGarment(garment, addOns).filter((addOn) => addOn.isActive),
    [addOns, garment]
  );
  const addOnInstructionNames = useMemo(
    () => addOnOptions.map((addOn) => addOn.name),
    [addOnOptions]
  );
  const defaultHasMeasurements =
    defaultSeed !== null &&
    (Object.values(defaultSeed.values).some(
      (value) =>
        value !== null &&
        value !== undefined &&
        (typeof value !== "string" || value.trim() !== "") &&
        (!Array.isArray(value) || value.length > 0)
    ) ||
      defaultSeed.notes.trim() !== "");
  const nonInstructionFields = useMemo(
    () => runtimeFields.filter((field) => field.fieldType !== "instruction"),
    [runtimeFields]
  );
  const instructionFields = useMemo(
    () => runtimeFields.filter((field) => field.fieldType === "instruction"),
    [runtimeFields]
  );
  const filteredAddOnOptions = useMemo(() => {
    const query = addOnSearch.trim().toLowerCase();
    if (!query) return addOnOptions;
    return addOnOptions.filter((addOn) =>
      addOn.name.toLowerCase().includes(query)
    );
  }, [addOnOptions, addOnSearch]);
  const previousMeasurementOptions = useMemo<PreviousMeasurementOption[]>(() => {
    const options: PreviousMeasurementOption[] = [];
    if (draft.measurement) {
      options.push({
        id: "current-item",
        label: "Current item measurements",
        values: draft.measurement.values,
        notes: draft.measurement.notes,
        addOnIds: draft.addOnIds,
      });
    }
    if (defaultSeed && defaultHasMeasurements) {
      options.push({
        id: "customer-default",
        label: "Customer default",
        values: defaultSeed.values,
        notes: defaultSeed.notes,
      });
    }
    history.forEach((snapshot) => {
      const id = snapshot.itemId ?? `${snapshot.orderId}-${snapshot.serialNo}`;
      options.push({
        id: `history:${id}`,
        label: `${snapshot.orderNumber} · ${formatOrderDate(snapshot.orderDate)}`,
        values: snapshot.measurements,
        addOnIds: snapshot.addOnIds,
      });
    });
    return options;
  }, [defaultHasMeasurements, defaultSeed, draft.measurement, history]);
  const selectedPreviousMeasurementLabel =
    previousMeasurementOptions.find(
      (option) => option.id === selectedPreviousMeasurement
    )?.label ?? "Select previous measurements";

  useEffect(() => {
    if (metadataLoading) return;
    window.setTimeout(() => firstMeasurementRef.current?.focus(), 0);
  }, [metadataLoading, garment.id]);

  useEffect(() => {
    setTypedFieldDraft(
      createGarmentFieldDraft(
        draft.typedFieldDraft
          ? serializeGarmentFieldDraft(draft.typedFieldDraft)
          : draft.measurement?.values ?? {},
        runtimeDraftFields
      )
    );
  }, [draft.measurement, draft.typedFieldDraft, garment.id, runtimeDraftFields]);

  useEffect(() => {
    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const isSaveShortcut =
        (event.altKey && event.key.toLowerCase() === "s") ||
        (event.ctrlKey && event.key === "Enter");
      if (!isSaveShortcut) return;
      if (previousMeasurementsOpen || addOnsOpen) return;
      event.preventDefault();
      event.stopPropagation();
      formRef.current?.requestSubmit();
    }
    document.addEventListener("keydown", handleDocumentKeyDown, true);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown, true);
  }, [addOnsOpen, previousMeasurementsOpen]);

  useEffect(() => {
    if (!previousMeasurementsOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        previousMeasurementsRef.current &&
        !previousMeasurementsRef.current.contains(event.target as Node)
      ) {
        setPreviousMeasurementsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [previousMeasurementsOpen]);

  useEffect(() => {
    if (!addOnsOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const insideCombobox = addOnsComboboxRef.current?.contains(target) ?? false;
      const insideDropdown = addOnsDropdownRef.current?.contains(target) ?? false;
      if (!insideCombobox && !insideDropdown) {
        setAddOnsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [addOnsOpen]);

  useEffect(() => {
    if (!addOnsOpen) return;
    function updatePosition() {
      const anchor = addOnsInputRef.current ?? addOnsComboboxRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 12;
      const gap = 6;
      const preferredHeight = 256;
      const minimumUsefulHeight = 160;
      const estimatedOptionHeight = 40;
      const estimatedContentHeight =
        filteredAddOnOptions.length === 0
          ? 42
          : filteredAddOnOptions.length * estimatedOptionHeight + 8;
      const contentHeight =
        addOnsDropdownRef.current?.scrollHeight ?? estimatedContentHeight;
      const estimatedPanelHeight = Math.min(preferredHeight, contentHeight);
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const footerTop = footerRef.current?.getBoundingClientRect().top ?? viewportHeight;
      const lowerBoundary = Math.min(viewportHeight - margin, footerTop - gap);
      const spaceBelow = lowerBoundary - rect.bottom - gap;
      const spaceAbove = rect.top - margin;
      const openUp = spaceBelow < minimumUsefulHeight && spaceAbove > spaceBelow;
      const availableSpace = openUp ? spaceAbove - gap : spaceBelow;
      const maxHeight = Math.max(
        42,
        Math.min(estimatedPanelHeight, Math.max(0, availableSpace))
      );
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, viewportWidth - rect.width - margin)
      );
      const top = openUp ? rect.top - gap : rect.bottom + gap;
      setAddOnsPosition({
        left,
        top,
        width: rect.width,
        maxHeight,
        placement: openUp ? "top" : "bottom",
      });
    }
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [addOnsOpen, addOnSearch, filteredAddOnOptions.length]);

  useEffect(() => {
    if (configurationsPreloaded) {
      setMetadataFields(preloadedConfiguration?.fields ?? null);
      setMetadataLoading(false);
      return;
    }
    let cancelled = false;
    setMetadataLoading(true);
    getGarmentTypeConfigurationAction(garment.id)
      .then((configuration) => {
        if (!cancelled) setMetadataFields(configuration?.fields ?? null);
      })
      .catch(() => {
        if (!cancelled) setMetadataFields(null);
      })
      .finally(() => {
        if (!cancelled) setMetadataLoading(false);
      });
    return () => { cancelled = true; };
  }, [configurationsPreloaded, garment.id, preloadedConfiguration]);

  useEffect(() => {
    setTypedFieldDraft((current) => {
      const value = current.typedValues.final_instructions;
      if (typeof value !== "string") return current;
      const normalized = mergeAddOnInstructionNames(value, null, addOnInstructionNames);
      return normalized === value
        ? current
        : { ...current, typedValues: { ...current.typedValues, final_instructions: normalized } };
    });
    setMeasurement((current) => {
      const normalized = mergeAddOnInstructionNames(current.notes, null, addOnInstructionNames);
      return normalized === current.notes ? current : { ...current, notes: normalized };
    });
  }, [addOnInstructionNames]);

  useEffect(() => {
    if (activePreviousMeasurementIndex >= previousMeasurementOptions.length) {
      setActivePreviousMeasurementIndex(0);
    }
  }, [activePreviousMeasurementIndex, previousMeasurementOptions.length]);

  useEffect(() => {
    if (activeAddOnIndex >= filteredAddOnOptions.length) {
      setActiveAddOnIndex(0);
    }
  }, [activeAddOnIndex, filteredAddOnOptions.length]);

  useEffect(() => {
    if (!addOnsOpen) return;
    addOnOptionRefs.current[activeAddOnIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeAddOnIndex, addOnsOpen, filteredAddOnOptions.length]);

  useEffect(() => {
    if (!customerId) {
      setHistory([]);
      setDefaultSeed(null);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    const cacheKey = measurementPickerCacheKey(customerId, garment.id, excludeOrderId);
    const cached = measurementPickerCache.get(cacheKey);
    let request: Promise<MeasurementPickerData>;
    if (cached) {
      request = Promise.resolve(cached);
    } else {
      request = measurementPickerRequests.get(cacheKey) ??
        getMeasurementPickerDataAction(
          customerId,
          garment.id,
          garment.name,
          excludeOrderId
        )
          .then((data) => {
            measurementPickerCache.set(cacheKey, data);
            return data;
          })
          .finally(() => measurementPickerRequests.delete(cacheKey));
      measurementPickerRequests.set(cacheKey, request);
    }

    request.then(({ seed, history: snapshots }) => {
      if (cancelled) return;
      setDefaultSeed(seed);
      setHistory(snapshots);
      setLoadingHistory(false);
      if (!draft.measurement && !draft.typedFieldDraft && autoSnapshotDefaultMeasurements) {
        const latestSnapshot = snapshots[0];
        const latestHasMeasurements = latestSnapshot && Object.values(latestSnapshot.measurements).some(
          (value) =>
            value !== null &&
            value !== undefined &&
            (typeof value !== "string" || value.trim() !== "") &&
            (!Array.isArray(value) || value.length > 0)
        );
        if (latestSnapshot && latestHasMeasurements) {
          const latestLegacyValues = legacyStringMeasurementValues(latestSnapshot.measurements);
          setMeasurement({
            garmentType: garment.name,
            values: measurementValuesOnly(latestLegacyValues),
            fitNotes: "",
            notes: measurementNotesFromValues(latestLegacyValues),
            updateCustomerMeasurements: false,
            hasCustomerDefaultMeasurements: false,
          });
          setTypedFieldDraft(
            createGarmentFieldDraft(latestSnapshot.measurements, runtimeDraftFields)
          );
          setSelectedPreviousMeasurement(
            `history:${latestSnapshot.itemId ?? `${latestSnapshot.orderId}-${latestSnapshot.serialNo}`}`
          );
          setSelectedAddOnIds(latestSnapshot.addOnIds);
          return;
        }

        const seedHasMeasurements =
          Object.values(seed.values).some(
            (value) =>
              value !== null &&
              value !== undefined &&
              (typeof value !== "string" || value.trim() !== "") &&
              (!Array.isArray(value) || value.length > 0)
          ) || seed.notes.trim() !== "";
        const seededDraft: GarmentMeasurementDraft = {
          garmentType: garment.name,
          values: legacyStringMeasurementValues(seed.values),
          fitNotes: seed.fitNotes,
          notes: seed.notes,
          updateCustomerMeasurements: false,
          hasCustomerDefaultMeasurements: seedHasMeasurements,
        };
        if (seedHasMeasurements) {
          setMeasurement(seededDraft);
          setTypedFieldDraft(
            createGarmentFieldDraft(seed.values, runtimeDraftFields)
          );
          setSelectedPreviousMeasurement("customer-default");
        }
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
    runtimeDraftFields,
  ]);

  function toggleAddOn(id: string) {
    const alreadySelected = selectedAddOnIds.includes(id);
    const addOn = addOnOptions.find((candidate) => candidate.id === id);
    setSelectedAddOnIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]
    );

    if (addOn) {
      if (runtimeDraftFields.some((field) => field.code === "final_instructions")) {
        setTypedFieldDraft((current) => ({
          ...current,
          typedValues: {
            ...current.typedValues,
            final_instructions: alreadySelected
              ? removeAddOnInstructionName(typeof current.typedValues.final_instructions === "string" ? current.typedValues.final_instructions : "", addOn.name)
              : mergeAddOnInstructionNames(typeof current.typedValues.final_instructions === "string" ? current.typedValues.final_instructions : "", addOn.name, addOnInstructionNames),
          },
        }));
      } else {
        setMeasurement((current) => ({
          ...current,
          notes: alreadySelected
            ? removeAddOnInstructionName(current.notes, addOn.name)
            : mergeAddOnInstructionNames(current.notes, addOn.name, addOnInstructionNames),
        }));
      }
    }
  }

  function loadMeasurementValues(values: Record<string, unknown>, notes?: string) {
    const legacyValues = legacyStringMeasurementValues(values);
    setTypedFieldDraft(
      createGarmentFieldDraft(values, runtimeDraftFields)
    );
    setMeasurement((current) => ({
      ...current,
      values: measurementValuesOnly(legacyValues),
      notes: measurementNotesFromValues(legacyValues) || notes || "",
    }));
    window.setTimeout(() => firstMeasurementRef.current?.focus(), 0);
  }

  function handleGarmentFieldChange(code: string, value: GarmentFieldValue) {
    setTypedFieldDraft((current) => ({
      ...current,
      typedValues: {
        ...current.typedValues,
        [code]: value,
      },
    }));
  }

  function handlePreviousMeasurementSelect(option: PreviousMeasurementOption) {
    setSelectedPreviousMeasurement(option.id);
    loadMeasurementValues(option.values, option.notes);
    setSelectedAddOnIds(option.addOnIds ?? []);
    setPreviousMeasurementsOpen(false);
  }

  function handleAddOnsInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAddOnsOpen(true);
      setActiveAddOnIndex((current) =>
        Math.min(current + 1, Math.max(filteredAddOnOptions.length - 1, 0))
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAddOnsOpen(true);
      setActiveAddOnIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      if (!addOnsOpen || filteredAddOnOptions.length === 0) return;
      event.preventDefault();
      toggleAddOn(filteredAddOnOptions[activeAddOnIndex].id);
      return;
    }
    if (event.key === " " && addOnsOpen && addOnSearch.trim() === "") {
      if (filteredAddOnOptions.length === 0) return;
      event.preventDefault();
      toggleAddOn(filteredAddOnOptions[activeAddOnIndex].id);
      return;
    }
    if (event.key === "Escape" && addOnsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setAddOnsOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setAddOnsOpen(false);
    }
  }

  function handlePreviousMeasurementsKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>
  ) {
    if (previousMeasurementOptions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setPreviousMeasurementsOpen(true);
      setActivePreviousMeasurementIndex((current) =>
        Math.min(current + 1, previousMeasurementOptions.length - 1)
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setPreviousMeasurementsOpen(true);
      setActivePreviousMeasurementIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (previousMeasurementsOpen) {
        const option =
          previousMeasurementOptions[
            Math.min(
              activePreviousMeasurementIndex,
              previousMeasurementOptions.length - 1
            )
          ];
        if (option) handlePreviousMeasurementSelect(option);
      } else {
        setPreviousMeasurementsOpen(true);
      }
      return;
    }
    if (event.key === "Tab") {
      setPreviousMeasurementsOpen(false);
      return;
    }
    if (event.key === "Escape" && previousMeasurementsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setPreviousMeasurementsOpen(false);
    }
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
      qty: quantity,
      color: color.trim(),
      addOnIds: selectedAddOnIds,
      printMeasurementsOnJobCard,
      typedFieldDraft,
      measurement: hasMeasurementContent || measurement.updateCustomerMeasurements
        ? measurement
        : null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (previousMeasurementsOpen) {
        setPreviousMeasurementsOpen(false);
        return;
      }
      if (addOnsOpen) {
        setAddOnsOpen(false);
        return;
      }
      onCancel();
      return;
    }
    if ((e.ctrlKey && e.key === "Enter") || (e.altKey && e.key.toLowerCase() === "s")) {
      if (previousMeasurementsOpen || addOnsOpen) return;
      e.preventDefault();
      formRef.current?.requestSubmit();
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
      <div className="fixed inset-0 z-[60] bg-white" />
      <div
        className="fixed inset-0 z-[70] flex items-stretch justify-stretch"
        onKeyDown={handleKeyDown}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="configure-item-title"
          className="flex h-screen w-screen flex-col overflow-hidden bg-white"
        >
          <div className="border-b border-border-soft px-5">
            <div className="flex min-h-14 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 id="configure-item-title" className="truncate text-[18px] font-semibold text-ink">
                  Configure {garment.name}
                </h3>
                <span className="shrink-0 rounded-full border border-border-soft bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
                  Code {garmentCodeLabel(garment)}
                </span>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border-soft px-5 py-3">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <span className="w-20 shrink-0 text-sm font-medium text-ink-muted">
                  Load from:
                </span>
                {loadingHistory ? (
                  <p className="text-sm text-ink-muted sm:w-[340px]">
                    Loading previous measurements...
                  </p>
                ) : history.length === 0 && !defaultHasMeasurements ? (
                  <p className="text-sm text-ink-muted sm:w-[340px]">
                    No previous measurements available
                  </p>
                ) : (
                  <div
                    ref={previousMeasurementsRef}
                    className="relative min-w-0 sm:w-[340px]"
                  >
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={previousMeasurementsOpen}
                      aria-controls={previousMeasurementsListId}
                      onClick={() =>
                        setPreviousMeasurementsOpen((isOpen) => !isOpen)
                      }
                      onKeyDown={handlePreviousMeasurementsKeyDown}
                      title="Selecting a source copies its values into this item only."
                      className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-white px-2.5 text-sm font-medium text-ink shadow-sm outline-none transition-colors hover:bg-surface-muted focus:border-primary focus:ring-2 focus:ring-primary-tint"
                    >
                      <span className="truncate">{selectedPreviousMeasurementLabel}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
                    </button>
                    {previousMeasurementsOpen && (
                      <div
                        id={previousMeasurementsListId}
                        role="listbox"
                        className="absolute left-0 top-full z-[90] mt-1 max-h-56 w-full min-w-[280px] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-soft"
                      >
                        {previousMeasurementOptions.map((option, index) => (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={option.id === selectedPreviousMeasurement}
                            onMouseEnter={() => setActivePreviousMeasurementIndex(index)}
                            onClick={() => handlePreviousMeasurementSelect(option)}
                            className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                              index === activePreviousMeasurementIndex
                                ? "bg-primary-tint text-primary-strong"
                                : "text-ink hover:bg-surface-muted"
                            }`}
                          >
                            <span className="block truncate">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface-muted/40 px-5 py-4">
              <section className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {metadataLoading ? (
                  <p className="rounded-lg bg-white px-3 py-2 text-sm text-ink-muted lg:col-span-2">Loading configured fields...</p>
                ) : nonInstructionFields.length > 0 ? (
                  <div className="min-w-0 lg:col-span-2 xl:col-span-2">
                    <GarmentFormFields fields={nonInstructionFields} values={typedFieldDraft.typedValues} onChange={handleGarmentFieldChange} layout="columns" firstControlRef={firstMeasurementRef} />
                  </div>
                ) : (
                  <p className="rounded-lg bg-white px-3 py-2 text-sm text-ink-muted lg:col-span-2">
                    No configured measurements or style fields for this garment.
                  </p>
                )}

                {!metadataLoading && instructionFields.length > 0 && <section className="min-w-0 rounded-lg border border-border-soft bg-white p-4">
                  <h4 className="mb-3 text-[15px] font-semibold text-ink">Notes & Instructions</h4>
                  <GarmentFormFields fields={instructionFields} values={typedFieldDraft.typedValues} onChange={handleGarmentFieldChange} showSectionHeadings={false} />
                </section>}

                <section className="min-w-0 rounded-lg border border-border-soft bg-white p-4">
                  <h4 className="mb-1 text-[15px] font-semibold text-ink">Add-ons / Extras</h4>
                  <p className="mb-2 text-sm text-ink-muted">
                    Selected extras are added to Final Instructions for the tailor.
                  </p>
                  {addOnOptions.length === 0 ? (
                    <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                      No add-ons configured for this garment.
                    </p>
                  ) : (
                    <div ref={addOnsComboboxRef} className="relative">
                      <input
                        ref={addOnsInputRef}
                        type="text"
                        role="combobox"
                        aria-expanded={addOnsOpen}
                        aria-controls={addOnsListId}
                        aria-autocomplete="list"
                        aria-label="Search or select add-ons"
                        placeholder="Search or select add-ons"
                        value={addOnSearch}
                        onFocus={() => setAddOnsOpen(true)}
                        onChange={(event) => {
                          setAddOnSearch(event.target.value);
                          setAddOnsOpen(true);
                          setActiveAddOnIndex(0);
                        }}
                        onKeyDown={handleAddOnsInputKeyDown}
                        className="h-10 w-full rounded-md border border-border bg-white px-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </div>
                  )}
                  <label className="mt-4 flex flex-col gap-1">
                    <span className="text-[13px] font-medium text-ink-muted">Notes</span>
                    <textarea value={measurement.notes} onChange={(event) => setMeasurement((current) => ({ ...current, notes: event.target.value }))} rows={2} className="h-[60px] resize-none rounded-md border border-border bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint" />
                  </label>
                  <label className="mt-4 flex items-start gap-2 rounded-lg border border-border-soft bg-surface-muted/60 p-3 text-sm text-ink">
                    <input type="checkbox" checked={printMeasurementsOnJobCard} onChange={(event) => setPrintMeasurementsOnJobCard(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                    <span><b className="block font-semibold">Print body measurements on job card</b><span className="text-xs text-ink-muted">Measurements stay saved even when they are not printed.</span></span>
                  </label>
                </section>
              </section>

            </div>

            <div ref={footerRef} className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-soft bg-white px-5 py-3">
              <label className="mr-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
                Color
                <input type="text" value={color} onChange={(event) => setColor(event.target.value)} placeholder="Optional" className="h-10 w-36 rounded-md border border-border bg-white px-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint" />
              </label>
              <label className="mr-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
                Quantity
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  className="h-10 w-24 rounded-md border border-border bg-white px-2.5 text-center text-base font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
              </label>
              <button
                type="submit"
                className="min-w-48 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
              >
                {mode === "add" ? "Save Item Details" : "Update Item Details"}
                <span className="ml-2 rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-semibold text-white/90">
                  Alt+S
                </span>
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="min-w-28 rounded-lg border border-border bg-white px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
      {addOnsOpen &&
        addOnsPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={addOnsDropdownRef}
            id={addOnsListId}
            role="listbox"
            className="fixed z-[120] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-soft"
            style={{
              left: addOnsPosition.left,
              top: addOnsPosition.top,
              width: addOnsPosition.width,
              maxHeight: addOnsPosition.maxHeight,
              transform:
                addOnsPosition.placement === "top"
                  ? "translateY(-100%)"
                  : undefined,
            }}
          >
            {filteredAddOnOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-muted">No add-ons found</p>
            ) : (
              filteredAddOnOptions.map((addOn, index) => {
                const selected = selectedAddOnIds.includes(addOn.id);
                return (
                  <button
                    ref={(node) => {
                      addOnOptionRefs.current[index] = node;
                    }}
                    key={addOn.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveAddOnIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggleAddOn(addOn.id)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition-colors ${
                      index === activeAddOnIndex
                        ? "bg-primary-tint text-primary-strong"
                        : "text-ink hover:bg-surface-muted"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-white text-transparent"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="truncate font-medium">{addOn.name}</span>
                    </span>
                    <span className="shrink-0 text-ink-muted">
                      +{formatCurrency(addOn.defaultPrice)}
                    </span>
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </>
  );
}

export function NewOrderItemsCard({
  customerId,
  items,
  onItemsChange,
  garmentTypes,
  addOns,
  garmentConfigurations = [],
  garmentConfigurationsLoaded = false,
  paymentStrip,
  autoSnapshotDefaultMeasurements = false,
  focusFirstGarmentRequest = 0,
  garmentSection,
  excludeOrderId,
  garmentSelectorTarget,
}: {
  customerId: string | null;
  items: DraftItem[];
  onItemsChange: (items: DraftItem[]) => void;
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  garmentConfigurations?: GarmentTypeConfiguration[];
  garmentConfigurationsLoaded?: boolean;
  paymentStrip?: ReactNode;
  previousOrders?: Order[];
  autoSnapshotDefaultMeasurements?: boolean;
  focusFirstGarmentRequest?: number;
  garmentSection?: GarmentSection | null;
  excludeOrderId?: string;
  garmentSelectorTarget?: HTMLElement | null;
}) {
  const selectorRef = useRef<HTMLInputElement | null>(null);
  const editButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rateInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const activeGarments = useMemo(
    () =>
      sortGarmentsForKeyboard(
        garmentSection ? garmentTypes.filter((garment) => garment.section === garmentSection) : []
      ),
    [garmentSection, garmentTypes]
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
    const currentOrderSource = [...items]
      .reverse()
      .find((item) => item.garmentTypeId === garmentTypeId && (item.typedFieldDraft || item.measurement));
    setModal({ mode: "add", draft: newDraftForGarment(garment, currentOrderSource) });
  }

  function saveModalDraft(nextDraft: DraftItem) {
    if (modal?.mode === "edit" && typeof modal.index === "number") {
      onItemsChange(items.map((item, index) => (index === modal.index ? nextDraft : item)));
      setModal(null);
      window.setTimeout(() => selectorRef.current?.focus(), 0);
      return;
    }
    onItemsChange([...items.filter((item) => item.garmentTypeId), nextDraft]);
    setModal(null);
    window.setTimeout(() => selectorRef.current?.focus(), 0);
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    onItemsChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function deleteRow(index: number) {
    if (!window.confirm("Remove this item?")) return;
    onItemsChange(items.filter((_, itemIndex) => itemIndex !== index));
    window.setTimeout(() => selectorRef.current?.focus(), 0);
  }

  const garmentSelector = (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Shirt className="h-4 w-4 text-primary" aria-hidden="true" />
        Garment Type
      </span>
      <GarmentTypeCombobox
        value=""
        garments={activeGarments}
        disabled={!garmentSection}
        placeholder={garmentSection ? "Select garment type" : "Select order section first"}
        inputRef={(node) => {
          selectorRef.current = node;
        }}
        onChange={openAddModal}
        onSelected={() => undefined}
        inputClassName="h-[50px] rounded-[10px] border-border bg-white px-4 text-base focus:border-primary focus:ring-2 focus:ring-primary-tint"
      />
    </label>
  );
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary">
            <ShoppingBag className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <h3 className="text-[21px] font-bold tracking-tight text-ink">Order Items</h3>
        </div>
        {!garmentSelectorTarget && <div className="w-full max-w-sm">{garmentSelector}</div>}
      </div>

      {garmentSelectorTarget && createPortal(garmentSelector, garmentSelectorTarget)}

      {rows.length === 0 ? (
        <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-muted px-4 py-5 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-tint text-primary">
            <Shirt className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-base font-semibold text-ink">No order items added</p>
          <p className="text-sm text-ink-muted">Choose a garment type above to add the first item.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-[14px] font-bold text-ink-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-2.5">Garment</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">Qty</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">Rate</th>
                <th className="whitespace-nowrap px-4 py-2.5">Add-ons</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">Amount</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, index }) => {
                const garment = findGarmentById(garmentTypes, item.garmentTypeId);
                const selected = selectedAddOns(item, garmentTypes, addOns);
                const amount = computeAmount(item, garmentTypes, addOns);
                return (
                  <tr key={item.draftKey} className="border-t border-border-soft transition-colors hover:bg-surface-muted">
                    <td className="whitespace-nowrap px-5 py-3.5 font-bold text-[16px] text-ink">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
                          <Shirt className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span>{garment ? formatGarmentCodeName(garment) : "Unknown garment"}{item.color.trim() && <small className="mt-0.5 block font-medium text-ink-muted">Color: {item.color.trim()}</small>}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-ink">
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
                        className="h-11 w-24 rounded-[10px] border border-border bg-white px-2.5 text-center text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-ink">
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
                        className="h-11 w-32 rounded-[10px] border border-border bg-white px-3 text-right text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-[15px] text-ink-muted">
                      {selected.length > 0 ? (
                        selected.map((addOn) => addOn.name).join(", ")
                      ) : (
                        <span className="inline-flex rounded-full bg-chip-info px-2.5 py-1 text-xs font-medium text-ink-muted">None</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-[18px] font-bold text-primary">
                      {formatCurrency(amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
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
                          aria-label={`Edit ${garment ? formatGarmentCodeName(garment) : "order item"}`}
                          className="flex h-10 items-center gap-1.5 rounded-[9px] border border-primary bg-white px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-tint focus:outline-none focus:ring-2 focus:ring-primary-tint"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(index)}
                          aria-label={`Delete ${garment ? formatGarmentCodeName(garment) : "order item"}`}
                          className="flex h-10 items-center gap-1.5 rounded-[9px] border border-danger/30 bg-white px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus:outline-none focus:ring-2 focus:ring-danger-soft"
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

      {paymentStrip && (
        <div className="mt-4 border-t border-border pt-4">
          {paymentStrip}
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
            preloadedConfiguration={garmentConfigurations.find(
              (configuration) => configuration.garment.id === garment.id
            )}
            configurationsPreloaded={garmentConfigurationsLoaded}
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

// Item Amount = Qty × (Rate + selected add-ons total) - Rate here is the
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
      workerStageRates: a.workerStageRates,
    }));
    const addOnsTotal = itemAddOns.reduce((sum, a) => sum + a.amount, 0);
    const finalRate = it.rate + addOnsTotal;
    // Only snapshot measurements onto the item when the shopkeeper actually
    // opened/filled the modal for this row (it.measurement !== null) - not
    // silently pulling in auto-seeded baseline values they never confirmed.
    // A New Order must submit only the visible/runtime-configured keys. Older
    // customer defaults can include retired fields (for example `hip` after
    // Pant was reconfigured to Height + Waist); keeping those hidden keys in
    // a new payload would correctly fail the server's metadata validation.
    // Edit Order has its own path that preserves historical passthrough keys.
    const serializedMeasurementValues = it.typedFieldDraft
      ? it.typedFieldDraft.typedValues
      : it.measurement
        ? measurementValuesOnly(it.measurement.values)
        : {};
    const measurementNotes = it.measurement?.notes.trim() ?? "";
    const hasMeasurements =
      Object.values(serializedMeasurementValues).some((value) => {
        if (value === null || value === undefined) return false;
        if (typeof value === "string") return value.trim() !== "";
        if (Array.isArray(value)) return value.length > 0;
        return true;
      }) || Boolean(measurementNotes);
    return {
      id: it.orderItemId,
      serialNo: i + 1,
      particular: garment?.name ?? "",
      // Catalog garment type id, so order_items can reference
      // catalog_garment_types "where possible" (Phase 6C) - Edit Order's
      // own items never set this, since that flow has no Catalog dropdown.
      garmentTypeId: it.garmentTypeId || undefined,
      size: it.color.trim() || undefined,
      qty: it.qty,
      rate: it.rate,
      addOns: itemAddOns.length > 0 ? itemAddOns : undefined,
      addOnsTotal: addOnsTotal > 0 ? addOnsTotal : undefined,
      finalRate,
      amount: finalRate * it.qty,
      fieldSchemaSnapshot: {
        version: 1,
        fields: [],
        printMeasurementsOnJobCard: it.printMeasurementsOnJobCard,
      },
      measurements: hasMeasurements
        ? {
            ...serializedMeasurementValues,
            ...(measurementNotes
              ? { [MEASUREMENT_NOTES_KEY]: measurementNotes }
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
  inputClassName,
  disabled = false,
  placeholder,
}: {
  value: string;
  garments: CatalogGarmentType[];
  required?: boolean;
  inputRef?: (node: HTMLInputElement | null) => void;
  onChange: (garmentTypeId: string) => void;
  onSelected: () => void;
  inputClassName?: string;
  disabled?: boolean;
  placeholder?: string;
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
    if (disabled) return;
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
        disabled={disabled}
        value={inputValue}
        onFocus={() => {
          if (disabled) return;
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
        placeholder={placeholder ?? t("common.selectEllipsis")}
        className={`${inputClass} ${inputClassName ?? ""} ${disabled ? "cursor-not-allowed bg-surface-muted text-ink-muted" : ""}`}
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
                    : "text-ink hover:bg-surface-muted"
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
