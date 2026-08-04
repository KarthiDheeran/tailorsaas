import type { CatalogAddOn, CatalogGarmentType, GarmentTypeConfiguration } from "@/lib/catalog";
import type { ShopBillingSettings } from "@/lib/data/shop-billing-settings-db";
import type { ShopOrderPreferences } from "@/lib/data/shop-order-preferences-db";
import type { CustomerDetail } from "@/lib/customers-db";
import type { Customer } from "@/lib/types";

type CacheEntry<T> = {
  savedAt: number;
  value: T;
};

export type NewOrderCatalogReference = {
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  configurations: GarmentTypeConfiguration[];
};

export type NewOrderOperatorStaff = {
  id: string;
  name: string;
  staff_number: string;
  staff_code?: number;
}[];

export type NewOrderTodayItemSummary = {
  garment: string;
  qty: number;
}[];

const CACHE_PREFIX = "newlook:new-order";
const CATALOG_TTL_MS = 10 * 60 * 1000;
const SETTINGS_TTL_MS = 5 * 60 * 1000;
const CUSTOMER_TTL_MS = 10 * 60 * 1000;
const STAFF_TTL_MS = 10 * 60 * 1000;
const TODAY_SUMMARY_TTL_MS = 2 * 60 * 1000;
const CUSTOMER_DETAIL_TTL_MS = 2 * 60 * 1000;

function key(scopeId: string, name: string) {
  return `${CACHE_PREFIX}:${scopeId}:${name}:v1`;
}

function read<T>(scopeId: string | undefined, name: string, ttlMs: number): T | null {
  if (!scopeId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(scopeId, name));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (typeof entry.savedAt !== "number" || Date.now() - entry.savedAt > ttlMs) {
      window.sessionStorage.removeItem(key(scopeId, name));
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

function write<T>(scopeId: string | undefined, name: string, value: T) {
  if (!scopeId || typeof window === "undefined") return;
  try {
    const entry: CacheEntry<T> = { savedAt: Date.now(), value };
    window.sessionStorage.setItem(key(scopeId, name), JSON.stringify(entry));
  } catch {
    // Session storage is an optional speed optimization. Order entry continues
    // with live Server Action results when storage is unavailable.
  }
}

function clear(scopeId: string | undefined, name: string) {
  if (!scopeId || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key(scopeId, name));
  } catch {
    // Nothing to do when session storage is unavailable.
  }
}

export function readNewOrderCatalogReference(scopeId: string | undefined) {
  return read<NewOrderCatalogReference>(scopeId, "catalog", CATALOG_TTL_MS);
}

export function writeNewOrderCatalogReference(
  scopeId: string | undefined,
  value: NewOrderCatalogReference
) {
  write(scopeId, "catalog", value);
}

export function clearNewOrderCatalogReference(scopeId?: string) {
  clear(scopeId, "catalog");
}

export function readNewOrderBillingSettings(scopeId: string | undefined) {
  return read<ShopBillingSettings>(scopeId, "billing-settings", SETTINGS_TTL_MS);
}

export function writeNewOrderBillingSettings(
  scopeId: string | undefined,
  value: ShopBillingSettings
) {
  write(scopeId, "billing-settings", value);
}

export function clearNewOrderBillingSettings(scopeId?: string) {
  clear(scopeId, "billing-settings");
}

export function readNewOrderPreferences(scopeId: string | undefined) {
  return read<ShopOrderPreferences>(scopeId, "order-preferences", SETTINGS_TTL_MS);
}

export function writeNewOrderPreferences(
  scopeId: string | undefined,
  value: ShopOrderPreferences
) {
  write(scopeId, "order-preferences", value);
}

export function clearNewOrderPreferences(scopeId?: string) {
  clear(scopeId, "order-preferences");
}

export function readNewOrderCustomers(scopeId: string | undefined) {
  return read<Customer[]>(scopeId, "customers", CUSTOMER_TTL_MS);
}

export function writeNewOrderCustomers(scopeId: string | undefined, customers: Customer[]) {
  write(scopeId, "customers", customers);
}

export function upsertNewOrderCustomer(scopeId: string | undefined, customer: Customer) {
  const current = readNewOrderCustomers(scopeId) ?? [];
  writeNewOrderCustomers(scopeId, [
    customer,
    ...current.filter((candidate) => candidate.id !== customer.id),
  ]);
}

export function clearNewOrderCustomers(scopeId?: string) {
  clear(scopeId, "customers");
}

export function readNewOrderOperatorStaff(scopeId: string | undefined) {
  return read<NewOrderOperatorStaff>(scopeId, "operator-staff", STAFF_TTL_MS);
}

export function writeNewOrderOperatorStaff(
  scopeId: string | undefined,
  staff: NewOrderOperatorStaff
) {
  write(scopeId, "operator-staff", staff);
}

export function clearNewOrderOperatorStaff(scopeId?: string) {
  clear(scopeId, "operator-staff");
}

function todaySummaryCacheName(todayIso: string) {
  return `today-summary:${todayIso}`;
}

export function readNewOrderTodayItemSummary(
  scopeId: string | undefined,
  todayIso: string
) {
  return read<NewOrderTodayItemSummary>(
    scopeId,
    todaySummaryCacheName(todayIso),
    TODAY_SUMMARY_TTL_MS
  );
}

export function writeNewOrderTodayItemSummary(
  scopeId: string | undefined,
  todayIso: string,
  summary: NewOrderTodayItemSummary
) {
  write(scopeId, todaySummaryCacheName(todayIso), summary);
}

function customerDetailCacheName(customerId: string) {
  return `customer-detail:${customerId}`;
}

export function readNewOrderCustomerDetail(
  scopeId: string | undefined,
  customerId: string
) {
  return read<CustomerDetail>(
    scopeId,
    customerDetailCacheName(customerId),
    CUSTOMER_DETAIL_TTL_MS
  );
}

export function writeNewOrderCustomerDetail(
  scopeId: string | undefined,
  customerId: string,
  detail: CustomerDetail
) {
  write(scopeId, customerDetailCacheName(customerId), detail);
}
