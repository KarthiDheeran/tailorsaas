import type { SupabaseClient } from "@supabase/supabase-js";
import type { GarmentSection } from "@/lib/catalog";
import {
  isProductionPrintLayout,
  normalizeProductionPrintLayout,
  type ProductionPrintLayoutDefinition,
  type ProductionPrintLayoutRecord,
} from "@/lib/production-print-layout";

type LayoutRow = {
  id: string;
  tenant_id?: string;
  shop_id?: string;
  order_section: GarmentSection;
  garment_type_id: string | null;
  columns_per_row: number;
  cells: unknown;
  is_global?: boolean;
  is_active?: boolean;
  updated_at: string;
  updated_by?: string | null;
};

const COLUMNS = "id, tenant_id, shop_id, order_section, garment_type_id, columns_per_row, cells, is_global, is_active, updated_by, updated_at";
const LEGACY_COLUMNS = "id, tenant_id, shop_id, order_section, garment_type_id, columns_per_row, cells, updated_by, updated_at";

function isMissingGlobalLayoutColumns(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return candidate.code === "PGRST204" || message.includes("is_global") || message.includes("is_active");
}

function preferredLayoutRow(rows: LayoutRow[], garmentTypeId: string | undefined) {
  return garmentTypeId
    ? rows.find((row) => row.garment_type_id === garmentTypeId) ?? rows.find((row) => row.garment_type_id === null)
    : rows.find((row) => row.garment_type_id === null);
}

function mapLayout(row: LayoutRow): ProductionPrintLayoutRecord | null {
  const value = { columnsPerRow: row.columns_per_row, cells: row.cells };
  if (!isProductionPrintLayout(value)) return null;
  return {
    id: row.id,
    orderSection: row.order_section,
    garmentTypeId: row.garment_type_id ?? undefined,
    isActive: row.is_active !== false,
    updatedAt: row.updated_at,
    ...normalizeProductionPrintLayout(value),
  };
}

export function isMissingProductionPrintLayoutsSchema(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return candidate.code === "42P01" || candidate.code === "PGRST205" || message.includes("production_print_layouts");
}

export async function getProductionPrintLayouts(supabase: SupabaseClient): Promise<ProductionPrintLayoutRecord[]> {
  const query = supabase.from("production_print_layouts").select(COLUMNS).eq("is_global", true);
  const result = await query.order("order_section");
  let data: unknown = result.data;
  let error = result.error;
  if (error && isMissingGlobalLayoutColumns(error)) {
    const legacyResult = await supabase.from("production_print_layouts").select(LEGACY_COLUMNS).order("order_section");
    data = legacyResult.data;
    error = legacyResult.error;
  }
  if (error) {
    if (isMissingProductionPrintLayoutsSchema(error)) return [];
    throw error;
  }
  return ((data as LayoutRow[] | null) ?? []).flatMap((row) => mapLayout(row) ?? []);
}

export async function getEffectiveProductionPrintLayout(
  supabase: SupabaseClient,
  orderSection: GarmentSection | undefined,
  garmentTypeId: string | undefined,
): Promise<ProductionPrintLayoutDefinition | undefined> {
  if (!orderSection) return undefined;
  let query = supabase.from("production_print_layouts").select(COLUMNS).eq("is_global", true).eq("is_active", true).eq("order_section", orderSection);
  if (garmentTypeId) query = query.or(`garment_type_id.eq.${garmentTypeId},garment_type_id.is.null`);
  else query = query.is("garment_type_id", null);
  const result = await query.order("garment_type_id", { ascending: false, nullsFirst: false });
  let data: unknown = result.data;
  let error = result.error;
  if (error && isMissingGlobalLayoutColumns(error)) {
    let legacy = supabase.from("production_print_layouts").select(LEGACY_COLUMNS).eq("order_section", orderSection);
    if (garmentTypeId) legacy = legacy.or(`garment_type_id.eq.${garmentTypeId},garment_type_id.is.null`);
    else legacy = legacy.is("garment_type_id", null);
    const legacyResult = await legacy.order("garment_type_id", { ascending: false, nullsFirst: false });
    data = legacyResult.data;
    error = legacyResult.error;
  }
  if (error) {
    if (isMissingProductionPrintLayoutsSchema(error)) return undefined;
    throw error;
  }
  const rows = (data as LayoutRow[] | null) ?? [];
  const preferred = preferredLayoutRow(rows, garmentTypeId);
  const mapped = preferred ? mapLayout(preferred) : null;
  return mapped ? { columnsPerRow: mapped.columnsPerRow, cells: mapped.cells } : undefined;
}

