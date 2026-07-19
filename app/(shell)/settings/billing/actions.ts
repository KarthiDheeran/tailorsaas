"use server";

import {
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  getShopBillingSettings,
  isMissingShopBillingSettingsSchemaError,
  upsertShopBillingSettings,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import { recomputeAllOrderTotals } from "@/lib/data/order-totals-db";
import { hasAnyPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getBillingSettingsAction(): Promise<{
  settings: ShopBillingSettings;
  enabled: boolean;
}> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.view");
  if (!guard.ok) return { settings: DEFAULT_SHOP_BILLING_SETTINGS, enabled: false };

  try {
    return {
      settings: await getShopBillingSettings(supabase, { allowLegacy: false }),
      enabled: true,
    };
  } catch (error) {
    if (isMissingShopBillingSettingsSchemaError(error)) {
      return { settings: DEFAULT_SHOP_BILLING_SETTINGS, enabled: false };
    }
    throw error;
  }
}

export async function getPrintableBillingSettingsAction(): Promise<ShopBillingSettings> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (
    !hasAnyPermission(permissions, [
      "orders.printCustomerReceipt",
      "orders.printJobCard",
      "customers.viewMeasurements",
    ])
  ) {
    return DEFAULT_SHOP_BILLING_SETTINGS;
  }

  try {
    return await getShopBillingSettings(supabase);
  } catch (error) {
    if (isMissingShopBillingSettingsSchemaError(error)) {
      return DEFAULT_SHOP_BILLING_SETTINGS;
    }
    throw error;
  }
}

export async function getOrderPricingBillingSettingsAction(): Promise<ShopBillingSettings> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (
    !hasAnyPermission(permissions, [
      "orders.create",
      "orders.edit",
      "orders.viewPayments",
      "orders.recordPayment",
    ])
  ) {
    return DEFAULT_SHOP_BILLING_SETTINGS;
  }

  try {
    return await getShopBillingSettings(supabase);
  } catch (error) {
    if (isMissingShopBillingSettingsSchemaError(error)) {
      return DEFAULT_SHOP_BILLING_SETTINGS;
    }
    throw error;
  }
}

export async function saveBillingSettingsAction(
  input: ShopBillingSettings
): Promise<ActionResult<ShopBillingSettings>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageShop");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateBillingSettings(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const settings = await upsertShopBillingSettings(supabase, input);
    await recomputeAllOrderTotals(createAdminClient());
    return { success: true, data: settings };
  } catch (error) {
    if (isMissingShopBillingSettingsSchemaError(error)) {
      return {
        success: false,
        error: "Billing settings are not enabled in this database yet.",
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save billing settings.",
    };
  }
}

function validateBillingSettings(input: ShopBillingSettings): string | null {
  if (!input.shopName.trim()) return "Shop name is required.";
  if (!input.receiptPrefix.trim()) return "Receipt prefix is required.";
  if (!input.invoicePrefix.trim()) return "Invoice prefix is required.";
  if (!Number.isInteger(input.nextInvoiceSequence) || input.nextInvoiceSequence < 1) {
    return "Next invoice number must be 1 or higher.";
  }
  if (!Number.isInteger(input.invoiceSequenceYear) || input.invoiceSequenceYear < 2000) {
    return "Invoice year is invalid.";
  }
  if (!input.taxLabel.trim()) return "Tax label is required.";
  if (input.taxRatePercent < 0 || input.taxRatePercent > 100) {
    return "Tax rate must be between 0 and 100.";
  }
  if (!input.footerNote.trim()) return "Footer note is required.";
  if (input.email?.trim() && !input.email.includes("@")) return "Enter a valid email address.";
  return null;
}
