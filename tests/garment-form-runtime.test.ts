import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { CatalogGarmentTypeField, CatalogSection } from "../lib/catalog.js";
import {
  buildFieldSchemaSnapshot,
  createGarmentFieldDraft,
  historicalGarmentValueText,
  mergeQuickAddons,
  resolveHistoricalGarmentDisplayFields,
  resolveRuntimeGarmentFields,
  serializeGarmentFieldDraft,
  shouldPrintMeasurementsOnJobCard,
  validateGarmentFieldValues,
  type RuntimeGarmentField,
} from "../lib/garment-form-runtime.js";

function field(overrides: Partial<RuntimeGarmentField> = {}): RuntimeGarmentField {
  return {
    code: "height",
    name: "Height",
    fieldType: "measurement",
    inputType: "number",
    sectionId: "body",
    sectionName: "Body Measurements",
    sectionOrder: 1,
    displayOrder: 1,
    required: false,
    unit: "inch",
    placeholder: "",
    options: [],
    min: null,
    max: null,
    decimalPlaces: 2,
    defaultValue: null,
    ...overrides,
  };
}

const body: CatalogSection = {
  id: "body",
  name: "Body Measurements",
  displayOrder: 1,
  icon: null,
  isActive: true,
};

function assignment(
  code: string,
  name: string,
  displayOrder: number,
  overrides: Partial<CatalogGarmentTypeField["field"]> = {}
): CatalogGarmentTypeField {
  return {
    id: `map-${code}`,
    garmentTypeId: "garment-1",
    fieldId: `field-${code}`,
    sectionId: body.id,
    displayOrder,
    isRequired: false,
    defaultValue: null,
    section: body,
    field: {
      id: `field-${code}`,
      code,
      name,
      fieldType: "measurement",
      defaultSectionId: body.id,
      inputType: "number",
      unit: "inch",
      placeholder: null,
      options: [],
      uiMetadata: {},
      minValue: null,
      maxValue: null,
      decimalPlaces: 2,
      isRequiredDefault: false,
      displayOrder,
      isActive: true,
      isSystem: true,
      ...overrides,
    },
  };
}

test("metadata mappings win, exclude inactive fields, and retain section/field ordering", () => {
  const styleSection: CatalogSection = { ...body, id: "style", name: "Style", displayOrder: 2 };
  const mappings = [
    assignment("waist", "Waist", 2),
    { ...assignment("side_pocket", "Side Pocket", 1, { inputType: "select", options: ["Cross Pocket"] }), sectionId: styleSection.id, section: styleSection },
    assignment("height", "Height", 1),
    assignment("retired", "Retired", 3, { isActive: false }),
  ];

  const resolved = resolveRuntimeGarmentFields(mappings, [styleSection, body]);
  assert.deepEqual(resolved?.map((item) => item.code), ["height", "waist", "side_pocket"]);
  assert.equal(resolveRuntimeGarmentFields(null, [body]), null);
});

test("typed drafts round-trip native values and preserve unknown legacy keys without mutating source", () => {
  const values = {
    height: "38.5",
    enabled: false,
    choices: ["Slim", "Double stitch"],
    emptyChoices: [],
    emptyText: "",
    nullable: null,
    legacy_key: { retained: true },
  };
  const draft = createGarmentFieldDraft(values, [
    field(),
    field({ code: "enabled", inputType: "checkbox" }),
    field({ code: "choices", inputType: "multiselect" }),
    field({ code: "emptyChoices", inputType: "multiselect" }),
    field({ code: "emptyText", inputType: "text" }),
    field({ code: "nullable", inputType: "text" }),
  ]);

  assert.equal(draft.typedValues.height, 38.5);
  assert.equal(draft.typedValues.enabled, false);
  assert.deepEqual(draft.typedValues.choices, ["Slim", "Double stitch"]);
  assert.deepEqual(draft.typedValues.emptyChoices, []);
  assert.equal(draft.typedValues.emptyText, null);
  assert.equal(draft.typedValues.nullable, null);
  assert.deepEqual(draft.passthroughValues, { legacy_key: { retained: true } });
  assert.equal("legacy_key" in draft.typedValues, false);
  assert.deepEqual(serializeGarmentFieldDraft(draft), {
    height: 38.5,
    enabled: false,
    choices: ["Slim", "Double stitch"],
    emptyChoices: [],
    emptyText: null,
    nullable: null,
    legacy_key: { retained: true },
  });
  assert.deepEqual(values, {
    height: "38.5", enabled: false, choices: ["Slim", "Double stitch"], emptyChoices: [], emptyText: "", nullable: null, legacy_key: { retained: true },
  });
});

