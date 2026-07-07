// Catalog module: shopkeeper-configurable garment types (base price, required
// measurement fields, add-ons/extras, active status). This is the setup/rules
// layer — it never stores a customer's actual body measurement values (that
// lives on Customer/GarmentMeasurement/CustomerMeasurements in lib/types.ts).
//
// Distinct from lib/garment-catalog.ts, which is the static config New Order
// currently reads pricing/measurement templates from. The two are kept
// separate for now (New Order integration is a later chunk) — types here use
// a "Catalog" prefix so they never collide with that file's own GarmentType
// (a string union of garment names, not an object).
//
// In-memory stand-in for the database, same convention as
// lib/data/stub-data.ts: mutations push/patch directly into the exported
// array, state resets on dev-server restart. Swap the internals for real
// queries when a backend exists — keep these function signatures.

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
  basePrice: number;
  measurementFieldIds: string[];
  addOnIds: string[];
  isActive: boolean;
}

// Global measurement field library the shopkeeper picks from when configuring
// a garment type's required fields.
export const measurementFields: CatalogMeasurementField[] = [
  { id: "chest", label: "Chest" },
  { id: "bust", label: "Bust" },
  { id: "waist", label: "Waist" },
  { id: "hip", label: "Hip" },
  { id: "shoulder", label: "Shoulder" },
  { id: "sleeveLength", label: "Sleeve Length" },
  { id: "armhole", label: "Armhole" },
  { id: "neck", label: "Neck" },
  { id: "shirtLength", label: "Shirt Length" },
  { id: "blouseLength", label: "Blouse Length" },
  { id: "kurtaLength", label: "Kurta Length" },
  { id: "pantLength", label: "Pant Length" },
  { id: "inseam", label: "Inseam" },
  { id: "thigh", label: "Thigh" },
  { id: "knee", label: "Knee" },
  { id: "bottom", label: "Bottom" },
  { id: "rise", label: "Rise" },
  { id: "cuff", label: "Cuff" },
  { id: "neckDepthFront", label: "Neck Depth Front" },
  { id: "neckDepthBack", label: "Neck Depth Back" },
  { id: "fitNotes", label: "Fit Notes" },
  { id: "notes", label: "Notes" },
];

function fieldIds(...ids: string[]): string[] {
  return ids;
}

// Groups the flat measurementFields library into labeled sections, reused by
// both the Garment Type drawer's "Required Measurements" checklist and the
// Customers module's measurement profile (display + edit) — same grouping,
// one definition.
export const MEASUREMENT_FIELD_GROUPS: { title: string; fieldIds: string[] }[] = [
  {
    title: "Upper Body",
    fieldIds: ["chest", "bust", "shoulder", "sleeveLength", "armhole", "neck", "cuff"],
  },
  {
    title: "Lower Body",
    fieldIds: ["waist", "hip", "pantLength", "inseam", "thigh", "knee", "bottom", "rise"],
  },
  {
    title: "Garment Length / Style",
    fieldIds: [
      "shirtLength",
      "blouseLength",
      "kurtaLength",
      "neckDepthFront",
      "neckDepthBack",
    ],
  },
  {
    title: "Notes",
    fieldIds: ["fitNotes", "notes"],
  },
];

export function measurementFieldLabel(id: string): string {
  return measurementFields.find((f) => f.id === id)?.label ?? id;
}

// Add-ons/Extras master, seeded per the confirmed spec. Garment types below
// link to these by id instead of redefining name/price per garment.
export const defaultAddOns: CatalogAddOn[] = [
  { id: "addon-1", name: "Inner Pocket", defaultPrice: 20, isActive: true },
  { id: "addon-2", name: "Extra Pocket", defaultPrice: 40, isActive: true },
  { id: "addon-3", name: "Elastic Waist", defaultPrice: 50, isActive: true },
  { id: "addon-4", name: "Lining", defaultPrice: 80, isActive: true },
  { id: "addon-5", name: "Premium Buttons", defaultPrice: 100, isActive: true },
  { id: "addon-6", name: "Boat Neck", defaultPrice: 100, isActive: true },
  { id: "addon-7", name: "Deep Neck", defaultPrice: 150, isActive: true },
  { id: "addon-8", name: "Padded", defaultPrice: 200, isActive: true },
  { id: "addon-9", name: "Urgent Delivery", defaultPrice: 250, isActive: true },
];

function addOnIdsByName(...names: string[]): string[] {
  return names.map((name) => {
    const found = defaultAddOns.find((a) => a.name === name);
    if (!found) throw new Error(`Unknown add-on: ${name}`);
    return found.id;
  });
}

