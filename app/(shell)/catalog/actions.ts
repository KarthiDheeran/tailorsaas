"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
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
  customMeasurementFieldLabel,
  isCustomMeasurementFieldId,
  measurementFields,
  type AddOnInput,
  type CatalogAddOn,
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

const VALID_MEASUREMENT_FIELD_IDS = new Set(measurementFields.map((f) => f.id));

function stageKeys(stages: CatalogWorkStage[]) {
  return new Set(stages.filter((stage) => stage.isActive).map((stage) => stage.stageKey));
}

export async function getGarmentTypesAction(): Promise<CatalogGarmentType[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  return getAllGarmentTypes(supabase);
}

export async function getActiveGarmentTypesAction(): Promise<CatalogGarmentType[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.view");
  if (!guard.ok) return [];
  return getActiveGarmentTypes(supabase);
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
        error: "Run the garment numeric code migration before saving garment codes.",
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
        error: "Run the garment numeric code migration before saving garment codes.",
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