test("quick add-ons add unique instruction lines without removing manual text", () => {
  const merged = mergeQuickAddons({
    quick_addon: ["Slim Fit", "Double Stitch", " slim   fit "],
    final_instructions: "Customer requested loose sleeve\nSlim Fit",
  });
  assert.equal(merged.final_instructions, "Customer requested loose sleeve\nSlim Fit\nDouble Stitch");
});

test("server validation handles falsy values, type coercion, options, precision, bounds, legacy keys, and field errors", () => {
  const fields = [
    field({ code: "height", required: true, min: 20, max: 50, decimalPlaces: 1 }),
    field({ code: "approved", name: "Approved", inputType: "checkbox", required: true, unit: null }),
    field({ code: "styles", name: "Styles", inputType: "multiselect", required: true, options: ["Slim", "Classic"], unit: null }),
    field({ code: "fit", name: "Fit", inputType: "select", options: ["Slim", "Classic"], unit: null }),
  ];
  const valid = validateGarmentFieldValues(fields, {
    height: "20.0", approved: false, styles: ["Slim"], fit: "Classic", legacy_size: "old",
  }, new Set(["legacy_size"]));
  assert.equal(valid.error, undefined);
  assert.equal(valid.values.height, 20);
  assert.equal(valid.values.approved, false);
  assert.deepEqual(valid.values.styles, ["Slim"]);

  assert.match(validateGarmentFieldValues(fields, { height: "abc", approved: false, styles: ["Slim"] }).error ?? "", /Invalid number/);
  assert.match(validateGarmentFieldValues(fields, { height: 20, approved: false, styles: [] }).error ?? "", /Styles is required/);
  assert.match(validateGarmentFieldValues(fields, { height: 20, approved: "false", styles: ["Slim"] }).error ?? "", /Invalid checkbox/);
  assert.match(validateGarmentFieldValues(fields, { height: 20, approved: false, styles: ["Other"] }).error ?? "", /Invalid value/);
  assert.match(validateGarmentFieldValues(fields, { height: 20.12, approved: false, styles: ["Slim"] }).error ?? "", /too many decimal/);
  assert.match(validateGarmentFieldValues(fields, { height: 10, approved: false, styles: ["Slim"] }).error ?? "", /outside the allowed range/);
  const unknown = validateGarmentFieldValues(fields, { height: 20, approved: false, styles: ["Slim"], unknown: "x" });
  assert.equal(unknown.fieldErrors?.unknown, "Unknown field: unknown");
});

test("server-built snapshots retain trusted metadata, stable ordering, and native saved values", () => {
  const schema = [
    field({ code: "waist", name: "Waist", displayOrder: 2, sectionOrder: 1, unit: "inch" }),
    field({ code: "style", name: "Style", inputType: "select", displayOrder: 1, sectionOrder: 2, unit: null, options: ["Slim"] }),
  ];
  const snapshot = buildFieldSchemaSnapshot(schema, { waist: "32", style: "Slim" });
  assert.deepEqual(snapshot.fields.map((item) => [item.code, item.name, item.value, item.unit]), [
    ["waist", "Waist", 32, "inch"],
    ["style", "Style", "Slim", null],
  ]);
  assert.equal(shouldPrintMeasurementsOnJobCard(snapshot), true);
  const hiddenMeasurementSnapshot = buildFieldSchemaSnapshot(schema, { waist: 32 }, false);
  assert.equal(shouldPrintMeasurementsOnJobCard(hiddenMeasurementSnapshot), false);
  assert.equal(shouldPrintMeasurementsOnJobCard(undefined), true);
});

