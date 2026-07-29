import type { CatalogAddOn, CatalogGarmentType, GarmentTypeConfiguration } from "@/lib/catalog";
import type { ShopBillingSettings } from "@/lib/data/shop-billing-settings-db";
import type { ShopOrderPreferences } from "@/lib/data/shop-order-preferences-db";

type CacheEntry<T> = {
  savedAt: number;
  value: T;
};

export type NewOrderCatalogReference = {
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  configurations: GarmentTypeConfiguration[];
};

const CACHE_PREFIX = "newlook:new-order";
const CATALOG_TTL_MS = 10 * 60 * 1000;
const SETTINGS_TTL_MS = 5 * 60 * 1000;

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