// Seed data per the confirmed spec. Pant/Blouse/Shirt use the exact base
// price and fields given; Kurta/Suit/Alteration have no spec beyond "seed
// these garment types", so their base price/fields are assumptions (mirroring
// lib/garment-catalog.ts's existing field guesses where possible) left with
// no add-ons for the shopkeeper to link via the UI. Shirt's original "Inside
// Pocket" and Pant's "Inner Pocket" are the same add-on under the new master
// — consolidated to "Inner Pocket" rather than kept as separate entries.
export const defaultGarmentTypes: CatalogGarmentType[] = [
  {
    id: "garment-1",
    name: "Pant",
    basePrice: 400,
    measurementFieldIds: fieldIds(
      "waist",
      "hip",
      "pantLength",
      "inseam",
      "thigh",
      "bottom"
    ),
    addOnIds: addOnIdsByName("Inner Pocket", "Extra Pocket", "Elastic Waist"),
    isActive: true,
  },
  {
    id: "garment-2",
    name: "Shirt",
    basePrice: 800,
    measurementFieldIds: fieldIds(
      "chest",
      "shoulder",
      "sleeveLength",
      "shirtLength",
      "neck",
      "waist",
      "armhole",
      "cuff"
    ),
    addOnIds: addOnIdsByName("Inner Pocket", "Extra Pocket", "Premium Buttons"),
    isActive: true,
  },
  {
    id: "garment-3",
    name: "Blouse",
    basePrice: 750,
    measurementFieldIds: fieldIds(
      "bust",
      "waist",
      "shoulder",
      "sleeveLength",
      "blouseLength",
      "armhole",
      "neckDepthFront",
      "neckDepthBack"
    ),
    addOnIds: addOnIdsByName("Boat Neck", "Deep Neck", "Padded", "Lining"),
    isActive: true,
  },
  {
    id: "garment-4",
    name: "Kurta",
    // Assumed base price/fields — not given in the spec beyond seeding this
    // garment type. Revisit once the shopkeeper confirms real numbers.
    basePrice: 700,
    measurementFieldIds: fieldIds(
      "chest",
      "shoulder",
      "sleeveLength",
      "kurtaLength",
      "waist",
      "neck"
    ),
    addOnIds: [],
    isActive: true,
  },
  {
    id: "garment-5",
    name: "Suit",
    // Assumed — suits vary widely by fabric/style, same "manual for now" note
    // as lib/garment-catalog.ts's existing Suit template.
    basePrice: 2500,
    measurementFieldIds: fieldIds(
      "chest",
      "waist",
      "hip",
      "shoulder",
      "sleeveLength"
    ),
    addOnIds: [],
    isActive: true,
  },
  {
    id: "garment-6",
    name: "Alteration",
    // No fixed measurement fields, per spec (alterations adjust an existing
    // garment rather than measuring a body) — Fit Notes/Notes remain
    // available in the field library if the shopkeeper wants them.
    basePrice: 0,
    measurementFieldIds: [],
    addOnIds: [],
    isActive: true,
  },
];

export function getAllGarmentTypes(): CatalogGarmentType[] {
  return defaultGarmentTypes;
}

export function getActiveGarmentTypes(): CatalogGarmentType[] {
  return defaultGarmentTypes.filter((g) => g.isActive);
}

export function getGarmentById(id: string): CatalogGarmentType | undefined {
  return defaultGarmentTypes.find((g) => g.id === id);
}

// Item Amount = Qty × (Base Rate + selected add-ons total), per the Catalog
// spec's calculation rule. Callers resolve addOnIds to CatalogAddOn objects
// (e.g. via getAddOnById) before calling this.
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
  basePrice: number;
  measurementFieldIds: string[];
  addOnIds: string[];
  isActive: boolean;
};

export function createGarmentType(data: GarmentTypeInput): CatalogGarmentType {
  const garment: CatalogGarmentType = {
    id: `garment-${defaultGarmentTypes.length + 1}`,
    ...data,
  };
  defaultGarmentTypes.push(garment);
  return garment;
}

export function updateGarmentType(
  id: string,
  data: GarmentTypeInput
): CatalogGarmentType | undefined {
  const idx = defaultGarmentTypes.findIndex((g) => g.id === id);
  if (idx < 0) return undefined;
  defaultGarmentTypes[idx] = { ...defaultGarmentTypes[idx], ...data };
  return defaultGarmentTypes[idx];
}

export function setGarmentTypeActive(
  id: string,
  isActive: boolean
): CatalogGarmentType | undefined {
  const garment = getGarmentById(id);
  if (!garment) return undefined;
  garment.isActive = isActive;
  return garment;
}

// Add-ons/Extras master selectors and mutations.

export function getAllAddOns(): CatalogAddOn[] {
  return defaultAddOns;
}

export function getActiveAddOns(): CatalogAddOn[] {
  return defaultAddOns.filter((a) => a.isActive);
}

export function getAddOnById(id: string): CatalogAddOn | undefined {
  return defaultAddOns.find((a) => a.id === id);
}

// Resolves a garment type's addOnIds to full CatalogAddOn records, dropping
// any id that no longer resolves (e.g. a data inconsistency) rather than
// throwing — used wherever a garment's add-ons need to be displayed/totaled.
export function getAddOnsForGarment(garment: CatalogGarmentType): CatalogAddOn[] {
  return garment.addOnIds
    .map((id) => getAddOnById(id))
    .filter((a): a is CatalogAddOn => a !== undefined);
}

export type AddOnInput = {
  name: string;
  defaultPrice: number;
  isActive: boolean;
};

export function createAddOn(data: AddOnInput): CatalogAddOn {
  const addOn: CatalogAddOn = {
    id: `addon-${defaultAddOns.length + 1}`,
    ...data,
  };
  defaultAddOns.push(addOn);
  return addOn;
}

export function updateAddOn(
  id: string,
  data: AddOnInput
): CatalogAddOn | undefined {
  const idx = defaultAddOns.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  defaultAddOns[idx] = { ...defaultAddOns[idx], ...data };
  return defaultAddOns[idx];
}

export function setAddOnActive(
  id: string,
  isActive: boolean
): CatalogAddOn | undefined {
  const addOn = getAddOnById(id);
  if (!addOn) return undefined;
  addOn.isActive = isActive;
  return addOn;
}
