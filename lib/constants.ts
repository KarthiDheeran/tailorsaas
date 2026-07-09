import type { OrderStatus, PaymentMode } from "@/lib/types";

// Fixed app-wide vocabulary — not shopkeeper-editable data, so these stay
// plain TS constants rather than database rows (same convention as
// lib/catalog.ts's measurementFields). Moved here from the now-deleted
// lib/data/stub-data.ts once every business-data consumer of that file
// finished migrating to real Supabase tables (Phase 6E).
export const orderStatuses: OrderStatus[] = [
  "In Progress",
  "Ready",
  "Delayed",
  "Delivered",
  "Cancelled",
];

export const paymentModes: PaymentMode[] = [
  "Cash",
  "GPay",
  "UPI",
  "Card",
  "Bank Transfer",
  "Cheque",
];
