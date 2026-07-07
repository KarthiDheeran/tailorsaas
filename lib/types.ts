export type Gender = "Male" | "Female";

export interface Customer {
  id: string;
  customerNumber: string;
  name: string;
  phone: string;
  address: string;
  area: string;
  gender?: Gender;
}

// Per-garment-type measurements — a flexible key-value structure keyed by
// customerId + garmentType (matching an OrderItem's `particular` text), added
// for the Edit Order flow's Measurement action. Overwrite-in-place per
// garment type — no version history.
export interface GarmentMeasurement {
  customerId: string;
  garmentType: string;
  values: Record<string, string>;
  fitNotes?: string;
  notes?: string;
  updatedAt: string;
}

// Customer-level body measurements — the canonical, reusable profile the
// Customers module displays/edits (see components/customers/measurements-card.tsx
// and app/customers/[id]/measurements). A flexible key-value baseline keyed
// only by customerId — no garment type — used both to display the customer's
// profile and to auto-fill garment-specific measurement fields in the New
// Order flow. Keys match the field ids in lib/catalog.ts's
// MEASUREMENT_FIELD_GROUPS, so values carry over automatically (e.g. "bust"
// filled here prefills a Blouse's Bust field). Overwrite-in-place per key
// (merge-upsert, see saveCustomerMeasurements), no history — same convention
// as GarmentMeasurement, which stays a separate, garment-scoped snapshot.
export interface CustomerMeasurements {
  customerId: string;
  values: Record<string, string>;
  notes?: string;
  updatedAt: string;
}

export interface OrderItemAddOn {
  key: string;
  label: string;
  amount: number;
}

export interface OrderItem {
  serialNo: number;
  // Garment type label (e.g. "Shirt"). Kept as a plain string, and as the
  // same field name used before this field became a catalog-driven dropdown
  // in New Order, so existing display code (orders table, order details,
  // edit order) didn't need to change.
  particular: string;
  size?: string;
  qty: number;
  // Base rate (catalog base price, or a manual override) — excludes add-ons.
  rate: number;
  addOns?: OrderItemAddOn[];
  // Sum of addOns[].amount — redundant with addOns but kept as an explicit
  // field so the rate/add-ons/amount relationship doesn't need to be
  // recomputed by every reader.
  addOnsTotal?: number;
  // rate + addOnsTotal — the effective per-unit price actually charged.
  finalRate?: number;
  // qty * finalRate
  amount: number;
  // Snapshot of this item's measurement values as entered at order time
  // (only set when the shopkeeper actually opened/filled the Measurements
  // modal for this item — see New Order's Measurements handling). The
  // customer's own GarmentMeasurement/CustomerMeasurements records remain
  // the live, editable source; this is just what this particular order used.
  measurements?: Record<string, string>;
}

export type PaymentMode =
  | "Cash"
  | "GPay"
  | "UPI"
  | "Card"
  | "Bank Transfer"
  | "Cheque";

export type StaffRole =
  | "Master Tailor"
  | "Cutter"
  | "Stitching Staff"
  | "Embroidery Staff"
  | "Finishing Staff"
  | "Alteration Staff"
  | "Delivery Staff"
  | "Manager"
  | "Owner/Admin";

export type StaffStatus = "Active" | "Inactive" | "On Leave";

export type StaffPaymentType = "Salary" | "Per Piece";

export type TaskType =
  | "Measurement"
  | "Cutting"
  | "Stitching"
  | "Embroidery"
  | "Finishing"
  | "Alteration"
  | "Ironing/Packing"
  | "Delivery";

export type TaskPriority = "Low" | "Normal" | "High";

export interface Staff {
  id: string;
  staffNumber: string;
  name: string;
  phone: string;
  role: StaffRole;
  joiningDate: string;
  address: string;
  emergencyContact: string;
  status: StaffStatus;
  notes?: string;
  paymentType: StaffPaymentType;
  baseSalary?: number;
  pieceRates?: Partial<Record<TaskType, number>>;
}

// A WorkAssignment references a garment line via orderId + orderItemSerialNo
// (serial numbers are unique within an order) rather than adding an id to
// OrderItem, so the existing Order/OrderItem type and New Order flow don't
// need to change.
export interface WorkAssignment {
  id: string;
  orderId: string;
  orderItemSerialNo: number;
  taskType: TaskType;
  assignedStaffId: string;
  assignedDate: string;
  dueDate: string;
  priority: TaskPriority;
  startedDate?: string;
  completedDate?: string;
  cancelled?: boolean;
  workNotes?: string;
  // Snapshotted at assignment time from the staff member's rate (pieceRate *
  // item qty for "Per Piece" staff, 0 for "Salary" staff) so later rate
  // changes don't retroactively alter past assignments.
  wageAmount: number;
}

export interface StaffPayment {
  id: string;
  staffId: string;
  date: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
}

export type OrderStatus =
  | "In Progress"
  | "Ready"
  | "Delayed"
  | "Delivered"
  | "Cancelled";

export type PaymentStatus = "Not calculated" | "Paid" | "Due" | "Overdue";

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  // Denormalized copy of the customer's name/phone/area as of order
  // creation. Not used for live display anywhere — every existing view
  // (OrdersTable, Order Details, Customer profile) reads the customer's
  // *current* details via getCustomerById(order.customerId), same as
  // before, so a later name/phone edit still shows correctly everywhere.
  // This snapshot exists only as a recorded fact about how the order looked
  // when it was placed.
  customerSnapshot?: { name: string; phone: string; area: string };
  orderDate: string;
  trialDate: string;
  deliveryDate: string;
  items: OrderItem[];
  totalAmount: number;
  advancePaid: number;
  balance: number;
  paymentMode: PaymentMode;
  status: OrderStatus;
  // Paid/Due/Overdue as of order creation — a snapshot, not a live field.
  // Current status is always computed fresh from balance + deliveryDate at
  // render time (see BalanceBadge in orders-table.tsx), since a stored
  // value would go stale the moment the delivery date passes. Nothing reads
  // this field for display; it exists only as a recorded fact.
  paymentStatus?: PaymentStatus;
  createdAt?: string;
  updatedAt?: string;
}
