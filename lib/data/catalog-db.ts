import type { SupabaseClient } from "@supabase/supabase-js";
import { initialShortcutCodeForGarmentName } from "@/lib/catalog";
import type {
  AddOnInput,
  CatalogAddOn,
  CatalogGarmentType,
  GarmentTypeInput,
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

const ADDON_COLUMNS = "id, name, default_price, is_active";

interface AddOnRow {
  id: string;
  name: string;
  default_price: number;
  is_active: boolean;
}

function mapAddOn(row: AddOnRow): CatalogAddOn {
  return {
    id: row.id,
    name: row.name,
    defaultPrice: row.default_price,
    isActive: row.is_active,
  };
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
  "id, name, shortcut_code, base_price, measurement_field_ids, addon_ids, is_active";
const LEGACY_GARMENT_COLUMNS =
  "id, name, base_price, measurement_field_ids, addon_ids, is_active";

interface GarmentRow {
  id: string;
  name: string;
  shortcut_code: number | null;
  base_price: number;
  measurement_field_ids: string[];
  addon_ids: string[];
  is_active: boolean;
}

type LegacyGarmentRow = Omit<GarmentRow, "shortcut_code">;

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
    shortcutCode: row.shortcut_code ?? initialShortcutCodeForGarmentName(row.name),
    basePrice: row.base_price,
    measurementFieldIds: row.measurement_field_ids ?? [],
    addOnIds: row.addon_ids ?? [],
    isActive: row.is_active,
  };
}

function mapLegacyGarment(row: LegacyGarmentRow): CatalogGarmentType {
  return mapGarment({
    ...row,
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
      shortcut_code: data.shortcutCode,
      base_price: data.basePrice,
      measurement_field_ids: data.measurementFieldIds,
      addon_ids: data.addOnIds,
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
      shortcut_code: data.shortcutCode,
      base_price: data.basePrice,
      measurement_field_ids: data.measurementFieldIds,
      addon_ids: data.addOnIds,
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
