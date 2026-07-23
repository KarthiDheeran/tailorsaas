// Catalog module: shopkeeper-configurable garment types (base price, required
// measurement fields, add-ons/extras, active status). This is the setup/rules
// layer — it never stores a customer's actual body measurement values (that
// lives on Customer/GarmentMeasurement/CustomerMeasurements in lib/types.ts).
//
// Phase 6B: the mock arrays/accessor/mutation functions that used to live
// here (defaultGarmentTypes/defaultAddOns and their CRUD) moved to
// lib/data/catalog-db.ts, real Supabase-backed queries against
// catalog_garment_types/catalog_addons (supabase/migrations/
// 0005_catalog.sql). This file now only keeps what has zero I/O: the
// domain types, the fixed measurement-field vocabulary (not shopkeeper-
// editable data — stays a TS constant, not a table), and pure computation
// helpers.
//
// Distinct from lib/garment-catalog.ts, which is a separate static config
// some Edit Order code still reads pricing/measurement templates from. The
// two are kept separate — types here use a "Catalog" prefix so they never
// collide with that file's own GarmentType (a string union of garment
// names, not an object).

export interface CatalogMeasurementField {
  id: string;
  label: string;
}

// Reusable Add-ons/Extras master — garment types reference these by id
// (addOnIds) rather than each defining their own name/price, so an add-on
// like "Inner Pocket" is defined once and can be linked to Pant, Shirt, Coat,
// etc. without duplicating it per garment.
export interface CatalogAddOn {
  id: string;
  name: string;
  defaultPrice: number;
  isActive: boolean;
}

export interface CatalogGarmentType {
  id: string;
  name: string;
  shortcutCode: number | null;
  basePrice: number;
  measurementFieldIds: string[];
  addOnIds: string[];
  isActive: boolean;
}

export const INITIAL_GARMENT_SHORTCUT_CODES: Record<string, number> = {
  alteration: 1,
  blouse: 2,
  dress: 3,
  gown: 4,
  kurta: 5,
  lehenga: 6,
  pant: 7,
  "salwar suit": 8,
  "saree fall/pico": 9,
  shirt: 10,
  suit: 11,
  waistcoat: 12,
};

export function initialShortcutCodeForGarmentName(name: string): number | null {
  return INITIAL_GARMENT_SHORTCUT_CODES[name.trim().toLowerCase()] ?? null;
}

// Global measurement field library the shopkeeper picks from when configuring
// a garment type's required fields. Fixed vocabulary, not shopkeeper-editable
// data — stays a TS constant, not a table (see Phase 6B plan).
export const measurementFields: CatalogMeasurementField[] = [
  { id: "chest", label: "Chest" },
  { id: "bust", label: "Bust" },
  { id: "waist", label: "Waist" },
  { id: "hip", label: "Hip" },
  { id: "shoulder", label: "Shoulder" },
  { id: "crossFront", label: "Cross Front" },
  { id: "crossBack", label: "Cross Back" },
  { id: "sleeveLength", label: "Sleeve Length" },
  { id: "sleeveRound", label: "Sleeve Round" },
  { id: "armhole", label: "Armhole" },
  { id: "neck", label: "Neck" },
  { id: "collar", label: "Collar" },
  { id: "shirtLength", label: "Shirt Length" },
  { id: "blouseLength", label: "Blouse Length" },
  { id: "kurtaLength", label: "Kurta Length" },
  { id: "kameezLength", label: "Kameez Length" },
  { id: "salwarLength", label: "Salwar Length" },
  { id: "dressLength", label: "Dress Length" },
  { id: "lehengaLength", label: "Lehenga Length" },
  { id: "gownLength", label: "Gown Length" },
  { id: "coatLength", label: "Coat Length" },
  { id: "waistcoatLength", label: "Waistcoat Length" },
  { id: "sherwaniLength", label: "Sherwani Length" },
  { id: "petticoatLength", label: "Petticoat Length" },
  { id: "sareeFallLength", label: "Saree Fall Length" },
  { id: "pantLength", label: "Pant Length" },
  { id: "inseam", label: "Inseam" },
  { id: "thigh", label: "Thigh" },
  { id: "knee", label: "Knee" },
  { id: "bottom", label: "Bottom" },
  { id: "rise", label: "Rise" },
  { id: "cuff", label: "Cuff" },
  { id: "neckDepthFront", label: "Neck Depth Front" },
  { id: "neckDepthBack", label: "Neck Depth Back" },
  { id: "neckWidth", label: "Neck Width" },
  { id: "dartPoint", label: "Dart Point" },
  { id: "princessCut", label: "Princess Cut" },
  { id: "yokeLength", label: "Yoke Length" },
  { id: "slitLength", label: "Slit Length" },
  { id: "flare", label: "Flare" },
  { id: "seat", label: "Seat" },
  { id: "calf", label: "Calf" },
  { id: "fitNotes", label: "Fit Notes" },
  { id: "notes", label: "Notes" },
];

