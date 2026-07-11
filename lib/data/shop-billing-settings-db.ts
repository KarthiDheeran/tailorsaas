import type { SupabaseClient } from "@supabase/supabase-js";

export interface ShopBillingSettings {
  shopName: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  receiptPrefix: string;
  footerNote: string;
}

interface ShopBillingSettingsRow {
  shop_name: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  receipt_prefix: string;
  footer_note: string;
}

const SETTINGS_COLUMNS =
  "shop_name,tagline,phone,email,address,gstin,receipt_prefix,footer_note";

export const DEFAULT_SHOP_BILLING_SETTINGS: ShopBillingSettings = {
  shopName: "TailorSaaS",
  tagline: "Tailoring. Simplified.",
  receiptPrefix: "INV",
  footerNote: "Please bring this receipt during pickup.",
};

export function isMissingShopBillingSettingsSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("shop_billing_settings")
  );
}

export async function getShopBillingSettings(
  supabase: SupabaseClient
): Promise<ShopBillingSettings> {
  const { data, error } = await supabase
    .from("shop_billing_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSettings(data as ShopBillingSettingsRow) : DEFAULT_SHOP_BILLING_SETTINGS;
}

export async function upsertShopBillingSettings(
  supabase: SupabaseClient,
  settings: ShopBillingSettings
): Promise<ShopBillingSettings> {
  const { data, error } = await supabase
    .from("shop_billing_settings")
    .upsert({
      id: true,
      shop_name: settings.shopName.trim(),
      tagline: settings.tagline?.trim() || null,
      phone: settings.phone?.trim() || null,
      email: settings.email?.trim() || null,
      address: settings.address?.trim() || null,
      gstin: settings.gstin?.trim() || null,
      receipt_prefix: settings.receiptPrefix.trim(),
      footer_note: settings.footerNote.trim(),
      updated_at: new Date().toISOString(),
    })
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw error;
  return mapSettings(data as ShopBillingSettingsRow);
}

function mapSettings(row: ShopBillingSettingsRow): ShopBillingSettings {
  return {
    shopName: row.shop_name,
    tagline: row.tagline ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    gstin: row.gstin ?? undefined,
    receiptPrefix: row.receipt_prefix,
    footerNote: row.footer_note,
  };
}
