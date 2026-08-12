"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getServerCallerContext,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  createAddOn,
  createGarmentType,
  createWorkStage,
  getActiveAddOns,
  getActiveGarmentTypes,
  getActiveWorkStages,
  getAllAddOns,
  getAllGarmentTypes,
  getAllWorkStages,
  getGarmentById,
  setAddOnActive,
  setFinalWorkStage,
  setGarmentTypeActive,
  setWorkStageActive,
  updateAddOn,
  updateGarmentType,
  updateWorkStage,
} from "@/lib/data/catalog-db";
import {
  createCatalogField,
  createCatalogSection,
  getCatalogFieldById,
  getCatalogFields,
  getCatalogSections,
  getGarmentTypeConfiguration,
  getGarmentTypeConfigurations,
  saveGarmentTypeConfiguration,
  setCatalogFieldActive,
  updateCatalogField,
  updateCatalogSection,
} from "@/lib/data/catalog-fields-db";
import {
  CATALOG_FIELD_INPUT_TYPES,
  CATALOG_FIELD_TYPES,
  customMeasurementFieldLabel,
  isBodyMeasurementLayout,
  isGarmentSection,
  isCustomMeasurementFieldId,
  measurementFields,
  type AddOnInput,
  type CatalogAddOn,
  type CatalogField,
  type CatalogFieldInput,
  type GarmentTypeConfiguration,
  type GarmentTypeFieldAssignmentInput,
  type CatalogSection,
  type CatalogSectionInput,
  type CatalogGarmentType,
  type CatalogWorkStage,
  type GarmentTypeInput,
  type WorkStageInput,
} from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Phase 6B: Garment Types and Add-ons/Extras are now real, Supabase-backed
// tables (supabase/migrations/0005_catalog.sql). Reads AND writes both go
// through lib/data/catalog-db.ts — same read-relocation reasoning as
// Customers (Phase 6A): every page/component already calls these Server
// Actions rather than importing catalog data directly, so swapping what's
// inside each action needed zero page changes.
//
// lib/catalog.ts's old mock arrays/functions were deleted outright (not
// left in place) — unlike Phase 6A's Customers fork, nothing outside the
// Catalog admin module and New Order ever read them, so there was no
// third consumer to protect from breaking.
//
// getActiveGarmentTypesAction is new in this phase — New Order fetches only
// active garment types once at the page level (see
// app/(shell)/orders/new/page.tsx), distinct from this admin module's own
// getGarmentTypesAction, which still needs the full list (active + inactive)
// for its management table.
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface CatalogPageBootstrapData {
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  activeAddOns: CatalogAddOn[];
  workStages: CatalogWorkStage[];
  activeWorkStages: CatalogWorkStage[];
  catalogFields: CatalogField[];
  catalogSections: CatalogSection[];
  metadataFieldCounts: Record<string, number>;
}

const VALID_MEASUREMENT_FIELD_IDS = new Set(measurementFields.map((f) => f.id));
const CATALOG_FIELD_CODE = /^[a-z][a-z0-9_]{0,63}$/;