test("historical display prefers valid snapshots and safely falls back for malformed snapshots", () => {
  const snapshot = buildFieldSchemaSnapshot([field({ name: "Historic Height", unit: "cm" })], { height: 180 });
  const historical = resolveHistoricalGarmentDisplayFields({
    measurements: { height: 99, legacy_note: "Keep visible" },
    fieldSchemaSnapshot: snapshot,
    runtimeFields: [field({ name: "Renamed Height" })],
  });
  assert.deepEqual(historical.map((item) => [item.label, item.value, item.unit]), [["Historic Height", 180, "cm"]]);
  assert.equal(historicalGarmentValueText(false), "No");
  assert.equal(historicalGarmentValueText(["Slim", "Classic"]), "Slim, Classic");
  assert.equal(historicalGarmentValueText({ reference: "legacy" }), '{"reference":"legacy"}');
  const fallback = resolveHistoricalGarmentDisplayFields({
    measurements: { legacy_note: "Keep visible" },
    fieldSchemaSnapshot: { fields: [{ invalid: true }] },
  });
  assert.deepEqual(fallback.map((item) => [item.label, item.value]), [["legacy_note", "Keep visible"]]);
});

test("migrated flows keep one generic renderer and operational documents consume snapshots", () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const newOrder = source("components/orders/new-order-items-card.tsx");
  const editOrder = source("components/orders/edit-order-form.tsx");
  const customerProfile = source("app/(shell)/customers/[id]/measurements/page.tsx");
  const jobCards = source("app/(shell)/job-cards/page.tsx");
  const stageSlips = source("lib/data/job-card-stage-slips-db.ts");
  const printView = source("app/orders/[id]/print/job-card/page.tsx");

  assert.match(newOrder, /<GarmentFormFields/);
  assert.match(newOrder, /resolveRuntimeGarmentFields/);
  assert.match(newOrder, /serializeGarmentFieldDraft/);
  assert.doesNotMatch(newOrder, /isShirtStyleGarment|SHIRT_STYLE_FIELDS|shirtR[1-4]/);
  assert.match(editOrder, /NewOrderItemsCard/);
  assert.match(editOrder, /orderItemToDraftItem/);
  assert.match(customerProfile, /<CustomerMeasurementsForm/);
  assert.match(customerProfile, /resolveRuntimeGarmentFields/);
  assert.doesNotMatch(customerProfile, /isShirtStyleGarment|SHIRT_STYLE_FIELDS|shirtR[1-4]/);
  assert.match(jobCards, /fieldSchemaSnapshot/);
  assert.match(stageSlips, /field_schema_snapshot/);
  assert.match(printView, /fieldSchemaSnapshot/);
});

test("catalog configuration editor hydrates async mappings and list counts use metadata mappings", () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const catalogPage = source("app/(shell)/catalog/page.tsx");
  const drawer = source("components/catalog/garment-type-config-drawer.tsx");
  const table = source("components/catalog/catalog-table.tsx");

  assert.match(catalogPage, /getGarmentTypeConfigurationsAction/);
  assert.match(catalogPage, /metadataFieldCounts/);
  assert.match(drawer, /useEffect\(\(\) => \{\s*if \(!configuration\) return;/);
  assert.match(drawer, /setSelected\(configured\)/);
  assert.match(table, /metadataFieldCounts\[garment\.id\] \?\? garment\.measurementFieldIds\.length/);
});
