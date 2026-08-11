import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_WORK_STAGES,
  defaultGarmentSectionForName,
  initialShortcutCodeForGarmentName,
} from "@/lib/catalog";
import type {
  AddOnInput,
  CatalogAddOn,
  CatalogGarmentType,
  CatalogWorkStage,
  GarmentSection,
  GarmentTypeInput,
  WorkStageInput,
} from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Phase 6B: real, Supabase-backed replacements for lib/catalog.ts's mock
// arrays/functions (defaultGarmentTypes/defaultAddOns and their accessors/
// mutations) — same names/shapes, each now taking an already-constructed
// Supabase client as the first parameter (same pattern as
// lib/data/customers-db.ts). Unlike Phase 6A, nothing outside the Catalog
// admin module and New Order reads lib/catalog.ts's data functions, so the
// old mock arrays/functions were deleted outright from lib/catalog.ts
// instead of left in place — see that file for what's kept (fixed
// vocabulary + pure math only).
//
// DB rows are snake_case; the domain types (lib/catalog.ts) are camelCase —
// each function maps explicitly at the boundary.
// ---------------------------------------------------------------------------

const ADDON_COLUMNS = "id, name, default_price, worker_stage_rates, is_active";
const WORK_STAGE_COLUMNS =
  "id, name, stage_key, display_order, is_active, is_final_stage";
const LEGACY_WORK_STAGE_COLUMNS = "id, name, stage_key, display_order, is_active";

interface AddOnRow {
  id: string;
  name: string;
  default_price: number;
  worker_stage_rates: Record<string, number> | null;
  is_active: boolean;
}

function mapAddOn(row: AddOnRow): CatalogAddOn {
  return {
    id: row.id,
    name: row.name,
    defaultPrice: row.default_price,
    workerStageRates: row.worker_stage_rates ?? undefined,
    isActive: row.is_active,
  };
}

interface WorkStageRow {
  id: string;
  name: string;
  stage_key: string;
  display_order: number;
  is_active: boolean;
  is_final_stage: boolean;
}

function normalizeStageKey(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function mapWorkStage(row: WorkStageRow): CatalogWorkStage {
  return {
    id: row.id,
    name: row.name,
    stageKey: row.stage_key,
    displayOrder: Number(row.display_order),
    isActive: row.is_active,
    isFinalStage: row.is_final_stage,
  };
}

function mapLegacyWorkStage(row: Omit<WorkStageRow, "is_final_stage">): CatalogWorkStage {
  return mapWorkStage({
    ...row,
    // Compatibility while the new migration is being applied. This matches
    // the production behavior that existed before final-stage configuration.
    is_final_stage: row.stage_key === "Ironing/Packing",
  });
}

function isMissingWorkStagesSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("catalog_work_stages");
}

function isMissingFinalStageColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "42703" || String(candidate.message ?? "").includes("is_final_stage");
}

export async function getAllWorkStages(supabase: SupabaseClient): Promise<CatalogWorkStage[]> {
  const { data, error } = await supabase
    .from("catalog_work_stages")
    .select(WORK_STAGE_COLUMNS)
    .order("display_order", { ascending: true })
    .order("name");
  if (error) {
    if (isMissingWorkStagesSchemaError(error)) return DEFAULT_WORK_STAGES;
    if (isMissingFinalStageColumnError(error)) {
      const { data: legacyRows, error: legacyError } = await supabase
        .from("catalog_work_stages")
        .select(LEGACY_WORK_STAGE_COLUMNS)
        .order("display_order", { ascending: true })
        .order("name");
      if (legacyError) throw legacyError;
      return ((legacyRows as Omit<WorkStageRow, "is_final_stage">[]) ?? []).map(
        mapLegacyWorkStage
      );
    }
    throw error;
  }
  return ((data as WorkStageRow[]) ?? []).map(mapWorkStage);
}

export async function getActiveWorkStages(supabase: SupabaseClient): Promise<CatalogWorkStage[]> {
  const stages = await getAllWorkStages(supabase);
  return stages.filter((stage) => stage.isActive);
}

export async function createWorkStage(
  supabase: SupabaseClient,
  data: WorkStageInput
): Promise<CatalogWorkStage> {
  const { data: row, error } = await supabase
    .from("catalog_work_stages")
    .insert({
      name: data.name,
      stage_key: normalizeStageKey(data.name),
      display_order: data.displayOrder,
      is_active: data.isActive,
      is_final_stage: false,
    })
    .select(WORK_STAGE_COLUMNS)
    .single();
  if (error) throw error;
  return mapWorkStage(row as WorkStageRow);
}

