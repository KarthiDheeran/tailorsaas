import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Customer,
  CustomerMeasurements,
  Gender,
  GarmentMeasurement,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase 6A: real, Supabase-backed replacements for the 12 customer/
// measurement functions in lib/data/stub-data.ts — same names/shapes, each
// now taking an already-constructed Supabase client as the first parameter
// (same pattern as lib/profiles.ts/lib/roles.ts) so the same code could run
// client- or server-side; in practice only app/(shell)/customers/actions.ts
// calls these today, always with the server client.
//
// lib/data/stub-data.ts itself is left completely untouched — its own
// createOrder() still calls the OLD synchronous getCustomerById() to build
// customerSnapshot, and Orders isn't migrating until Phase 6C. This file is
// a deliberate fork, not a replacement, until that happens.
//
// DB rows are snake_case; the domain types (lib/types.ts) are camelCase —
// each function maps explicitly at the boundary rather than leaking raw rows.
// ---------------------------------------------------------------------------

const CUSTOMER_COLUMNS =
  "id, customer_number, name, phone, address, area, gender";

interface CustomerRow {
  id: string;
  customer_number: string;
  name: string;
  phone: string;
  address: string;
  area: string;
  gender: Gender | null;
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    customerNumber: row.customer_number,
    name: row.name,
    phone: row.phone,
    address: row.address,
    area: row.area,
    gender: row.gender ?? undefined,
  };
}

export async function getCustomers(supabase: SupabaseClient): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .order("name");
  if (error) throw error;
  return ((data as CustomerRow[]) ?? []).map(mapCustomer);
}

export async function getCustomerById(
  supabase: SupabaseClient,
  id: string
): Promise<Customer | undefined> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCustomer(data as CustomerRow) : undefined;
}

// Matches by name or phone — used by the Orders page's main search box.
export async function searchCustomers(
  supabase: SupabaseClient,
  query: string
): Promise<Customer[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("name");
  if (error) throw error;
  return ((data as CustomerRow[]) ?? []).map(mapCustomer);
}

// Phone-only lookup for the New Order flow's phone-first customer entry.
export async function searchCustomersByPhone(
  supabase: SupabaseClient,
  query: string
): Promise<Customer[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .ilike("phone", `%${q}%`)
    .order("name");
  if (error) throw error;
  return ((data as CustomerRow[]) ?? []).map(mapCustomer);
}

// Exact-phone lookup for the Add/Edit Customer form's duplicate-phone guard.
export async function getCustomerByPhone(
  supabase: SupabaseClient,
  phone: string
): Promise<Customer | undefined> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCustomer(data as CustomerRow) : undefined;
}

export async function createCustomer(
  supabase: SupabaseClient,
  data: {
    name: string;
    phone: string;
    address: string;
    area: string;
    gender?: Gender;
  }
): Promise<Customer> {
  // customer_number_seq (uniqueness) + generate_customer_number() (display
  // format, "CUST-0001") both live in the DB migration — this is the one
  // place in TS that calls it, per the "exactly one helper" instruction.
  const { data: numberResult, error: numberError } = await supabase.rpc(
    "generate_customer_number"
  );
  if (numberError) throw numberError;

  const { data: row, error } = await supabase
    .from("customers")
    .insert({
      customer_number: numberResult as string,
      name: data.name,
      phone: data.phone,
      address: data.address,
      area: data.area,
      gender: data.gender ?? null,
    })
    .select(CUSTOMER_COLUMNS)
    .single();
  if (error) throw error;
  return mapCustomer(row as CustomerRow);
}

