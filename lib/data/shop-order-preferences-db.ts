import type { SupabaseClient } from "@supabase/supabase-js";

export interface ShopOrderPreferences {
  defaultDeliveryLeadDays: number;
}

const SETTINGS_COLUMNS = "default_delivery_lead_days";

export const DEFAULT_SHOP_ORDER_PREFERENCES: ShopOrderPreferences = {
  // Three weeks is a practical tailoring-shop default and keeps new orders
  // usable while the optional database migration is waiting to be applied.
  defaultDeliveryLeadDays: 21,
};

export function isMissingShopOrderPreferencesSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    candidate.code === "42P01" ||
    candidate.code === "PGRST204" ||
    candidate.code === "PGRST205" ||
    message.includes("shop_order_preferences")
  );
}

export async function getShopOrderPreferences(
  supabase: SupabaseClient
): Promise<ShopOrderPreferences> {
  const { data, error } = await supabase
    .from("shop_order_preferences")
    .select(SETTINGS_COLUMNS)
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;

  const days = Number((data as { default_delivery_lead_days?: number } | null)?.default_delivery_lead_days);
  return {
    defaultDeliveryLeadDays:
      Number.isInteger(days) && days >= 0 && days <= 365
        ? days
        : DEFAULT_SHOP_ORDER_PREFERENCES.defaultDeliveryLeadDays,
  };
}

export async function upsertShopOrderPreferences(
  supabase: SupabaseClient,
  preferences: ShopOrderPreferences
): Promise<ShopOrderPreferences> {
  const { data, error } = await supabase
    .from("shop_order_preferences")
    .upsert({
      id: true,
      default_delivery_lead_days: preferences.defaultDeliveryLeadDays,
      updated_at: new Date().toISOString(),
    })
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw error;
  return getShopOrderPreferencesFromRow(data as { default_delivery_lead_days?: number });
}

function getShopOrderPreferencesFromRow(row: { default_delivery_lead_days?: number }): ShopOrderPreferences {
  const days = Number(row.default_delivery_lead_days);
  return {
    defaultDeliveryLeadDays:
      Number.isInteger(days) && days >= 0 && days <= 365
        ? days
        : DEFAULT_SHOP_ORDER_PREFERENCES.defaultDeliveryLeadDays,
  };
}
