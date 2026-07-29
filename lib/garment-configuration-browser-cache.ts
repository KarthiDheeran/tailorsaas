import type { GarmentTypeConfiguration } from "@/lib/catalog";

const CACHE_KEY = "newlook:garment-configurations:v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedConfigurations = {
  savedAt: number;
  configurations: GarmentTypeConfiguration[];
};

export function readGarmentConfigurationCache(): GarmentTypeConfiguration[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedConfigurations;
    if (
      !Array.isArray(cached.configurations) ||
      typeof cached.savedAt !== "number" ||
      Date.now() - cached.savedAt > CACHE_TTL_MS
    ) {
      return null;
    }
    return cached.configurations;
  } catch {
    return null;
  }
}

export function writeGarmentConfigurationCache(
  configurations: GarmentTypeConfiguration[]
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedConfigurations = { savedAt: Date.now(), configurations };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be disabled; the page still uses the in-memory configuration.
  }
}