// Groups the flat measurementFields library into labeled sections, reused by
// both the Garment Type drawer's "Required Measurements" checklist and the
// Customers module's measurement profile (display + edit) — same grouping,
// one definition.
export const MEASUREMENT_FIELD_GROUPS: { title: string; fieldIds: string[] }[] = [
  {
    title: "Upper Body",
    fieldIds: [
      "chest",
      "bust",
      "shoulder",
      "crossFront",
      "crossBack",
      "sleeveLength",
      "sleeveRound",
      "armhole",
      "neck",
      "collar",
      "cuff",
    ],
  },
  {
    title: "Lower Body",
    fieldIds: [
      "waist",
      "hip",
      "seat",
      "pantLength",
      "inseam",
      "thigh",
      "knee",
      "calf",
      "bottom",
      "rise",
    ],
  },
  {
    title: "Garment Length / Style",
    fieldIds: [
      "shirtLength",
      "blouseLength",
      "kurtaLength",
      "kameezLength",
      "salwarLength",
      "dressLength",
      "lehengaLength",
      "gownLength",
      "coatLength",
      "waistcoatLength",
      "sherwaniLength",
      "petticoatLength",
      "sareeFallLength",
      "neckDepthFront",
      "neckDepthBack",
      "neckWidth",
      "dartPoint",
      "princessCut",
      "yokeLength",
      "slitLength",
      "flare",
    ],
  },
  {
    title: "Notes",
    fieldIds: ["fitNotes", "notes"],
  },
];

const CUSTOM_FIELD_PREFIX = "custom:";

export function customMeasurementFieldId(label: string): string {
  return `${CUSTOM_FIELD_PREFIX}${label.trim().replace(/\s+/g, " ")}`;
}

export function isCustomMeasurementFieldId(id: string): boolean {
  return id.startsWith(CUSTOM_FIELD_PREFIX);
}

export function customMeasurementFieldLabel(id: string): string {
  return id.slice(CUSTOM_FIELD_PREFIX.length).trim();
}

export function measurementFieldLabel(id: string): string {
  if (isCustomMeasurementFieldId(id)) {
    return customMeasurementFieldLabel(id) || "Custom Field";
  }
  return measurementFields.find((f) => f.id === id)?.label ?? id;
}

// Resolves a garment type's addOnIds to full CatalogAddOn records, given an
// already-fetched add-ons array (Phase 6B: this used to call getAddOnById()
// over an in-memory mock array internally; now it's a pure function so
// callers that already have both records in hand — e.g. New Order, which
// fetches active garment types + all add-ons once at the page level — never
// need a per-lookup Supabase round trip). Drops any id that doesn't resolve
// (e.g. a data inconsistency) rather than throwing.
export function getAddOnsForGarment(
  garment: CatalogGarmentType,
  addOns: CatalogAddOn[]
): CatalogAddOn[] {
  const byId = new Map(addOns.map((a) => [a.id, a]));
  return garment.addOnIds
    .map((id) => byId.get(id))
    .filter((a): a is CatalogAddOn => a !== undefined);
}

// Item Amount = Qty × (Base Rate + selected add-ons total), per the Catalog
// spec's calculation rule. Callers resolve addOnIds to CatalogAddOn objects
// (e.g. via getAddOnsForGarment) before calling this.
export function calculateGarmentAmount(
  basePrice: number,
  addOns: CatalogAddOn[],
  qty: number
): number {
  const addOnsTotal = addOns.reduce((sum, a) => sum + a.defaultPrice, 0);
  return (basePrice + addOnsTotal) * qty;
}

export type GarmentTypeInput = {
  name: string;
  shortcutCode: number | null;
  basePrice: number;
  measurementFieldIds: string[];
  addOnIds: string[];
  isActive: boolean;
};

export type AddOnInput = {
  name: string;
  defaultPrice: number;
  isActive: boolean;
};
