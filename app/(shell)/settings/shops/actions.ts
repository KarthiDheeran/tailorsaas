"use server";

import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { isGarmentSection, type GarmentSection } from "@/lib/catalog";
import {
  createShop,
  getShops,
  updateShop,
  type Shop,
  type ShopInput,
} from "@/lib/shops";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function normalizeSections(value: GarmentSection[]): GarmentSection[] {
  return Array.from(new Set(value.filter(isGarmentSection)));
}

function validateShopInput(input: ShopInput): string | null {
  if (!input.name.trim()) return "Shop name is required.";
  const sections = normalizeSections(input.allowedOrderSections);
  if (sections.length === 0) return "Choose at least one order section.";
  if (sections.length !== input.allowedOrderSections.length) return "Choose valid order sections.";
  return null;
}

export async function getShopsAction(): Promise<Shop[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.view");
  if (!guard.ok) return [];
  return getShops(supabase);
}

export async function createShopAction(input: ShopInput): Promise<ActionResult<Shop>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageShop");
  if (!guard.ok) return { success: false, error: guard.error };
  const normalized = {
    ...input,
    allowedOrderSections: normalizeSections(input.allowedOrderSections),
  };
  const error = validateShopInput(normalized);
  if (error) return { success: false, error };
  const shop = await createShop(supabase, normalized);
  return { success: true, data: shop };
}

export async function updateShopAction(
  id: string,
  input: ShopInput
): Promise<ActionResult<Shop>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageShop");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!id) return { success: false, error: "Shop is required." };
  const normalized = {
    ...input,
    allowedOrderSections: normalizeSections(input.allowedOrderSections),
  };
  const error = validateShopInput(normalized);
  if (error) return { success: false, error };
  if (normalized.active === false && normalized.name.trim().toLowerCase() === "main shop") {
    return { success: false, error: "Main Shop cannot be deactivated until another default shop is chosen." };
  }
  const shop = await updateShop(supabase, id, normalized);
  return shop ? { success: true, data: shop } : { success: false, error: "Shop not found." };
}
