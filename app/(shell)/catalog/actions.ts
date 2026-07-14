"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  createAddOn,
  createGarmentType,
  getActiveAddOns,
  getActiveGarmentTypes,
  getAllAddOns,
  getAllGarmentTypes,
  setAddOnActive,
  setGarmentTypeActive,
  updateAddOn,
  updateGarmentType,
} from "@/lib/data/catalog-db";
import {
  customMeasurementFieldLabel,
  isCustomMeasurementFieldId,
  measurementFields,
  type AddOnInput,
  type CatalogAddOn,
  type CatalogGarmentType,
  type GarmentTypeInput,
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

function validateGarmentInput(
  data: GarmentTypeInput,
  validAddOnIds: Set<string>
): string | null {
  if (!data.name.trim()) return "Garment name is required.";
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

function validateAddOnInput(data: AddOnInput): string | null {
  if (!data.name.trim()) return "Add-on name is required.";
  if (!Number.isFinite(data.defaultPrice) || data.defaultPrice < 0) {
    return "Default price must be 0 or greater.";
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
  const validAddOnIds = new Set((await getAllAddOns(supabase)).map((a) => a.id));
  const validationError = validateGarmentInput(data, validAddOnIds);
  if (validationError) return { success: false, error: validationError };

  const garment = await createGarmentType(supabase, data);
  return { success: true, data: garment };
}

export async function updateGarmentTypeAction(
  id: string,
  data: GarmentTypeInput
): Promise<ActionResult<CatalogGarmentType>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validAddOnIds = new Set((await getAllAddOns(supabase)).map((a) => a.id));
  const validationError = validateGarmentInput(data, validAddOnIds);
  if (validationError) return { success: false, error: validationError };

  const garment = await updateGarmentType(supabase, id, data);
  if (!garment) return { success: false, error: "Garment type not found." };
  return { success: true, data: garment };
}

export async function setGarmentTypeActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<CatalogGarmentType>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const garment = await setGarmentTypeActive(supabase, id, isActive);
  if (!garment) return { success: false, error: "Garment type not found." };
  return { success: true, data: garment };
}

export async function createAddOnAction(
  data: AddOnInput
): Promise<ActionResult<CatalogAddOn>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "catalog.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateAddOnInput(data);
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

  const validationError = validateAddOnInput(data);
  if (validationError) return { success: false, error: validationError };

  const addOn = await updateAddOn(supabase, id, data);
  if (!addOn) return { success: false, error: "Add-on not found." };
  return { success: true, data: addOn };
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
