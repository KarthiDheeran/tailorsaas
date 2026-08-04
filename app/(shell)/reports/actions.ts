"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

// ---------------------------------------------------------------------------
// Phase 6E: Reports' first-ever Server Action layer (previously every report
// view called lib/reports.ts directly, client-side, with zero permission
// check at all).
//
// Reports is a derived, read-only summary view: gated on reports.view only
// — a role with reports.view but not orders.view/customers.view (a
// perfectly legitimate custom-role combination via Users & Access) must
// still be able to generate every report. Each action here checks
// reports.view via the normal cookie-based client, then does its actual
// data reads with the admin client (bypassing orders/customers RLS) rather
// than requiring the caller to separately hold those permissions — see
// lib/supabase/admin.ts's comment. Every action still returns only the
// specific, already-shaped report object the view needs, never a raw
// Orders/Customers listing.
//
// lib-to-lib calls only: getCustomerAreas is imported directly from
// lib/customers-db.ts here, NOT from app/(shell)/customers/actions.ts's
// getCustomerAreasAction — that action is independently gated on
// customers.view, which would reintroduce exactly the accidental dependency
// this phase is removing.
// ---------------------------------------------------------------------------

async function requireReportsView(): Promise<
  { ok: true; admin: SupabaseClient } | { ok: false; error: string }
> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "reports.view");
  if (!guard.ok) return { ok: false, error: guard.error };
  return { ok: true, admin: createAdminClient() };
}

export async function getSalesReportAction(
  range: DateRange,
  paymentMode?: PaymentMode
): Promise<SalesReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getSalesReport(guard.admin, range, paymentMode);
}

export async function getPaymentsReportAction(
  filters: PaymentsFilters,
  todayIso: string
): Promise<PaymentsReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getPaymentsReport(guard.admin, filters, todayIso);
}

export async function getOrdersReportAction(
  filters: OrdersFilters,
  todayIso: string
): Promise<OrdersReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getOrdersReport(guard.admin, filters, todayIso);
}

// Distinct garment names actually used across placed orders — not to be
// confused with the Catalog module's own getGarmentTypesAction, which
// returns the full configured CatalogGarmentType[] list; these are
// different things (see lib/reports.ts's getGarmentTypes).
export async function getReportGarmentTypesAction(): Promise<string[]> {
  const guard = await requireReportsView();
  if (!guard.ok) return [];
  return getGarmentTypes(guard.admin);
}

export async function getCustomersReportAction(
  filters: CustomersReportFilters,
  todayIso: string
): Promise<CustomersReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getCustomersReport(guard.admin, filters, todayIso);
}

// Distinct customer areas for the Customers tab's Area filter — reuses
// lib/data/customers-db.ts directly (admin client), not the Customers
// module's own getCustomerAreasAction, per the file header note above.
export async function getReportCustomerAreasAction(): Promise<string[]> {
  const guard = await requireReportsView();
  if (!guard.ok) return [];
  return getCustomerAreas(guard.admin);
}

// Expenses total for the Payments tab's "Profit" stat — see
// lib/reports.ts#getExpensesTotal for why this stays a single number
// instead of a full report.
export async function getReportExpensesTotalAction(
  range: DateRange
): Promise<number | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getExpensesTotal(guard.admin, range);
}

export async function getProductionReportAction(
  filters: ProductionFilters,
  todayIso: string
): Promise<ProductionReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getProductionReport(guard.admin, filters, todayIso);
}

export async function getStaffReportAction(
  filters: StaffReportFilters,
  todayIso: string
): Promise<StaffReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getStaffReport(guard.admin, filters, todayIso);
}

export async function getInventoryReportAction(
  filters: InventoryReportFilters
): Promise<InventoryReport | null> {
  const guard = await requireReportsView();
  if (!guard.ok) return null;
  return getInventoryReport(guard.admin, filters);
}

// Staff roster for the Production tab's Staff filter dropdown — reuses
// lib/data/staff-db.ts directly (admin client), same lib-to-lib-only
// pattern as getReportCustomerAreasAction above, not
// app/(shell)/staff/actions.ts's own getStaffAction (gated on staff.view
// separately).
export async function getReportStaffListAction(): Promise<StaffOption[]> {
  const guard = await requireReportsView();
  if (!guard.ok) return [];
  return getStaffOptions(guard.admin);
}