export async function updateCustomer(
  supabase: SupabaseClient,
  id: string,
  data: {
    name: string;
    phone: string;
    address: string;
    area: string;
    gender?: Gender;
  }
): Promise<Customer | undefined> {
  const { data: row, error } = await supabase
    .from("customers")
    .update({
      name: data.name,
      phone: data.phone,
      address: data.address,
      area: data.area,
      gender: data.gender ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(CUSTOMER_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapCustomer(row as CustomerRow) : undefined;
}

const CUSTOMER_MEASUREMENTS_COLUMNS = "customer_id, values, notes, updated_at";

interface CustomerMeasurementsRow {
  customer_id: string;
  values: Record<string, string>;
  notes: string | null;
  updated_at: string;
}

function mapCustomerMeasurements(row: CustomerMeasurementsRow): CustomerMeasurements {
  return {
    customerId: row.customer_id,
    values: row.values ?? {},
    notes: row.notes ?? undefined,
    updatedAt: row.updated_at.slice(0, 10),
  };
}

export async function getCustomerMeasurements(
  supabase: SupabaseClient,
  customerId: string
): Promise<CustomerMeasurements | undefined> {
  const { data, error } = await supabase
    .from("customer_measurements")
    .select(CUSTOMER_MEASUREMENTS_COLUMNS)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCustomerMeasurements(data as CustomerMeasurementsRow) : undefined;
}

// Merge-upsert by customer_id — the DB's jsonb `||` operator is the exact
// equivalent of the mock's `{...existing.values, ...data.values}` spread, so
// an untouched field on a previous save is never clobbered by a partial one.
export async function saveCustomerMeasurements(
  supabase: SupabaseClient,
  data: {
    customerId: string;
    values: Record<string, string>;
    notes?: string;
  }
): Promise<CustomerMeasurements> {
  const { data: existing } = await supabase
    .from("customer_measurements")
    .select(CUSTOMER_MEASUREMENTS_COLUMNS)
    .eq("customer_id", data.customerId)
    .maybeSingle();

  const mergedValues = { ...(existing?.values ?? {}), ...data.values };
  const notes = data.notes ?? existing?.notes ?? null;

  const { data: row, error } = await supabase
    .from("customer_measurements")
    .upsert(
      {
        customer_id: data.customerId,
        values: mergedValues,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_id" }
    )
    .select(CUSTOMER_MEASUREMENTS_COLUMNS)
    .single();
  if (error) throw error;
  return mapCustomerMeasurements(row as CustomerMeasurementsRow);
}

const GARMENT_MEASUREMENTS_COLUMNS =
  "id, customer_id, garment_type, values, fit_notes, notes, updated_at";

interface GarmentMeasurementRow {
  id: string;
  customer_id: string;
  garment_type: string;
  values: Record<string, string>;
  fit_notes: string | null;
  notes: string | null;
  updated_at: string;
}

function mapGarmentMeasurement(row: GarmentMeasurementRow): GarmentMeasurement {
  return {
    customerId: row.customer_id,
    garmentType: row.garment_type,
    values: row.values ?? {},
    fitNotes: row.fit_notes ?? undefined,
    notes: row.notes ?? undefined,
    updatedAt: row.updated_at.slice(0, 10),
  };
}

// Normalizes the lookup key exactly like the DB's generated
// garment_type_key column (lower(trim(...))) — the two must match.
function garmentTypeKey(garmentType: string): string {
  return garmentType.trim().toLowerCase();
}

export async function getGarmentMeasurement(
  supabase: SupabaseClient,
  customerId: string,
  garmentType: string
): Promise<GarmentMeasurement | undefined> {
  const { data, error } = await supabase
    .from("garment_measurements")
    .select(GARMENT_MEASUREMENTS_COLUMNS)
    .eq("customer_id", customerId)
    .eq("garment_type_key", garmentTypeKey(garmentType))
    .maybeSingle();
  if (error) throw error;
  return data ? mapGarmentMeasurement(data as GarmentMeasurementRow) : undefined;
}

export async function getGarmentMeasurementsForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<GarmentMeasurement[]> {
  const { data, error } = await supabase
    .from("garment_measurements")
    .select(GARMENT_MEASUREMENTS_COLUMNS)
    .eq("customer_id", customerId);
  if (error) throw error;
  return ((data as GarmentMeasurementRow[]) ?? []).map(mapGarmentMeasurement);
}

export async function getGarmentMeasurementDraftSeed(
  supabase: SupabaseClient,
  customerId: string,
  garmentType: string
): Promise<{ values: Record<string, string>; fitNotes: string; notes: string }> {
  const base = (await getCustomerMeasurements(supabase, customerId))?.values ?? {};
  const persisted = await getGarmentMeasurement(supabase, customerId, garmentType);
  return {
    values: { ...base, ...(persisted?.values ?? {}) },
    fitNotes: persisted?.fitNotes ?? "",
    notes: persisted?.notes ?? "",
  };
}

// Full replace on conflict (not a merge) — matches the mock's
// saveGarmentMeasurement exactly. onConflict targets the stored generated
// column directly (customer_id, garment_type_key), not an expression, so
// Supabase's upsert can resolve it as a real unique constraint.
export async function saveGarmentMeasurement(
  supabase: SupabaseClient,
  data: {
    customerId: string;
    garmentType: string;
    values: Record<string, string>;
    fitNotes?: string;
    notes?: string;
  }
): Promise<GarmentMeasurement> {
  const { data: row, error } = await supabase
    .from("garment_measurements")
    .upsert(
      {
        customer_id: data.customerId,
        garment_type: data.garmentType,
        values: data.values,
        fit_notes: data.fitNotes ?? null,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_id,garment_type_key" }
    )
    .select(GARMENT_MEASUREMENTS_COLUMNS)
    .single();
  if (error) throw error;
  return mapGarmentMeasurement(row as GarmentMeasurementRow);
}
