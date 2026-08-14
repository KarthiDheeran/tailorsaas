export type Gender = "Male" | "Female";
export type FabricSourcePreference =
  | "Not specified"
  | "Customer provided"
  | "Shop provided"
  | "Either";

export interface Customer {
  id: string;
  customerNumber: string;
  name: string;
  phone: string;
  address: string;
  area: string;
  gender?: Gender;
  categoryPreference?: string;
  fitPreference?: string;
  stylePreference?: string;
  fabricSourcePreference?: FabricSourcePreference;
  frequentComplaints?: string;
  notes?: string;
}

// Per-garment-type measurements — a flexible key-value structure keyed by
// customerId + garmentType (matching an OrderItem's `particular` text), added
// for the Edit Order flow's Measurement action. Overwrite-in-place per
// garment type — no version history.
export interface GarmentMeasurement {
  customerId: string;
  garmentType: string;
  values: Record<string, unknown>;
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
  values: Record<string, unknown>;
  notes?: string;
  updatedAt: string;
}

export type MeasurementHistoryKind = "Baseline" | "Garment";

export interface MeasurementHistoryEntry {
  id: string;
  kind: MeasurementHistoryKind;
  customerId: string;
  garmentType?: string;
  values: Record<string, unknown>;
  fitNotes?: string;
  notes?: string;
  source: string;
  createdAt: string;
}

export type MeasurementAttachmentType =
  | "Fit Photo"
  | "Sketch"
  | "Reference"
  | "Alteration Mark"
  | "Other";

export interface MeasurementAttachment {
  id: string;
  customerId: string;
  garmentType?: string;
  attachmentType: MeasurementAttachmentType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  notes?: string;
  createdAt: string;
  signedUrl?: string;
}

export type OrderAttachmentType =
  | "Design Reference"
  | "Fabric Photo"
  | "Sample Photo"
  | "Trial Photo"
  | "Alteration Photo"
  | "Final Garment Photo"
  | "Other";

export interface OrderAttachment {
  id: string;
  orderId: string;
  orderItemId?: string;
  orderItemSerialNo?: number;
  attachmentType: OrderAttachmentType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageProvider?: "supabase" | "local";
  storagePath: string;
  notes?: string;
  createdAt: string;
  signedUrl?: string;
}

// Denormalized {name, phone, area} snapshot shape — used both for Order's
// own customerSnapshot (captured at order-creation time) and, since Phase
// 6E, as the customer-display shape Reports' Payments/Orders/Sales tabs use
// instead of a live customers-table join (see lib/reports.ts).
export interface CustomerSnapshot {
  name: string;
  phone: string;
  area: string;
}

export interface OrderItemAddOn {
  key: string;
  label: string;
  labelTa?: string;
  amount: number;
  qty?: number;
  rate?: number;
  total?: number;
  workerStageRates?: Partial<Record<string, number>>;
}

export type OrderItemFabricSource =
  | "Not specified"
  | "Customer provided"
  | "Shop provided";

export type AlterationChargeType = "Paid" | "Free";

export interface OrderItem {
  id?: string;
  serialNo: number;
  // Garment type label (e.g. "Shirt"). Kept as a plain string, and as the
  // same field name used before this field became a catalog-driven dropdown
  // in New Order, so existing display code (orders table, order details,
  // edit order) didn't need to change.
  particular: string;
  // Catalog garment type id, set only when New Order (Catalog-driven since
  // Phase 6B) created this item. Edit Order still uses free-text particular
  // with no catalog id concept, so items edited/created there leave this
  // unset — a real FK "where possible," not guaranteed for every item.
  garmentTypeId?: string;
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
  measurements?: Record<string, unknown>;
  fieldSchemaSnapshot?: Record<string, unknown>;
  fabricSource?: OrderItemFabricSource;
  fabricNotes?: string;
  designNotes?: string;
  alterationIssue?: string;
  alterationRequiredChange?: string;
  alterationChargeType?: AlterationChargeType;
  linkedOriginalOrderId?: string;
}

export type PaymentMode =
  | "Cash"
  | "GPay"
  | "UPI"
  | "Card"
  | "Bank Transfer"
  | "Cheque";

export type ExpenseCategory =
  | "Fabric"
  | "Accessories"
  | "Salary"
  | "Rent"
  | "Utilities"
  | "Maintenance"
  | "Transport"
  | "Marketing"
  | "Other";

export type ExpenseSource =
  | "Manual Expense"
  | "Staff Payment"
  | "Inventory Purchase";

export type InventoryItemType =
  | "Fabric"
  | "Button"
  | "Lining"
  | "Thread"
  | "Zip"
  | "Accessory"
  | "Other";

export type InventoryUnit = "meter" | "piece" | "roll" | "packet" | "kg";

export type InventoryMovementType =
  | "Stock In"
  | "Stock Out"
  | "Adjustment"
  | "Wastage";

export type CustomerFabricStatus =
  | "Received"
  | "In Use"
  | "Returned"
  | "Consumed";

