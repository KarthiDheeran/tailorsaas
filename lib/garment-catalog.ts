// Garment templates, pricing, and add-ons for the New Order flow. This is a
// static config/helper module (no admin UI yet) — see CLAUDE.md's New Order
// flow notes for scope. Garment type + size combos with no pricing rule
// simply have no auto-filled rate; the shopkeeper types one in manually.

import { MEASUREMENT_FIELD_GROUPS } from "./catalog";

export type GarmentType =
  | "Shirt"
  | "Pant"
  | "Blouse"
  | "Suit"
  | "Kurta"
  | "Sherwani"
  | "Petticoat"
  | "Alteration"
  | "Custom";

export const GARMENT_TYPES: GarmentType[] = [
  "Shirt",
  "Pant",
  "Blouse",
  "Suit",
  "Kurta",
  "Sherwani",
  "Petticoat",
  "Alteration",
  "Custom",
];

export type SizeOption = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "Custom";

export const SIZE_OPTIONS: SizeOption[] = ["XS", "S", "M", "L", "XL", "XXL", "Custom"];

export interface MeasurementFieldDef {
  key: string;
  label: string;
}

export interface AddOnDef {
  key: string;
  label: string;
  amount: number;
}

interface GarmentTemplate {
  type: GarmentType;
  measurementFields: MeasurementFieldDef[];
  pricing: Partial<Record<SizeOption, number>>;
  addOns: AddOnDef[];
}

// Single source of truth for measurement field labels, shared across garment
// templates and the customer-level baseline (lib/data/stub-data.ts's
// CustomerMeasurements) so the same key always renders the same label.
const FIELD_LABELS: Record<string, string> = {
  chest: "Chest",
  shoulder: "Shoulder",
  sleeveLength: "Sleeve Length",
  shirtLength: "Shirt Length",
  neck: "Neck",
  waist: "Waist",
  armhole: "Armhole",
  cuff: "Cuff",
  hip: "Hip",
  pantLength: "Pant Length",
  inseam: "Inseam",
  thigh: "Thigh",
  knee: "Knee",
  bottom: "Bottom",
  rise: "Rise",
  bust: "Bust",
  blouseLength: "Blouse Length",
  neckDepthFront: "Neck Depth (Front)",
  neckDepthBack: "Neck Depth (Back)",
  coatLength: "Coat Length",
  pantWaist: "Pant Waist",
  kurtaLength: "Kurta Length",
  sherwaniLength: "Sherwani Length",
  petticoatLength: "Petticoat Length",
};

function fieldsOf(...keys: string[]): MeasurementFieldDef[] {
  return keys.map((key) => ({ key, label: FIELD_LABELS[key] ?? key }));
}

// Canonical customer-level body measurement keys (see CustomerMeasurements in
// lib/types.ts) — every field id in lib/catalog.ts's MEASUREMENT_FIELD_GROUPS
// except the Notes group (fitNotes/notes are carried on the garment
// measurement draft separately, not folded into this values map). Matches
// the exact grouping the Customers module's measurement profile renders, so
// any garment-specific field shown there (e.g. Blouse's Neck Depth) is also
// one this can merge back from.
export const CUSTOMER_MEASUREMENT_FIELDS: MeasurementFieldDef[] = fieldsOf(
  ...MEASUREMENT_FIELD_GROUPS.filter((g) => g.title !== "Notes").flatMap(
    (g) => g.fieldIds
  )
);
const CANONICAL_KEYS = new Set(CUSTOMER_MEASUREMENT_FIELDS.map((f) => f.key));

// Filters a garment-specific measurement draft down to the keys that belong
// on the customer's general body-measurement baseline, dropping blank
// entries so an untouched/cleared field in this order's measurement popup
// never overwrites a value already saved on the customer's profile.
export function pickBodyMeasurements(
  values: Record<string, string>
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (CANONICAL_KEYS.has(key) && value.trim() !== "") picked[key] = value;
  }
  return picked;
}

// Fallback field set for garment type strings that don't match a known
// template (e.g. legacy/free-text "particular" values from Edit Order).
const GENERIC_MEASUREMENT_FIELDS: MeasurementFieldDef[] = fieldsOf(
  "chest",
  "waist",
  "hip",
  "shoulder",
  "sleeveLength",
  "neck",
  "armhole",
  "inseam",
  "thigh",
  "bottom"
);