export async function setFinalWorkStage(
  supabase: SupabaseClient,
  id: string
): Promise<CatalogWorkStage | undefined> {
  const { data: stage, error: stageError } = await supabase
    .from("catalog_work_stages")
    .select(WORK_STAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (stageError) throw stageError;
  if (!stage) return undefined;
  if (!(stage as WorkStageRow).is_active) {
    throw new Error("Only an active work stage can be the final production stage.");
  }
  if ((stage as WorkStageRow).stage_key === "Delivery") {
    throw new Error("Delivery cannot be the final production stage. Choose the last workshop stage.");
  }

  const { error: clearError } = await supabase
    .from("catalog_work_stages")
    .update({ is_final_stage: false, updated_at: new Date().toISOString() })
    .neq("id", id);
  if (clearError) throw clearError;

  const { data: updated, error: updateError } = await supabase
    .from("catalog_work_stages")
    .update({ is_final_stage: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(WORK_STAGE_COLUMNS)
    .maybeSingle();
  if (updateError) throw updateError;
  return updated ? mapWorkStage(updated as WorkStageRow) : undefined;
}

export async function getFinalWorkStage(
  supabase: SupabaseClient
): Promise<CatalogWorkStage | undefined> {
  const stages = await getActiveWorkStages(supabase);
  return stages.find((stage) => stage.isFinalStage);
}

export async function updateWorkStage(
  supabase: SupabaseClient,
  id: string,
  data: WorkStageInput
): Promise<CatalogWorkStage | undefined> {
  const { data: row, error } = await supabase
    .from("catalog_work_stages")
    .update({
      name: data.name,
      stage_key: normalizeStageKey(data.name),
      display_order: data.displayOrder,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(WORK_STAGE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapWorkStage(row as WorkStageRow) : undefined;
}

export async function setWorkStageActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<CatalogWorkStage | undefined> {
  const { data: row, error } = await supabase
    .from("catalog_work_stages")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(WORK_STAGE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapWorkStage(row as WorkStageRow) : undefined;
}

export async function getAllAddOns(supabase: SupabaseClient): Promise<CatalogAddOn[]> {
  const { data, error } = await supabase
    .from("catalog_addons")
    .select(ADDON_COLUMNS)
    .order("name");
  if (error) throw error;
  return ((data as AddOnRow[]) ?? []).map(mapAddOn);
}

export async function getActiveAddOns(supabase: SupabaseClient): Promise<CatalogAddOn[]> {
  const { data, error } = await supabase
    .from("catalog_addons")
    .select(ADDON_COLUMNS)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return ((data as AddOnRow[]) ?? []).map(mapAddOn);
}

export async function getAddOnById(
  supabase: SupabaseClient,
  id: string
): Promise<CatalogAddOn | undefined> {
  const { data, error } = await supabase
    .from("catalog_addons")
    .select(ADDON_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAddOn(data as AddOnRow) : undefined;
}

export async function createAddOn(
  supabase: SupabaseClient,
  data: AddOnInput
): Promise<CatalogAddOn> {
  const { data: row, error } = await supabase
    .from("catalog_addons")
    .insert({
      name: data.name,
      default_price: data.defaultPrice,
      worker_stage_rates: data.workerStageRates ?? {},
      is_active: data.isActive,
    })
    .select(ADDON_COLUMNS)
    .single();
  if (error) throw error;
  return mapAddOn(row as AddOnRow);
}

export async function updateAddOn(
  supabase: SupabaseClient,
  id: string,
  data: AddOnInput
): Promise<CatalogAddOn | undefined> {
  const { data: row, error } = await supabase
    .from("catalog_addons")
    .update({
      name: data.name,
      default_price: data.defaultPrice,
      worker_stage_rates: data.workerStageRates ?? {},
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(ADDON_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapAddOn(row as AddOnRow) : undefined;
}

export async function setAddOnActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<CatalogAddOn | undefined> {
  const { data: row, error } = await supabase
    .from("catalog_addons")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(ADDON_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapAddOn(row as AddOnRow) : undefined;
}

const GARMENT_COLUMNS =
  "id, name, order_section, shortcut_code, base_price, measurement_field_ids, addon_ids, show_order_addons, is_active";
const LEGACY_GARMENT_COLUMNS =
  "id, name, base_price, measurement_field_ids, addon_ids, is_active";

interface GarmentRow {
  id: string;
  name: string;
  order_section: GarmentSection;
  shortcut_code: number | null;
  base_price: number;
  measurement_field_ids: string[];
  addon_ids: string[];
  show_order_addons?: boolean | null;
  is_active: boolean;
}

type LegacyGarmentRow = Omit<GarmentRow, "shortcut_code" | "order_section">;

function isMissingShortcutCodeColumn(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42703"
  );
}

function mapGarment(row: GarmentRow): CatalogGarmentType {
  return {
    id: row.id,
    name: row.name,
    section: row.order_section,
    shortcutCode: row.shortcut_code ?? initialShortcutCodeForGarmentName(row.name),
    basePrice: row.base_price,
    measurementFieldIds: row.measurement_field_ids ?? [],
    addOnIds: row.addon_ids ?? [],
    showOrderAddOns: row.show_order_addons !== false,
    isActive: row.is_active,
  };
}

function mapLegacyGarment(row: LegacyGarmentRow): CatalogGarmentType {
  return mapGarment({
    ...row,
    order_section: defaultGarmentSectionForName(row.name),
    shortcut_code: initialShortcutCodeForGarmentName(row.name),
  });
}

export async function getAllGarmentTypes(
  supabase: SupabaseClient
): Promise<CatalogGarmentType[]> {
  const { data, error } = await supabase
    .from("catalog_garment_types")
    .select(GARMENT_COLUMNS)
    .order("name");
  if (error) {
    if (!isMissingShortcutCodeColumn(error)) throw error;
    const { data: legacyData, error: legacyError } = await supabase
      .from("catalog_garment_types")
      .select(LEGACY_GARMENT_COLUMNS)
      .order("name");
    if (legacyError) throw legacyError;
    return ((legacyData as LegacyGarmentRow[]) ?? []).map(mapLegacyGarment);
  }
  return ((data as GarmentRow[]) ?? []).map(mapGarment);
}

export async function getActiveGarmentTypes(
  supabase: SupabaseClient
): Promise<CatalogGarmentType[]> {
  const { data, error } = await supabase
    .from("catalog_garment_types")
    .select(GARMENT_COLUMNS)
    .eq("is_active", true)
    .order("name");
  if (error) {
    if (!isMissingShortcutCodeColumn(error)) throw error;
    const { data: legacyData, error: legacyError } = await supabase
      .from("catalog_garment_types")
      .select(LEGACY_GARMENT_COLUMNS)
      .eq("is_active", true)
      .order("name");
    if (legacyError) throw legacyError;
    return ((legacyData as LegacyGarmentRow[]) ?? []).map(mapLegacyGarment);
  }
  return ((data as GarmentRow[]) ?? []).map(mapGarment);
}

export async function getGarmentById(
  supabase: SupabaseClient,
  id: string
): Promise<CatalogGarmentType | undefined> {
  const { data, error } = await supabase
    .from("catalog_garment_types")
    .select(GARMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (!isMissingShortcutCodeColumn(error)) throw error;
    const { data: legacyData, error: legacyError } = await supabase
      .from("catalog_garment_types")
      .select(LEGACY_GARMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (legacyError) throw legacyError;
    return legacyData ? mapLegacyGarment(legacyData as LegacyGarmentRow) : undefined;
  }
  return data ? mapGarment(data as GarmentRow) : undefined;
}

export async function createGarmentType(
  supabase: SupabaseClient,
  data: GarmentTypeInput
): Promise<CatalogGarmentType> {
  const { data: row, error } = await supabase
    .from("catalog_garment_types")
    .insert({
      name: data.name,
      order_section: data.section,
      shortcut_code: data.shortcutCode,
      base_price: data.basePrice,
      measurement_field_ids: data.measurementFieldIds,
      addon_ids: data.addOnIds,
      show_order_addons: data.showOrderAddOns,
      is_active: data.isActive,
    })
    .select(GARMENT_COLUMNS)
    .single();
  if (error) throw error;
  return mapGarment(row as GarmentRow);
}

export async function updateGarmentType(
  supabase: SupabaseClient,
  id: string,
  data: GarmentTypeInput
): Promise<CatalogGarmentType | undefined> {
  const { data: row, error } = await supabase
    .from("catalog_garment_types")
    .update({
      name: data.name,
      order_section: data.section,
      shortcut_code: data.shortcutCode,
      base_price: data.basePrice,
      measurement_field_ids: data.measurementFieldIds,
      addon_ids: data.addOnIds,
      show_order_addons: data.showOrderAddOns,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(GARMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapGarment(row as GarmentRow) : undefined;
}

export async function setGarmentTypeActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<CatalogGarmentType | undefined> {
  const { data: row, error } = await supabase
    .from("catalog_garment_types")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(GARMENT_COLUMNS)
    .maybeSingle();
  if (error) {
    if (!isMissingShortcutCodeColumn(error)) throw error;
    const { data: legacyRow, error: legacyError } = await supabase
      .from("catalog_garment_types")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(LEGACY_GARMENT_COLUMNS)
      .maybeSingle();
    if (legacyError) throw legacyError;
    return legacyRow ? mapLegacyGarment(legacyRow as LegacyGarmentRow) : undefined;
  }
  return row ? mapGarment(row as GarmentRow) : undefined;
}
