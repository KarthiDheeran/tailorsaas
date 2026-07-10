import type {
  CustomerFabricStatus,
  ExpenseCategory,
  InventoryItemType,
  InventoryMovementType,
  InventoryUnit,
  OrderStatus,
  PaymentMode,
} from "@/lib/types";

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

export const expenseCategories: ExpenseCategory[] = [
  "Fabric",
  "Accessories",
  "Salary",
  "Rent",
  "Utilities",
  "Maintenance",
  "Transport",
  "Marketing",
  "Other",
];

export const inventoryItemTypes: InventoryItemType[] = [
  "Fabric",
  "Button",
  "Lining",
  "Thread",
  "Zip",
  "Accessory",
  "Other",
];

export const inventoryUnits: InventoryUnit[] = [
  "meter",
  "piece",
  "roll",
  "packet",
  "kg",
];

export const inventoryMovementTypes: InventoryMovementType[] = [
  "Stock In",
  "Stock Out",
  "Adjustment",
  "Wastage",
];

export const customerFabricStatuses: CustomerFabricStatus[] = [
  "Received",
  "In Use",
  "Returned",
  "Consumed",
];