const garmentTemplates: GarmentTemplate[] = [
  {
    type: "Shirt",
    measurementFields: fieldsOf(
      "chest",
      "shoulder",
      "sleeveLength",
      "shirtLength",
      "neck",
      "waist",
      "armhole",
      "cuff"
    ),
    pricing: { S: 800, M: 850, L: 950, XL: 1050, XXL: 1200 },
    addOns: [
      { key: "insidePocket", label: "Inside Pocket", amount: 80 },
      { key: "extraPocket", label: "Extra Pocket", amount: 100 },
      { key: "premiumButtons", label: "Premium Buttons", amount: 120 },
      { key: "fullSleeve", label: "Full Sleeve", amount: 100 },
      { key: "urgentDelivery", label: "Urgent Delivery", amount: 250 },
    ],
  },
  {
    type: "Pant",
    measurementFields: fieldsOf(
      "waist",
      "hip",
      "pantLength",
      "inseam",
      "thigh",
      "knee",
      "bottom",
      "rise"
    ),
    pricing: { S: 900, M: 950, L: 1050, XL: 1150, XXL: 1300 },
    addOns: [
      { key: "extraPocket", label: "Extra Pocket", amount: 100 },
      { key: "lining", label: "Lining", amount: 150 },
      { key: "elasticWaist", label: "Elastic Waist", amount: 120 },
      { key: "urgentDelivery", label: "Urgent Delivery", amount: 250 },
    ],
  },
  {
    type: "Blouse",
    measurementFields: fieldsOf(
      "bust",
      "waist",
      "shoulder",
      "sleeveLength",
      "blouseLength",
      "neckDepthFront",
      "neckDepthBack",
      "armhole"
    ),
    pricing: { S: 700, M: 750, L: 850, XL: 950, XXL: 1100 },
    addOns: [
      { key: "boatNeck", label: "Boat Neck", amount: 100 },
      { key: "deepNeck", label: "Deep Neck", amount: 150 },
      { key: "padded", label: "Padded", amount: 200 },
      { key: "lining", label: "Lining", amount: 150 },
      { key: "designerSleeve", label: "Designer Sleeve", amount: 250 },
      { key: "urgentDelivery", label: "Urgent Delivery", amount: 300 },
    ],
  },
  {
    type: "Suit",
    measurementFields: fieldsOf(
      "chest",
      "waist",
      "hip",
      "shoulder",
      "sleeveLength",
      "coatLength",
      "pantWaist",
      "pantLength"
    ),
    // No standard pricing table yet — suits vary too much by fabric/style;
    // rate is manual for now. Revisit once catalog admin exists.
    pricing: {},
    addOns: [],
  },
  {
    type: "Kurta",
    measurementFields: fieldsOf(
      "chest",
      "shoulder",
      "sleeveLength",
      "kurtaLength",
      "waist",
      "hip",
      "neck",
      "armhole"
    ),
    pricing: {},
    addOns: [],
  },
  {
    type: "Sherwani",
    // No explicit field list was given for Sherwani; assumed similar to a
    // long coat/Kurta hybrid. Revisit if the shopkeeper wants different
    // fields.
    measurementFields: fieldsOf(
      "chest",
      "shoulder",
      "sleeveLength",
      "sherwaniLength",
      "waist",
      "hip",
      "neck",
      "armhole"
    ),
    pricing: {},
    addOns: [],
  },
  {
    type: "Petticoat",
    // Assumed minimal field set — petticoats are simple compared to other
    // garments here. Revisit if the shopkeeper wants more detail.
    measurementFields: fieldsOf("waist", "hip", "petticoatLength"),
    pricing: {},
    addOns: [],
  },
  {
    type: "Alteration",
    // Alterations adjust an existing garment rather than measuring a body —
    // no fixed measurement fields, Fit Notes/Notes cover it for now.
    measurementFields: [],
    pricing: {},
    addOns: [],
  },
  {
    type: "Custom",
    // Per spec: flexible key-value fields would be ideal, but Notes-only is
    // the simple version for now.
    measurementFields: [],
    pricing: {},
    addOns: [],
  },
];

function normalize(type: string): string {
  return type.trim().toLowerCase();
}

function findTemplate(type: string): GarmentTemplate | undefined {
  const key = normalize(type);
  return garmentTemplates.find((t) => normalize(t.type) === key);
}

export function getMeasurementFields(type: string): MeasurementFieldDef[] {
  if (!type.trim()) return [];
  return findTemplate(type)?.measurementFields ?? GENERIC_MEASUREMENT_FIELDS;
}

export function getDefaultRate(type: string, size: string): number | undefined {
  if (!size) return undefined;
  return findTemplate(type)?.pricing[size as SizeOption];
}

export function getAvailableAddOns(type: string): AddOnDef[] {
  return findTemplate(type)?.addOns ?? [];
}

export function computeAddOnsAmount(type: string, addOnKeys: string[]): number {
  const addOns = getAvailableAddOns(type);
  return addOnKeys.reduce((sum, key) => {
    const found = addOns.find((a) => a.key === key);
    return sum + (found?.amount ?? 0);
  }, 0);
}
