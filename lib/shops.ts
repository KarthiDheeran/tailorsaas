import type { SupabaseClient } from "@supabase/supabase-js";
import type { GarmentSection } from "@/lib/catalog";

export interface Shop {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  allowedOrderSections: GarmentSection[];
  active: boolean;
}

export interface ShopInput {
  name: string;
  location: string;
  allowedOrderSections: GarmentSection[];
  active: boolean;
}

const SHOP_COLUMNS = "id, tenant_id, name, location, allowed_order_sections, active";

interface ShopRow {
  id: string;
  tenant_id: string;
  name: string;
  location: string | null;
  allowed_order_sections: GarmentSection[] | null;
  active: boolean;
}

function mapShop(row: ShopRow): Shop {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    location: row.location ?? "",
    allowedOrderSections: row.allowed_order_sections ?? [],
    active: row.active,
  };
}

export async function getShops(supabase: SupabaseClient): Promise<Shop[]> {
  const { data, error } = await supabase
    .from("shops")
    .select(SHOP_COLUMNS)
    .order("name");
  if (error) throw error;
  return ((data as ShopRow[]) ?? []).map(mapShop);
}

export async function createShop(
  supabase: SupabaseClient,
  input: ShopInput
): Promise<Shop> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (profileError) throw profileError;
  const tenantId = (profile?.tenant_id as string | null) ?? null;
  if (!tenantId) throw new Error("Current user is not assigned to a tenant.");

  const { data, error } = await supabase
    .from("shops")
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      location: input.location.trim(),
      allowed_order_sections: input.allowedOrderSections,
      active: input.active,
    })
    .select(SHOP_COLUMNS)
    .single();
  if (error) throw error;
  return mapShop(data as ShopRow);
}

export async function updateShop(
  supabase: SupabaseClient,
  id: string,
  input: ShopInput
): Promise<Shop | undefined> {
  const { data, error } = await supabase
    .from("shops")
    .update({
      name: input.name.trim(),
      location: input.location.trim(),
      allowed_order_sections: input.allowedOrderSections,
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(SHOP_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapShop(data as ShopRow) : undefined;
}
