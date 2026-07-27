"use server";

import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  DEFAULT_SHOP_ORDER_PREFERENCES,
  getShopOrderPreferences,
  isMissingShopOrderPreferencesSchemaError,
  upsertShopOrderPreferences,
  type ShopOrderPreferences,
} from "@/lib/data/shop-order-preferences-db";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function getOrderPreferencesAction(): Promise<{
  preferences: ShopOrderPreferences;
  enabled: boolean;
}> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.view");
  if (!guard.ok) return { preferences: DEFAULT_SHOP_ORDER_PREFERENCES, enabled: false };

  try {
    return { preferences: await getShopOrderPreferences(supabase), enabled: true };
  } catch (error) {
    if (isMissingShopOrderPreferencesSchemaError(error)) {
      return { preferences: DEFAULT_SHOP_ORDER_PREFERENCES, enabled: false };
    }
    throw error;
  }
}

export async function getNewOrderPreferencesAction(): Promise<ShopOrderPreferences> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.create");
  if (!guard.ok) return DEFAULT_SHOP_ORDER_PREFERENCES;

  try {
    return await getShopOrderPreferences(supabase);
  } catch (error) {
    if (isMissingShopOrderPreferencesSchemaError(error)) {
      return DEFAULT_SHOP_ORDER_PREFERENCES;
    }
    throw error;
  }
}

export async function saveOrderPreferencesAction(
  preferences: ShopOrderPreferences
): Promise<ActionResult<ShopOrderPreferences>> {
  if (!Number.isInteger(preferences.defaultDeliveryLeadDays) || preferences.defaultDeliveryLeadDays < 0 || preferences.defaultDeliveryLeadDays > 365) {
    return { success: false, error: "Default delivery time must be between 0 and 365 days." };
  }

  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageShop");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    return { success: true, data: await upsertShopOrderPreferences(supabase, preferences) };
  } catch (error) {
    if (isMissingShopOrderPreferencesSchemaError(error)) {
      return { success: false, error: "Order preferences are not enabled in this database yet." };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to save order preferences." };
  }
}
