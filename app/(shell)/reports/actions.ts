"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getCustomerAreas } from "@/lib/customers-db";
import { getStaffOptions, type StaffOption } from "@/lib/data/staff-db";
import {
  getCustomersReport,
  getExpensesTotal,
  getGarmentTypes,
  getInventoryReport,
  getOrdersReport,
  getPaymentsReport,
  getProductionReport,
  getSalesReport,
  getStaffReport,
  type CustomersReport,
  type CustomersReportFilters,
  type DateRange,
  type InventoryReport,
  type InventoryReportFilters,
  type OrdersFilters,
  type OrdersReport,
  type PaymentsFilters,
  type PaymentsReport,
  type ProductionFilters,
  type ProductionReport,
  type SalesReport,
  type StaffReport,
  type StaffReportFilters,
} from "@/lib/reports";
import type { PaymentMode } from "@/lib/types";

// Report reads retain the caller's RLS scope; financial actions also check payment access.

async function requireReportsView(financial = false): Promise<
  { ok: true; client: SupabaseClient } | { ok: false; error: string }
> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "reports.view");
  if (!guard.ok) return { ok: false, error: guard.error };
  if (financial) {
    const moneyGuard = await requireServerPermission(supabase, "orders.viewPayments");
    if (!moneyGuard.ok) return { ok: false, error: moneyGuard.error };
  }
  return { ok: true, client: supabase };
}

export async function getSalesReportAction(
  range: DateRange,
  paymentMode?: PaymentMode
): Promise<SalesReport | null> {
  const guard = await requireReportsView(true);
  if (!guard.ok) return null;
  return getSalesReport(guard.client, range, paymentMode);
}

export async function getPaymentsReportAction(
  filters: PaymentsFilters,
  todayIso: string
): Promise<PaymentsReport | null> {
  const guard = await requireReportsView(true);
  if (!guard.ok) return null;
  return getPaymentsReport(guard.client, filters, todayIso);
}

export async function getOrdersReportAction(
  filters: OrdersFilters,
  todayIso: string
): Promise<OrdersReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getOrdersReport(guard.client, filters, todayIso);
}

// Distinct garment names actually used across placed orders — not to be
// confused with the Catalog module's own getGarmentTypesAction, which
// returns the full configured CatalogGarmentType[] list; these are
// different things (see lib/reports.ts's getGarmentTypes).
export async function getReportGarmentTypesAction(): Promise<string[]> {
  const guard = await requireReportsView();
  if (!guard.ok) return [];
  return getGarmentTypes(guard.client);
}

export async function getCustomersReportAction(
  filters: CustomersReportFilters,
  todayIso: string
): Promise<CustomersReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getCustomersReport(guard.client, filters, todayIso);
}

// Distinct customer areas for the Customers tab's Area filter — reuses
// lib/data/customers-db.ts directly (caller-scoped client), not the Customers
// module's own getCustomerAreasAction, per the file header note above.
export async function getReportCustomerAreasAction(): Promise<string[]> {
  const guard = await requireReportsView();
  if (!guard.ok) return [];
  return getCustomerAreas(guard.client);
}

// Expenses total for the Payments tab's "Profit" stat — see
// lib/reports.ts#getExpensesTotal for why this stays a single number
// instead of a full report.
export async function getReportExpensesTotalAction(
  range: DateRange
): Promise<number | null> {
  const guard = await requireReportsView(true);
  if (!guard.ok) return null;
  return getExpensesTotal(guard.client, range);
}

export async function getProductionReportAction(
  filters: ProductionFilters,
  todayIso: string
): Promise<ProductionReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getProductionReport(guard.client, filters, todayIso);
}

export async function getStaffReportAction(
  filters: StaffReportFilters,
  todayIso: string
): Promise<StaffReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getStaffReport(guard.client, filters, todayIso);
}

export async function getInventoryReportAction(
  filters: InventoryReportFilters
): Promise<InventoryReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getInventoryReport(guard.client, filters);
}

// Staff roster for the Production tab's Staff filter dropdown — reuses
// lib/data/staff-db.ts directly (caller-scoped client), same lib-to-lib-only
// pattern as getReportCustomerAreasAction above, not
// app/(shell)/staff/actions.ts's own getStaffAction (gated on staff.view
// separately).
export async function getReportStaffListAction(): Promise<StaffOption[]> {
  const guard = await requireReportsView();
  if (!guard.ok) return [];
  return getStaffOptions(guard.client);
}