function isMissingMetadataSchema(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate?.message ?? ""} ${candidate?.details ?? ""}`.toLowerCase();
  return candidate?.code === "42P01" || candidate?.code === "PGRST205" || message.includes("catalog_fields") || message.includes("catalog_sections") || message.includes("garment_type_fields");
}

function stageKeys(stages: CatalogWorkStage[]) {
  return new Set(stages.filter((stage) => stage.isActive).map((stage) => stage.stageKey));
}

export async function getCatalogPageBootstrapAction(): Promise<CatalogPageBootstrapData> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) {
    return {
      garmentTypes: [],
      addOns: [],
      activeAddOns: [],
      workStages: [],
      activeWorkStages: [],
      catalogFields: [],
      catalogSections: [],
      metadataFieldCounts: {},
    };
  }

  const [
    allGarments,
    addOns,
    workStages,
    catalogFields,
    catalogSections,
    caller,
  ] = await Promise.all([
    getAllGarmentTypes(supabase),
    getAllAddOns(supabase),
    getAllWorkStages(supabase),
    getCatalogFields(supabase).catch((error) => {
      if (isMissingMetadataSchema(error)) return [];
      throw error;
    }),
    getCatalogSections(supabase).catch((error) => {
      if (isMissingMetadataSchema(error)) return [];
      throw error;
    }),
    getServerCallerContext(supabase),
  ]);

  const garmentTypes =
    !caller || caller.permissions.includes("catalog.manage")
      ? allGarments
      : allGarments.filter((garment) => caller.allowedOrderSections.includes(garment.section));
  const configurations = await getGarmentTypeConfigurations(
    supabase,
    garmentTypes.map((garment) => garment.id)
  );

  return {
    garmentTypes,
    addOns,
    activeAddOns: addOns.filter((addOn) => addOn.isActive),
    workStages,
    activeWorkStages: workStages.filter((stage) => stage.isActive),
    catalogFields,
    catalogSections,
    metadataFieldCounts: Object.fromEntries(
      configurations.map((configuration) => [
        configuration.garment.id,
        configuration.fields.filter((field) => field.field?.isActive).length,
      ])
    ),
  };
}

export async function getGarmentTypesAction(): Promise<CatalogGarmentType[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  const garments = await getAllGarmentTypes(supabase);
  const caller = await getServerCallerContext(supabase);
  if (!caller || caller.permissions.includes("catalog.manage")) return garments;
  return garments.filter((garment) => caller.allowedOrderSections.includes(garment.section));
}

export async function getActiveGarmentTypesAction(): Promise<CatalogGarmentType[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  const garments = await getActiveGarmentTypes(supabase);
  const caller = await getServerCallerContext(supabase);
  if (!caller || caller.permissions.includes("catalog.manage")) return garments;
  return garments.filter((garment) => caller.allowedOrderSections.includes(garment.section));
}

export async function getAddOnsAction(): Promise<CatalogAddOn[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  return getAllAddOns(supabase);
}

export async function getActiveAddOnsAction(): Promise<CatalogAddOn[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  return getActiveAddOns(supabase);
}

export async function getWorkStagesAction(): Promise<CatalogWorkStage[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  return getAllWorkStages(supabase);
}

export async function getActiveWorkStagesAction(): Promise<CatalogWorkStage[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  return getActiveWorkStages(supabase);
}

function validateGarmentInput(
  data: GarmentTypeInput,
  validAddOnIds: Set<string>,
  existingGarments: CatalogGarmentType[],
  currentGarmentId?: string
): string | null {
  if (!data.name.trim()) return "Garment name is required.";
  if (!isGarmentSection(data.section)) return "Choose a valid order section.";
  if (data.shortcutCode !== null) {
    if (!Number.isInteger(data.shortcutCode) || data.shortcutCode <= 0) {
      return "Numeric code must be a positive whole number.";
    }
    const duplicate = existingGarments.find(
      (garment) =>
        garment.id !== currentGarmentId &&
        garment.shortcutCode === data.shortcutCode
    );
    if (duplicate) {
      return `Numeric code ${data.shortcutCode} is already used by ${duplicate.name}.`;
    }
  }
  if (data.isActive && data.shortcutCode === null) {
    return "Numeric code is required for active garment types.";
  }
  if (!Number.isFinite(data.basePrice) || data.basePrice < 0) {
    return "Base price must be 0 or greater.";
  }
  if (!isBodyMeasurementLayout(data.bodyMeasurementLayout)) {
    return "Choose a valid body measurement layout.";
  }
  for (const id of data.measurementFieldIds) {
    if (isCustomMeasurementFieldId(id)) {
      const label = customMeasurementFieldLabel(id);
      if (!label) return "Custom measurement field name is required.";
      if (label.length > 60) return "Custom measurement field name is too long.";
      continue;
    }
    if (!VALID_MEASUREMENT_FIELD_IDS.has(id)) {
      return `Unknown measurement field: ${id}.`;
    }
  }
  for (const id of data.addOnIds) {
    if (!validAddOnIds.has(id)) {
      return `Unknown add-on: ${id}.`;
    }
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function isMissingShortcutCodeColumn(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42703"
  );
}

function validateAddOnInput(data: AddOnInput, validStageKeys: Set<string>): string | null {
  if (!data.name.trim()) return "Add-on name is required.";
  if (!Number.isFinite(data.defaultPrice) || data.defaultPrice < 0) {
    return "Default price must be 0 or greater.";
  }
  for (const [stage, amount] of Object.entries(data.workerStageRates ?? {})) {
    if (!validStageKeys.has(stage)) return `Unknown worker stage: ${stage}.`;
    if (amount == null) continue;
    if (!Number.isFinite(amount) || amount < 0) {
      return `Worker pay for ${stage} must be 0 or greater.`;
    }
  }
  return null;
}

function validateWorkStageInput(data: WorkStageInput): string | null {
  if (!data.name.trim()) return "Stage name is required.";
  if (!Number.isFinite(data.displayOrder) || data.displayOrder < 1) {
    return "Display order must be 1 or greater.";
  }
  return null;
}

export async function createGarmentTypeAction(
  data: GarmentTypeInput
): Promise<ActionResult<CatalogGarmentType>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  // Every addon_id must exist in the real catalog_addons table — re-checked
  // fresh here, never trusting the client's copy (same authority pattern as
  // every other write in this app).
  const [allAddOns, existingGarments] = await Promise.all([
    getAllAddOns(supabase),
    getAllGarmentTypes(supabase),
  ]);
  const validAddOnIds = new Set(allAddOns.map((a) => a.id));
  const validationError = validateGarmentInput(
    data,
    validAddOnIds,
    existingGarments
  );
  if (validationError) return { success: false, error: validationError };

  try {
    const garment = await createGarmentType(supabase, data);
    return { success: true, data: garment };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: "Numeric code already exists. Choose another code." };
    }
    if (isMissingShortcutCodeColumn(error)) {
      return {
        success: false,
        error: "Run the latest catalog database migrations before saving garment types.",
      };
    }
    throw error;
  }
}

export async function updateGarmentTypeAction(
  id: string,
  data: GarmentTypeInput
): Promise<ActionResult<CatalogGarmentType>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const [allAddOns, existingGarments] = await Promise.all([
    getAllAddOns(supabase),
    getAllGarmentTypes(supabase),
  ]);
  const validAddOnIds = new Set(allAddOns.map((a) => a.id));
  const validationError = validateGarmentInput(
    data,
    validAddOnIds,
    existingGarments,
    id
  );
  if (validationError) return { success: false, error: validationError };

  try {
    const garment = await updateGarmentType(supabase, id, data);
    if (!garment) return { success: false, error: "Garment type not found." };
    return { success: true, data: garment };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: "Numeric code already exists. Choose another code." };
    }
    if (isMissingShortcutCodeColumn(error)) {
      return {
        success: false,
        error: "Run the latest catalog database migrations before saving garment types.",
      };
    }
    throw error;
  }
}

export async function setGarmentTypeActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<CatalogGarmentType>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  if (isActive) {
    const existing = await getGarmentById(supabase, id);
    if (!existing) return { success: false, error: "Garment type not found." };
    if (existing.shortcutCode === null) {
      return {
        success: false,
        error: "Numeric code is required before activating this garment type.",
      };
    }
  }

  try {
    const garment = await setGarmentTypeActive(supabase, id, isActive);
    if (!garment) return { success: false, error: "Garment type not found." };
    return { success: true, data: garment };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: "Numeric code already exists. Choose another code." };
    }
    throw error;
  }
}

export async function createAddOnAction(
  data: AddOnInput
): Promise<ActionResult<CatalogAddOn>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const stages = await getAllWorkStages(supabase);
  const validationError = validateAddOnInput(data, stageKeys(stages));
  if (validationError) return { success: false, error: validationError };

  const addOn = await createAddOn(supabase, data);
  return { success: true, data: addOn };
}

export async function updateAddOnAction(
  id: string,
  data: AddOnInput
): Promise<ActionResult<CatalogAddOn>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const stages = await getAllWorkStages(supabase);
  const validationError = validateAddOnInput(data, stageKeys(stages));
  if (validationError) return { success: false, error: validationError };

  const addOn = await updateAddOn(supabase, id, data);
  if (!addOn) return { success: false, error: "Add-on not found." };
  return { success: true, data: addOn };
}

export async function createWorkStageAction(
  data: WorkStageInput
): Promise<ActionResult<CatalogWorkStage>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const validationError = validateWorkStageInput(data);
  if (validationError) return { success: false, error: validationError };
  try {
    const stage = await createWorkStage(supabase, data);
    return { success: true, data: stage };
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, error: "Stage already exists." };
    throw error;
  }
}

export async function updateWorkStageAction(
  id: string,
  data: WorkStageInput
): Promise<ActionResult<CatalogWorkStage>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const validationError = validateWorkStageInput(data);
  if (validationError) return { success: false, error: validationError };
  try {
    const stage = await updateWorkStage(supabase, id, data);
    if (!stage) return { success: false, error: "Stage not found." };
    return { success: true, data: stage };
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, error: "Stage already exists." };
    throw error;
  }
}

export async function setWorkStageActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<CatalogWorkStage>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!isActive) {
    const stages = await getAllWorkStages(supabase);
    const stage = stages.find((candidate) => candidate.id === id);
    if (stage?.isFinalStage) {
      return {
        success: false,
        error: "Choose another final production stage before deactivating this one.",
      };
    }
  }
  const stage = await setWorkStageActive(supabase, id, isActive);
  if (!stage) return { success: false, error: "Stage not found." };
  return { success: true, data: stage };
}

function validateCatalogSectionInput(data: CatalogSectionInput): string | null {
  if (!data.name.trim()) return "Section name is required.";
  if (data.name.trim().length > 80) return "Section name is too long.";
  if (!Number.isInteger(data.displayOrder) || data.displayOrder < 1) {
    return "Section display order must be 1 or greater.";
  }
  if (data.icon && data.icon.trim().length > 80) return "Section icon is too long.";
  return null;
}

function validateCatalogFieldInput(data: CatalogFieldInput): string | null {
  if (!CATALOG_FIELD_CODE.test(data.code.trim())) {
    return "Field code must start with a letter and use lowercase letters, numbers, or underscores only.";
  }
  if (!data.name.trim()) return "Field name is required.";
  if (data.name.trim().length > 100) return "Field name is too long.";
  if (!CATALOG_FIELD_TYPES.includes(data.fieldType)) return "Choose a valid field type.";
  if (!CATALOG_FIELD_INPUT_TYPES.includes(data.inputType)) return "Choose a valid input type.";
  if (!Number.isInteger(data.displayOrder) || data.displayOrder < 1) {
    return "Field display order must be 1 or greater.";
  }
  if (data.decimalPlaces !== null && (!Number.isInteger(data.decimalPlaces) || data.decimalPlaces < 0 || data.decimalPlaces > 6)) {
    return "Decimal places must be between 0 and 6.";
  }
  if (data.minValue !== null && !Number.isFinite(data.minValue)) return "Minimum value must be a number.";
  if (data.maxValue !== null && !Number.isFinite(data.maxValue)) return "Maximum value must be a number.";
  if (data.minValue !== null && data.maxValue !== null && data.minValue > data.maxValue) {
    return "Minimum value cannot be greater than maximum value.";
  }
  const options = data.options.map((option) => option.trim()).filter(Boolean);
  if (options.length !== data.options.length || new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) {
    return "Options must be non-empty and unique.";
  }
  if (["select", "multiselect"].includes(data.inputType) && options.length === 0) {
    return "Select fields need at least one option.";
  }
  if (!["select", "multiselect"].includes(data.inputType) && options.length > 0) {
    return "Only select and multiselect fields can have options.";
  }
  if (data.inputType === "table") {
    const table = data.uiMetadata?.table;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      return "Table fields need table metadata with rows and columns.";
    }
    const columns = (table as { columns?: unknown }).columns;
    if (!Array.isArray(columns) || columns.length === 0) {
      return "Table fields need at least one column.";
    }
  }
  return null;
}

export async function getCatalogSectionsAction(): Promise<CatalogSection[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  try {
    return await getCatalogSections(supabase);
  } catch (error) {
    // Safe rollout: Catalog's existing garment/add-on UI stays usable until
    // the Phase 1 metadata migration has been applied to this database.
    if (isMissingMetadataSchema(error)) return [];
    throw error;
  }
}

export async function getCatalogFieldsAction(): Promise<CatalogField[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  try {
    return await getCatalogFields(supabase);
  } catch (error) {
    if (isMissingMetadataSchema(error)) return [];
    throw error;
  }
}

export async function createCatalogSectionAction(
  data: CatalogSectionInput
): Promise<ActionResult<CatalogSection>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const validationError = validateCatalogSectionInput(data);
  if (validationError) return { success: false, error: validationError };
  try {
    return { success: true, data: await createCatalogSection(supabase, data) };
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, error: "A section with this name already exists." };
    throw error;
  }
}

export async function updateCatalogSectionAction(
  id: string,
  data: CatalogSectionInput
): Promise<ActionResult<CatalogSection>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const validationError = validateCatalogSectionInput(data);
  if (validationError) return { success: false, error: validationError };
  try {
    const section = await updateCatalogSection(supabase, id, data);
    return section
      ? { success: true, data: section }
      : { success: false, error: "Section not found." };
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, error: "A section with this name already exists." };
    throw error;
  }
}

export async function createCatalogFieldAction(
  data: CatalogFieldInput
): Promise<ActionResult<CatalogField>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const validationError = validateCatalogFieldInput(data);
  if (validationError) return { success: false, error: validationError };
  try {
    return { success: true, data: await createCatalogField(supabase, data) };
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, error: "Field code already exists." };
    throw error;
  }
}

export async function updateCatalogFieldAction(
  id: string,
  data: CatalogFieldInput
): Promise<ActionResult<CatalogField>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const existing = await getCatalogFieldById(supabase, id);
  if (!existing) return { success: false, error: "Field not found." };
  if (existing.isSystem && existing.code !== data.code.trim()) {
    return { success: false, error: "System field codes are protected." };
  }
  const validationError = validateCatalogFieldInput(data);
  if (validationError) return { success: false, error: validationError };
  try {
    const field = await updateCatalogField(supabase, id, data);
    return field ? { success: true, data: field } : { success: false, error: "Field not found." };
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, error: "Field code already exists." };
    throw error;
  }
}

export async function setCatalogFieldActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<CatalogField>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const existing = await getCatalogFieldById(supabase, id);
  if (!existing) return { success: false, error: "Field not found." };
  if (existing.isSystem && !isActive) {
    return { success: false, error: "System fields cannot be deactivated." };
  }
  const field = await setCatalogFieldActive(supabase, id, isActive);
  return field ? { success: true, data: field } : { success: false, error: "Field not found." };
}

export async function getGarmentTypeConfigurationAction(
  garmentTypeId: string
): Promise<GarmentTypeConfiguration | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return null;
  const configuration = await getGarmentTypeConfiguration(supabase, garmentTypeId);
  const caller = await getServerCallerContext(supabase);
  if (!configuration || !caller || caller.permissions.includes("catalog.manage")) return configuration;
  return caller.allowedOrderSections.includes(configuration.garment.section) ? configuration : null;
}

/** Catalog list companion: one joined query for all visible garment field counts. */
export async function getGarmentTypeConfigurationsAction(
  garmentTypeIds: string[]
): Promise<GarmentTypeConfiguration[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  const configurations = await getGarmentTypeConfigurations(supabase, garmentTypeIds);
  const caller = await getServerCallerContext(supabase);
  if (!caller || caller.permissions.includes("catalog.manage")) return configurations;
  return configurations.filter((configuration) =>
    caller.allowedOrderSections.includes(configuration.garment.section)
  );
}

export async function saveGarmentTypeConfigurationAction(
  garmentTypeId: string | null,
  data: GarmentTypeInput,
  assignments: GarmentTypeFieldAssignmentInput[],
  legacyMeasurementFieldIds: string[]
): Promise<ActionResult<CatalogGarmentType>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const [allAddOns, existingGarments, fields, sections] = await Promise.all([
    getAllAddOns(supabase),
    getAllGarmentTypes(supabase),
    getCatalogFields(supabase),
    getCatalogSections(supabase),
  ]);
  const validationError = validateGarmentInput(
    { ...data, measurementFieldIds: legacyMeasurementFieldIds },
    new Set(allAddOns.map((addOn) => addOn.id)),
    existingGarments,
    garmentTypeId ?? undefined
  );
  if (validationError) return { success: false, error: validationError };

  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const sectionIds = new Set(sections.map((section) => section.id));
  if (new Set(assignments.map((assignment) => assignment.fieldId)).size !== assignments.length) {
    return { success: false, error: "A field can only be assigned once to a garment type." };
  }
  for (const assignment of assignments) {
    const field = fieldsById.get(assignment.fieldId);
    if (!field) return { success: false, error: "Unknown configured field." };
    if (!field.isActive) return { success: false, error: `${field.name} is inactive and cannot be assigned.` };
    if (assignment.sectionId !== null && !sectionIds.has(assignment.sectionId)) {
      return { success: false, error: "Unknown configured section." };
    }
    if (!Number.isInteger(assignment.displayOrder) || assignment.displayOrder < 1) {
      return { success: false, error: "Field display order must be 1 or greater." };
    }
  }

  try {
    const savedId = await saveGarmentTypeConfiguration(
      supabase,
      garmentTypeId,
      data,
      assignments,
      legacyMeasurementFieldIds
    );
    const garment = await getGarmentById(supabase, savedId);
    return garment
      ? { success: true, data: garment }
      : { success: false, error: "Garment type was saved but could not be reloaded." };
  } catch (error) {
    if (isUniqueViolation(error)) return { success: false, error: "Numeric code already exists. Choose another code." };
    const message = error instanceof Error ? error.message : "Could not save garment configuration.";
    return { success: false, error: message };
  }
}

export async function setFinalWorkStageAction(
  id: string
): Promise<ActionResult<CatalogWorkStage>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    const stage = await setFinalWorkStage(supabase, id);
    if (!stage) return { success: false, error: "Stage not found." };
    return { success: true, data: stage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not set the final production stage.";
    if (message.includes("is_final_stage")) {
      return {
        success: false,
        error: "Run migration 0050_configurable_final_work_stage.sql before changing the final stage.",
      };
    }
    return { success: false, error: message };
  }
}

export async function setAddOnActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<CatalogAddOn>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const addOn = await setAddOnActive(supabase, id, isActive);
  if (!addOn) return { success: false, error: "Add-on not found." };
  return { success: true, data: addOn };
}
