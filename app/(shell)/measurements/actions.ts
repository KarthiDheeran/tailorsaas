"use server";

import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  getAllCustomerMeasurements,
  getAllGarmentMeasurements,
  getCustomers,
} from "@/lib/data/customers-db";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Customer, CustomerMeasurements, GarmentMeasurement } from "@/lib/types";

export interface MeasurementDeskRow {
  customer: Customer;
  baseline?: CustomerMeasurements;
  garments: GarmentMeasurement[];
}

export async function getMeasurementDeskRowsAction(): Promise<MeasurementDeskRow[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "customers.viewMeasurements");
  if (!guard.ok) return [];

  const [customers, baselines, garments] = await Promise.all([
    getCustomers(supabase),
    getAllCustomerMeasurements(supabase),
    getAllGarmentMeasurements(supabase),
  ]);
  const baselineByCustomer = new Map(
    baselines.map((measurement) => [measurement.customerId, measurement])
  );
  const garmentsByCustomer = new Map<string, GarmentMeasurement[]>();
  for (const garment of garments) {
    const list = garmentsByCustomer.get(garment.customerId) ?? [];
    list.push(garment);
    garmentsByCustomer.set(garment.customerId, list);
  }

  return customers
    .map((customer) => ({
      customer,
      baseline: baselineByCustomer.get(customer.id),
      garments: garmentsByCustomer.get(customer.id) ?? [],
    }))
    .filter((row) => row.baseline || row.garments.length > 0)
    .sort((a, b) => {
      const aDate = latestMeasurementDate(a);
      const bDate = latestMeasurementDate(b);
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return a.customer.name.localeCompare(b.customer.name);
    });
}

function latestMeasurementDate(row: {
  baseline?: CustomerMeasurements;
  garments: GarmentMeasurement[];
}) {
  return [row.baseline?.updatedAt, ...row.garments.map((garment) => garment.updatedAt)]
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
}