/**
 * Resolves the active global layout inside the order's tenant boundary.
 */
export async function getEffectiveProductionPrintLayoutForOrder(
  supabase: SupabaseClient,
  orderSection: GarmentSection | undefined,
  garmentTypeId: string | undefined,
  tenantId: string | undefined,
): Promise<ProductionPrintLayoutDefinition | undefined> {
  if (!orderSection || !tenantId) return undefined;
  let query = supabase.from("production_print_layouts").select(COLUMNS)
    .eq("tenant_id", tenantId).eq("is_global", true).eq("is_active", true).eq("order_section", orderSection);
  if (garmentTypeId) query = query.or(`garment_type_id.eq.${garmentTypeId},garment_type_id.is.null`);
  else query = query.is("garment_type_id", null);
  const result = await query.order("garment_type_id", { ascending: false, nullsFirst: false });
  let data: unknown = result.data;
  let error = result.error;
  if (error && isMissingGlobalLayoutColumns(error)) {
    let legacy = supabase.from("production_print_layouts").select(LEGACY_COLUMNS).eq("tenant_id", tenantId).eq("order_section", orderSection);
    if (garmentTypeId) legacy = legacy.or(`garment_type_id.eq.${garmentTypeId},garment_type_id.is.null`);
    else legacy = legacy.is("garment_type_id", null);
    const legacyResult = await legacy.order("updated_at", { ascending: false });
    data = legacyResult.data;
    error = legacyResult.error;
    if (!error) {
      const legacyRows = (data as LayoutRow[] | null) ?? [];
      const updaterIds = Array.from(new Set(legacyRows.map((row) => row.updated_by).filter((id): id is string => !!id)));
      const { data: profiles, error: profileError } = updaterIds.length
        ? await supabase.from("profiles").select("id, role_id, roles(permissions)").in("id", updaterIds)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const allowed = new Set(((profiles as Array<{ id: string; role_id: string; roles?: { permissions?: string[] } | null }> | null) ?? [])
        .filter((profile) => profile.role_id === "role-admin" || profile.roles?.permissions?.includes("shops.viewAll"))
        .map((profile) => profile.id));
      data = legacyRows.filter((row) => !!row.updated_by && allowed.has(row.updated_by));
    }
  }
  if (error) {
    if (isMissingProductionPrintLayoutsSchema(error)) return undefined;
    throw error;
  }
  const preferred = preferredLayoutRow((data as LayoutRow[] | null) ?? [], garmentTypeId);
  const mapped = preferred ? mapLayout(preferred) : null;
  return mapped ? { columnsPerRow: mapped.columnsPerRow, cells: mapped.cells } : undefined;
}

export async function saveProductionPrintLayout(
  supabase: SupabaseClient,
  orderSection: GarmentSection,
  garmentTypeId: string | undefined,
  layout: ProductionPrintLayoutDefinition,
): Promise<void> {
  const normalized = normalizeProductionPrintLayout(layout);
  const { error } = await supabase.rpc("save_production_print_layout", {
    p_order_section: orderSection,
    p_garment_type_id: garmentTypeId ?? null,
    p_columns_per_row: normalized.columnsPerRow,
    p_cells: normalized.cells,
  });
  if (error) throw error;
}

export async function deleteProductionPrintLayout(
  supabase: SupabaseClient,
  orderSection: GarmentSection,
  garmentTypeId: string | undefined,
): Promise<void> {
  const { error } = await supabase.rpc("delete_production_print_layout", {
    p_order_section: orderSection,
    p_garment_type_id: garmentTypeId ?? null,
  });
  if (error) throw error;
}

export async function setProductionPrintLayoutActive(
  supabase: SupabaseClient,
  orderSection: GarmentSection,
  garmentTypeId: string | undefined,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_production_print_layout_active", {
    p_order_section: orderSection,
    p_garment_type_id: garmentTypeId ?? null,
    p_is_active: isActive,
  });
  if (error) throw error;
}
