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
import { isGarmentSection } from "@/lib/catalog";
import type { OrderNumberSequence } from "@/lib/order-numbering";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function getOrderNumberSequencesAction(): Promise<ActionResult<OrderNumberSequence[]>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.view");
  if (!guard.ok) return { success: false, error: guard.error };
  const { data, error } = await supabase.rpc("get_order_number_sequences");
  if (error) return { success: false, error: "Order numbering is unavailable. Apply the section/year numbering migration first." };
  return { success: true, data: data as OrderNumberSequence[] };
}

export async function resetOrderNumberSequenceAction(input: {
  section: string; expectedYear: number; newYear: number;
}): Promise<ActionResult<null>> {
  if (!isGarmentSection(input.section) || !Number.isInteger(input.expectedYear) ||
      !Number.isInteger(input.newYear) || input.newYear <= input.expectedYear || input.newYear > 9999) {
    return { success: false, error: "Choose a year later than the current numbering year." };
  }
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageShop");
  if (!guard.ok) return { success: false, error: guard.error };
  const { error } = await supabase.rpc("reset_order_number_sequence", {
    p_order_section: input.section, p_expected_year: input.expectedYear, p_new_year: input.newYear,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, data: null };
}

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