// A single transaction against an order's balance (supabase/migrations/
// 0008_payments.sql's `payments` table). paymentType is computed
// server-side by the record_payment() RPC — Final if it zeroes the order's
// balance, Advance if it's the order's first non-voided payment, Partial
// otherwise — never client-supplied. Voided rows are kept (soft-void only,
// see void_payment()) rather than deleted, so voidedAt/voidedBy/voidReason
// stay populated for the audit trail; a voided payment no longer counts
// toward the order's advance_paid/balance (see the recompute trigger).
export type PaymentType = "Advance" | "Partial" | "Final";

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  paymentType: PaymentType;
  notes?: string;
  recordedBy?: string;
  receivedByOperatorName?: string;
  voided: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  createdAt: string;
}

export type OrderFinancialAdjustmentType = "Discount" | "Extra Charge" | "Refund";

export interface OrderFinancialAdjustment {
  id: string;
  orderId: string;
  adjustmentDate: string;
  adjustmentType: OrderFinancialAdjustmentType;
  amount: number;
  paymentMode?: PaymentMode;
  reason: string;
  notes?: string;
  recordedBy?: string;
  voided: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  expenseDate: string;
  category: ExpenseCategory;
  source?: ExpenseSource;
  reference?: string;
  vendor?: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
  recordedBy?: string;
  voided: boolean;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  itemType: InventoryItemType;
  name: string;
  sku?: string;
  color?: string;
  unit: InventoryUnit;
  quantityOnHand: number;
  reorderLevel: number;
  costPerUnit?: number;
  vendorName?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantity: number;
  movementDate: string;
  reason?: string;
  orderId?: string;
  jobCardId?: string;
  recordedBy?: string;
  createdAt: string;
}

export interface CustomerFabric {
  id: string;
  customerId?: string;
  orderId?: string;
  customerName: string;
  customerPhone?: string;
  fabricDescription: string;
  color?: string;
  quantity: number;
  unit: InventoryUnit;
  receivedDate: string;
  status: CustomerFabricStatus;
  notes?: string;
  returnedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppMessageContextType =
  | "Calendar"
  | "Order"
  | "Job Card"
  | "Customer"
  | "Delivery"
  | "Payment";

export type WhatsAppMessageStatus = "Opened" | "Marked Sent";

export interface WhatsAppMessage {
  id: string;
  phone: string;
  message: string;
  contextType: WhatsAppMessageContextType;
  contextId?: string;
  status: WhatsAppMessageStatus;
  sentBy?: string;
  sentAt: string;
  createdAt: string;
}

export type CommunicationTemplateType =
  | "Order Confirmation"
  | "Delivery Reminder"
  | "Trial Reminder"
  | "Payment Reminder"
  | "Ready for Pickup"
  | "Feedback Request"
  | "Promotional Message"
  | "Production Reminder"
  | "Delay Notice"
  | "Rework Notice";

export interface CommunicationTemplate {
  templateType: CommunicationTemplateType;
  title: string;
  body: string;
  active: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export type JobCardActivityAction =
  | "Assigned"
  | "Started"
  | "Stage Moved"
  | "Completed"
  | "Delayed"
  | "Rework"
  | "Transferred";

export interface JobCardActivityLog {
  id: string;
  jobCardId: string;
  orderId: string;
  actionType: JobCardActivityAction;
  fromStage?: string;
  toStage?: string;
  assignedStaffId?: string;
  notes?: string;
  performedBy?: string;
  createdAt: string;
}

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
  tenantId?: string;
  shopId?: string;
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
  pieceRates?: Partial<Record<string, number>>;
  garmentStageRates?: Record<string, Partial<Record<string, number>>>;
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

export interface StaffWorkEarning {
  id: string;
  staffId: string;
  jobCardId: string;
  orderId: string;
  jobCardNumber: string;
  taskType: TaskType;
  completedDate: string;
  wageRate: number;
  wageAmount: number;
  sourceSlipCode?: string;
  createdAt: string;
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
  tenantId?: string;
  shopId?: string;
  orderNumber: string;
  orderSequence?: number;
  orderSection?: import("@/lib/catalog").GarmentSection;
  scanToken?: string;
  invoiceNumber?: string;
  customerId: string;
  // Denormalized copy of the customer's name/phone/area as of order
  // creation. Not used for live display anywhere — every existing view
  // (OrdersTable, Order Details, Customer profile) reads the customer's
  // *current* details via getCustomerById(order.customerId), same as
  // before, so a later name/phone edit still shows correctly everywhere.
  // This snapshot exists only as a recorded fact about how the order looked
  // when it was placed.
  customerSnapshot?: CustomerSnapshot;
  orderDate: string;
  trialDate: string;
  deliveryDate: string;
  deliveryPromiseNote?: string;
  orderNotes?: string;
  deliveryBin?: string;
  createdByOperatorName?: string;
  measurementTakenByOperatorName?: string;
  deliveredByOperatorName?: string;
  deliveredAt?: string;
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
