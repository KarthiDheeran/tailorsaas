import type { SupabaseClient } from "@supabase/supabase-js";

export interface ShopBillingSettings {
  shopName: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  receiptPrefix: string;
  invoicePrefix: string;
  nextInvoiceSequence: number;
  invoiceSequenceYear: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRatePercent: number;
  pricesIncludeTax: boolean;
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
  invoice_prefix?: string | null;
  next_invoice_sequence?: number | null;
  invoice_sequence_year?: number | null;
  tax_enabled?: boolean | null;
  tax_label?: string | null;
  tax_rate_percent?: number | null;
  prices_include_tax?: boolean | null;
  footer_note: string;
}

const SETTINGS_COLUMNS =
  "shop_name,tagline,phone,email,address,gstin,receipt_prefix,invoice_prefix,next_invoice_sequence,invoice_sequence_year,tax_enabled,tax_label,tax_rate_percent,prices_include_tax,footer_note";

const LEGACY_SETTINGS_COLUMNS =
  "shop_name,tagline,phone,email,address,gstin,receipt_prefix,footer_note";

export const DEFAULT_SHOP_BILLING_SETTINGS: ShopBillingSettings = {
  shopName: "TailorSaaS",
  tagline: "Tailoring. Simplified.",
  receiptPrefix: "INV",
  invoicePrefix: "INV",
  nextInvoiceSequence: 1,
  invoiceSequenceYear: new Date().getFullYear(),
  taxEnabled: false,
  taxLabel: "GST",
  taxRatePercent: 0,
  pricesIncludeTax: true,
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

function isMissingInvoiceBillingSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    candidate.code === "PGRST204" ||
    message.includes("invoice_prefix") ||
    message.includes("tax_enabled") ||
    message.includes("tax_rate_percent")
  );
}

export async function getShopBillingSettings(
  supabase: SupabaseClient,
  options: { allowLegacy?: boolean } = {}
): Promise<ShopBillingSettings> {
  let { data, error } = await supabase
    .from("shop_billing_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", true)
    .maybeSingle();
  if (error && isMissingInvoiceBillingSchemaError(error)) {
    if (options.allowLegacy === false) {
      throw error;
    } else {
      const fallback = await supabase
        .from("shop_billing_settings")
        .select(LEGACY_SETTINGS_COLUMNS)
        .eq("id", true)
        .maybeSingle();
      data = fallback.data as unknown as typeof data;
      error = fallback.error;
    }
  }
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
      invoice_prefix: settings.invoicePrefix.trim(),
      next_invoice_sequence: settings.nextInvoiceSequence,
      invoice_sequence_year: settings.invoiceSequenceYear,
      tax_enabled: settings.taxEnabled,
      tax_label: settings.taxLabel.trim(),
      tax_rate_percent: settings.taxRatePercent,
      prices_include_tax: settings.pricesIncludeTax,
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
    invoicePrefix: row.invoice_prefix ?? row.receipt_prefix,
    nextInvoiceSequence:
      row.next_invoice_sequence ?? DEFAULT_SHOP_BILLING_SETTINGS.nextInvoiceSequence,
    invoiceSequenceYear:
      row.invoice_sequence_year ?? DEFAULT_SHOP_BILLING_SETTINGS.invoiceSequenceYear,
    taxEnabled: row.tax_enabled ?? DEFAULT_SHOP_BILLING_SETTINGS.taxEnabled,
    taxLabel: row.tax_label ?? DEFAULT_SHOP_BILLING_SETTINGS.taxLabel,
    taxRatePercent:
      row.tax_rate_percent ?? DEFAULT_SHOP_BILLING_SETTINGS.taxRatePercent,
    pricesIncludeTax:
      row.prices_include_tax ?? DEFAULT_SHOP_BILLING_SETTINGS.pricesIncludeTax,
    footerNote: row.footer_note,
  };
}
