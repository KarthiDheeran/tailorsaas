"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  createCustomer,
  getCustomerById,
  getCustomerByPhone,
  getCustomerMeasurements,
  getCustomers,
  getGarmentMeasurement,
  getGarmentMeasurementDraftSeed,
  getGarmentMeasurementsForCustomer,
  saveCustomerMeasurements,
  saveGarmentMeasurement,
  searchCustomers,
  searchCustomersByPhone,
  updateCustomer,
} from "@/lib/data/customers-db";
import {
  getCustomerAreas,
  getCustomerDetail,
  getCustomerListRows,
  type CustomerDetail,
  type CustomerListRow,
} from "@/lib/customers-db";
import {
  getCustomerStatement,
  type CustomerStatement,
} from "@/lib/customer-statement";
import type {
  Customer,
  CustomerMeasurements,
  Gender,
  GarmentMeasurement,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase 6A: Customers, Customer Measurements, and Garment Measurements are
// now real, Supabase-backed tables (supabase/migrations/0004_customers.sql) —
// reads AND writes both go through lib/data/customers-db.ts/
// lib/customers-db.ts (Phase 5A's read-relocation pattern continues to pay
// off here: since every page already calls these Server Actions rather than
// importing mock functions directly, swapping what's inside each action
// needed zero page/component changes).
//
// lib/data/stub-data.ts and lib/customers.ts are deliberately left
// UNTOUCHED — lib/reports.ts/customers-report-view.tsx still import the
// latter directly (Reports migration is Phase 6E), and stub-data.ts's own
// createOrder() still calls the old synchronous getCustomerById() to build
// customerSnapshot (Orders migration is Phase 6C). lib/customers-db.ts is a
// parallel fork of the 3 derived selectors, not a replacement, until those
// phases land.
//
// Known, accepted, temporary limitation: getOrdersForCustomer (still
// imported from the old stub-data.ts inside lib/customers-db.ts) returns
// orders keyed by mock customerId — a newly-created real customer's order
// history will correctly show empty until Orders migrates in 6C. Reports/
// Dashboard are unaffected by this change (they never imported anything
// from this actions file).
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getCustomersAction(): Promise<Customer[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return getCustomers(supabase);
}

export async function getCustomerByIdAction(id: string): Promise<Customer | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return undefined;
  return getCustomerById(supabase, id);
}

export async function searchCustomersByPhoneAction(query: string): Promise<Customer[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return searchCustomersByPhone(supabase, query);
}

// Matches by name or phone — used by the Orders page's main search box
// (order-list-filters.tsx), distinct from searchCustomersByPhoneAction's
// phone-only match used by the New Order flow's Phone field.
export async function searchCustomersAction(query: string): Promise<Customer[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return searchCustomers(supabase, query);
}

export async function getCustomerByPhoneAction(phone: string): Promise<Customer | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return undefined;
  return getCustomerByPhone(supabase, phone);
}

export async function getCustomerListRowsAction(todayIso: string): Promise<CustomerListRow[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return getCustomerListRows(supabase, todayIso);
}

export async function getCustomerAreasAction(): Promise<string[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return [];
  return getCustomerAreas(supabase);
}

export async function getCustomerDetailAction(
  customerId: string
): Promise<CustomerDetail | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.view");
  if (!guard.ok) return undefined;
  const customer = await getCustomerById(supabase, customerId);
  if (!customer) return undefined;
  return getCustomerDetail(supabase, customer);
}

export async function getCustomerStatementAction(
  customerId: string
): Promise<CustomerStatement | undefined> {
  const supabase = createServerClient();
  const customerGuard = await requireServerPermission(supabase, "customers.view");
  if (!customerGuard.ok) return undefined;
  const paymentGuard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!paymentGuard.ok) return undefined;
  const customer = await getCustomerById(supabase, customerId);
  if (!customer) return undefined;
  return getCustomerStatement(supabase, customer);
}

export interface CustomerFormData {
  name: string;
  phone: string;
  address: string;
  area: string;
  gender?: Gender;
}

export async function createCustomerAction(
  data: CustomerFormData
): Promise<ActionResult<Customer>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.create");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!data.name.trim()) return { success: false, error: "Name is required." };
  if (!data.phone.trim()) return { success: false, error: "Phone is required." };
  const customer = await createCustomer(supabase, data);
  return { success: true, data: customer };
}

export async function updateCustomerAction(
  id: string,
  data: CustomerFormData
): Promise<ActionResult<Customer>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!data.name.trim()) return { success: false, error: "Name is required." };
  if (!data.phone.trim()) return { success: false, error: "Phone is required." };
  const customer = await updateCustomer(supabase, id, data);
  if (!customer) return { success: false, error: "Customer not found." };
  return { success: true, data: customer };
}

export async function getCustomerMeasurementsAction(
  customerId: string
): Promise<CustomerMeasurements | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return undefined;
  return getCustomerMeasurements(supabase, customerId);
}

export async function saveCustomerMeasurementsAction(data: {
  customerId: string;
  values: Record<string, string>;
  notes?: string;
}): Promise<ActionResult<CustomerMeasurements>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.editMeasurements");
  if (!guard.ok) return { success: false, error: guard.error };
  const record = await saveCustomerMeasurements(supabase, data);
  return { success: true, data: record };
}

export async function getGarmentMeasurementAction(
  customerId: string,
  garmentType: string
): Promise<GarmentMeasurement | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return undefined;
  return getGarmentMeasurement(supabase, customerId, garmentType);
}

export async function getGarmentMeasurementsForCustomerAction(
  customerId: string
): Promise<GarmentMeasurement[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return [];
  return getGarmentMeasurementsForCustomer(supabase, customerId);
}

export async function getGarmentMeasurementDraftSeedAction(
  customerId: string,
  garmentType: string
): Promise<{ values: Record<string, string>; fitNotes: string; notes: string }> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return { values: {}, fitNotes: "", notes: "" };
  return getGarmentMeasurementDraftSeed(supabase, customerId, garmentType);
}

export async function saveGarmentMeasurementAction(data: {
  customerId: string;
  garmentType: string;
  values: Record<string, string>;
  fitNotes?: string;
  notes?: string;
}): Promise<ActionResult<GarmentMeasurement>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.editMeasurements");
  if (!guard.ok) return { success: false, error: guard.error };
  const record = await saveGarmentMeasurement(supabase, data);
  return { success: true, data: record };
}
