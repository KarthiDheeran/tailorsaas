import type {
  Customer,
  CustomerMeasurements,
  GarmentMeasurement,
  Gender,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMode,
  Staff,
  StaffPayment,
  StaffPaymentType,
  StaffRole,
  StaffStatus,
  TaskPriority,
  TaskType,
  WorkAssignment,
} from "@/lib/types";

export const orderStatuses: OrderStatus[] = [
  "In Progress",
  "Ready",
  "Delayed",
  "Delivered",
  "Cancelled",
];

// In-memory stub data for UI development. Will be replaced by Supabase
// queries once the schema is wired up (see CLAUDE.md).

export const customers: Customer[] = [
  {
    id: "cust-1",
    customerNumber: "CUST-0001",
    name: "Ramesh Kumar",
    phone: "9876543210",
    address: "12 MG Road",
    area: "Andheri West",
    gender: "Male",
  },
  {
    id: "cust-2",
    customerNumber: "CUST-0002",
    name: "Priya Sharma",
    phone: "9765432109",
    address: "45 Baner Road",
    area: "Baner",
    gender: "Female",
  },
  {
    id: "cust-3",
    customerNumber: "CUST-0003",
    name: "Suresh Patil",
    phone: "9823456789",
    address: "7 Karve Nagar Lane",
    area: "Kothrud",
    gender: "Male",
  },
  {
    id: "cust-4",
    customerNumber: "CUST-0004",
    name: "Anita Deshmukh",
    phone: "9654321098",
    address: "22 Kharadi Bypass",
    area: "Kharadi",
    gender: "Female",
  },
];

export const orders: Order[] = [
  {
    id: "order-1",
    orderNumber: "ORD-2026-0001",
    customerId: "cust-1",
    orderDate: "2026-05-10",
    trialDate: "2026-05-20",
    deliveryDate: "2026-05-28",
    items: [
      { serialNo: 1, particular: "Shirt", qty: 2, rate: 900, amount: 1800 },
      { serialNo: 2, particular: "Pant", qty: 1, rate: 1200, amount: 1200 },
    ],
    totalAmount: 3000,
    advancePaid: 1000,
    balance: 2000,
    paymentMode: "Cash",
    status: "Delayed",
  },
  {
    id: "order-2",
    orderNumber: "ORD-2026-0002",
    customerId: "cust-2",
    orderDate: "2026-06-02",
    trialDate: "2026-06-10",
    deliveryDate: "2026-06-18",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 3, rate: 700, amount: 2100 },
    ],
    totalAmount: 2100,
    advancePaid: 2100,
    balance: 0,
    paymentMode: "GPay",
    status: "Delivered",
  },
  {
    id: "order-3",
    orderNumber: "ORD-2026-0003",
    customerId: "cust-1",
    orderDate: "2026-06-25",
    trialDate: "2026-07-02",
    deliveryDate: "2026-07-10",
    items: [
      { serialNo: 1, particular: "Suit", qty: 1, rate: 6500, amount: 6500 },
    ],
    totalAmount: 6500,
    advancePaid: 3000,
    balance: 3500,
    paymentMode: "UPI",
    status: "In Progress",
  },
  {
    id: "order-4",
    orderNumber: "ORD-2026-0004",
    customerId: "cust-3",
    orderDate: "2026-04-12",
    trialDate: "2026-04-20",
    deliveryDate: "2026-04-28",
    items: [
      { serialNo: 1, particular: "Shirt", qty: 3, rate: 850, amount: 2550 },
    ],
    totalAmount: 2550,
    advancePaid: 1000,
    balance: 1550,
    paymentMode: "Cash",
    status: "Delayed",
  },
  {
    id: "order-5",
    orderNumber: "ORD-2026-0005",
    customerId: "cust-4",
    orderDate: "2026-04-18",
    trialDate: "2026-04-26",
    deliveryDate: "2026-05-02",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 2, rate: 750, amount: 1500 },
    ],
    totalAmount: 1500,
    advancePaid: 1500,
    balance: 0,
    paymentMode: "Cash",
    status: "Delivered",
  },
  {
    id: "order-6",
    orderNumber: "ORD-2026-0006",
    customerId: "cust-2",
    orderDate: "2026-03-05",
    trialDate: "2026-03-14",
    deliveryDate: "2026-03-22",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 1, rate: 700, amount: 700 },
      { serialNo: 2, particular: "Petticoat", qty: 1, rate: 400, amount: 400 },
    ],
    totalAmount: 1100,
    advancePaid: 500,
    balance: 600,
    paymentMode: "UPI",
    status: "Cancelled",
  },
  {
    id: "order-7",
    orderNumber: "ORD-2026-0007",
    customerId: "cust-1",
    orderDate: "2026-02-20",
    trialDate: "2026-02-28",
    deliveryDate: "2026-03-06",
    items: [
      { serialNo: 1, particular: "Pant", qty: 2, rate: 1100, amount: 2200 },
    ],
    totalAmount: 2200,
    advancePaid: 2200,
    balance: 0,
    paymentMode: "Card",
    status: "Delivered",
  },
  {
    id: "order-8",
    orderNumber: "ORD-2026-0008",
    customerId: "cust-3",
    orderDate: "2026-02-02",
    trialDate: "2026-02-10",
    deliveryDate: "2026-02-18",
    items: [
      { serialNo: 1, particular: "Suit", qty: 1, rate: 7200, amount: 7200 },
    ],
    totalAmount: 7200,
    advancePaid: 4000,
    balance: 3200,
    paymentMode: "Bank Transfer",
    status: "Delayed",
  },
  {
    id: "order-9",
    orderNumber: "ORD-2026-0009",
    customerId: "cust-4",
    orderDate: "2026-01-15",
    trialDate: "2026-01-24",
    deliveryDate: "2026-02-01",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 1, rate: 800, amount: 800 },
    ],
    totalAmount: 800,
    advancePaid: 300,
    balance: 500,
    paymentMode: "GPay",
    status: "Delivered",
  },
  {
    id: "order-10",
    orderNumber: "ORD-2025-0010",
    customerId: "cust-2",
    orderDate: "2025-12-10",
    trialDate: "2025-12-18",
    deliveryDate: "2025-12-24",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 2, rate: 650, amount: 1300 },
    ],
    totalAmount: 1300,
    advancePaid: 1300,
    balance: 0,
    paymentMode: "Cash",
    status: "Delivered",
  },
  {
    id: "order-11",
    orderNumber: "ORD-2025-0011",
    customerId: "cust-1",
    orderDate: "2025-11-22",
    trialDate: "2025-11-30",
    deliveryDate: "2025-12-06",
    items: [
      { serialNo: 1, particular: "Shirt", qty: 1, rate: 900, amount: 900 },
    ],
    totalAmount: 900,
    advancePaid: 900,
    balance: 0,
    paymentMode: "Cash",
    status: "Delivered",
  },
  {
    id: "order-12",
    orderNumber: "ORD-2025-0012",
    customerId: "cust-3",
    orderDate: "2025-10-30",
    trialDate: "2025-11-07",
    deliveryDate: "2025-11-14",
    items: [
      { serialNo: 1, particular: "Pant", qty: 3, rate: 1150, amount: 3450 },
    ],
    totalAmount: 3450,
    advancePaid: 1500,
    balance: 1950,
    paymentMode: "UPI",
    status: "Delayed",
  },
  {
    id: "order-13",
    orderNumber: "ORD-2025-0013",
    customerId: "cust-4",
    orderDate: "2025-10-05",
    trialDate: "2025-10-13",
    deliveryDate: "2025-10-20",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 1, rate: 750, amount: 750 },
    ],
    totalAmount: 750,
    advancePaid: 750,
    balance: 0,
    paymentMode: "GPay",
    status: "Delivered",
  },
  // Orders 14-18 are dated around the current day so the Dashboard's
  // "today" stats/lists (orders today, deliveries today, trials today,
  // yesterday comparison) have real data to show instead of all zeros.
  {
    id: "order-14",
    orderNumber: "ORD-2026-0014",
    customerId: "cust-2",
    orderDate: "2026-07-03",
    trialDate: "2026-07-11",
    deliveryDate: "2026-07-19",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 1, rate: 750, amount: 750 },
    ],
    totalAmount: 750,
    advancePaid: 300,
    balance: 450,
    paymentMode: "UPI",
    status: "In Progress",
  },
  {
    id: "order-15",
    orderNumber: "ORD-2026-0015",
    customerId: "cust-4",
    orderDate: "2026-07-04",
    trialDate: "2026-07-12",
    deliveryDate: "2026-07-21",
    items: [
      { serialNo: 1, particular: "Blouse", qty: 2, rate: 780, amount: 1560 },
    ],
    totalAmount: 1560,
    advancePaid: 600,
    balance: 960,
    paymentMode: "Cash",
    status: "In Progress",
  },
  {
    id: "order-16",
    orderNumber: "ORD-2026-0016",
    customerId: "cust-3",
    orderDate: "2026-06-28",
    trialDate: "2026-07-04",
    deliveryDate: "2026-07-15",
    items: [
      { serialNo: 1, particular: "Shirt", qty: 2, rate: 850, amount: 1700 },
    ],
    totalAmount: 1700,
    advancePaid: 700,
    balance: 1000,
    paymentMode: "Cash",
    status: "Ready",
  },
  {
    id: "order-17",
    orderNumber: "ORD-2026-0017",
    customerId: "cust-4",
    orderDate: "2026-06-20",
    trialDate: "2026-06-28",
    deliveryDate: "2026-07-04",
    items: [
      { serialNo: 1, particular: "Suit", qty: 1, rate: 6800, amount: 6800 },
    ],
    totalAmount: 6800,
    advancePaid: 4000,
    balance: 2800,
    paymentMode: "GPay",
    status: "In Progress",
  },
  {
    id: "order-18",
    orderNumber: "ORD-2026-0018",
    customerId: "cust-1",
    orderDate: "2026-06-25",
    trialDate: "2026-07-01",
    deliveryDate: "2026-07-04",
    items: [
      { serialNo: 1, particular: "Pant", qty: 1, rate: 1200, amount: 1200 },
    ],
    totalAmount: 1200,
    advancePaid: 1200,
    balance: 0,
    paymentMode: "Cash",
    status: "Delivered",
  },
];

export function getCustomers(): Customer[] {
  return customers;
}

export function getCustomerById(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function searchCustomers(query: string): Customer[] {
  const q = query.trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  return customers.filter(
    (c) => c.name.toLowerCase().includes(lower) || c.phone.includes(q)
  );
}

export function getOrdersForCustomer(customerId: string): Order[] {
  return orders
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1));
}

export function getOrderById(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

export function getAllOrders(): Order[] {
  return [...orders].sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1));
}

export function generateNextOrderNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const maxSeq = orders
    .filter((o) => o.orderNumber.startsWith(prefix))
    .reduce((max, o) => Math.max(max, Number(o.orderNumber.slice(prefix.length))), 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export function createCustomer(data: {
  name: string;
  phone: string;
  address: string;
  area: string;
  gender: Gender;
}): Customer {
  const nextSeq = customers.length + 1;
  const customer: Customer = {
    id: `cust-${nextSeq}`,
    customerNumber: `CUST-${String(nextSeq).padStart(4, "0")}`,
    ...data,
  };
  customers.push(customer);
  return customer;
}

export function updateCustomer(
  id: string,
  data: {
    name: string;
    phone: string;
    address: string;
    area: string;
    gender: Gender;
  }
): Customer | undefined {
  const idx = customers.findIndex((c) => c.id === id);
  if (idx < 0) return undefined;
  customers[idx] = { ...customers[idx], ...data };
  return customers[idx];
}

export function createOrder(data: {
  customerId: string;
  orderDate: string;
  trialDate: string;
  deliveryDate: string;
  items: OrderItem[];
  advancePaid: number;
  paymentMode: PaymentMode;
}): Order {
  const totalAmount = data.items.reduce((sum, i) => sum + i.amount, 0);
  const order: Order = {
    id: `order-${orders.length + 1}`,
    orderNumber: generateNextOrderNumber(),
    customerId: data.customerId,
    orderDate: data.orderDate,
    trialDate: data.trialDate,
    deliveryDate: data.deliveryDate,
    items: data.items,
    totalAmount,
    advancePaid: data.advancePaid,
    balance: totalAmount - data.advancePaid,
    paymentMode: data.paymentMode,
    status: "In Progress",
  };
  orders.push(order);
  return order;
}

export function updateOrderStatus(
  id: string,
  status: OrderStatus
): Order | undefined {
  const order = orders.find((o) => o.id === id);
  if (!order) return undefined;
  order.status = status;
  return order;
}

// Edit Order (chunk 7): updates dates/items/status in place. advancePaid is
// deliberately untouched here — Payment stays "advance + balance at
// delivery" only (no multi-installment support), so editing never mutates
// advancePaid; balance is simply recomputed against the new totalAmount.
export function updateOrder(
  id: string,
  data: {
    orderDate: string;
    deliveryDate: string;
    items: OrderItem[];
    status: OrderStatus;
  }
): Order | undefined {
  const order = orders.find((o) => o.id === id);
  if (!order) return undefined;
  const totalAmount = data.items.reduce((sum, i) => sum + i.amount, 0);
  order.orderDate = data.orderDate;
  order.deliveryDate = data.deliveryDate;
  order.items = data.items;
  order.totalAmount = totalAmount;
  order.balance = totalAmount - order.advancePaid;
  order.status = data.status;
  return order;
}

// Per-garment-type measurements (see GarmentMeasurement in lib/types.ts),
// seeded empty like workAssignments/staffPayments below — no sample data,
// populated only as the shopkeeper saves them from the Edit Order flow.
export const garmentMeasurements: GarmentMeasurement[] = [];

function garmentKey(garmentType: string): string {
  return garmentType.trim().toLowerCase();
}

export function getGarmentMeasurement(
  customerId: string,
  garmentType: string
): GarmentMeasurement | undefined {
  const key = garmentKey(garmentType);
  return garmentMeasurements.find(
    (m) => m.customerId === customerId && garmentKey(m.garmentType) === key
  );
}

export function getGarmentMeasurementsForCustomer(
  customerId: string
): GarmentMeasurement[] {
  return garmentMeasurements.filter((m) => m.customerId === customerId);
}

// Customer-level body measurement baseline (see CustomerMeasurements in
// lib/types.ts) — the Customers module's measurement profile, and distinct
// from GarmentMeasurement (per garment type, Edit Order's Measurement
// action). A customer created from scratch simply starts with none.
export const customerMeasurements: CustomerMeasurements[] = [
  {
    customerId: "cust-1",
    values: {
      chest: "40",
      waist: "36",
      shoulder: "18",
      sleeveLength: "24",
      neck: "16",
      shirtLength: "29",
      inseam: "31",
      thigh: "23",
      bottom: "15",
      cuff: "15",
    },
    notes: "Prefers slightly loose fit around the chest",
    updatedAt: "2026-05-10",
  },
  {
    customerId: "cust-2",
    values: {
      bust: "36",
      waist: "30",
      hip: "38",
      shoulder: "14",
      sleeveLength: "17",
      blouseLength: "15",
      neckDepthFront: "6",
      neckDepthBack: "9",
      armhole: "16",
    },
    notes: "High neck preferred for blouses",
    updatedAt: "2026-06-02",
  },
  {
    customerId: "cust-3",
    values: {
      chest: "42",
      waist: "38",
      shoulder: "19",
      sleeveLength: "25",
      neck: "16.5",
      shirtLength: "30",
      inseam: "32",
      thigh: "24",
      bottom: "16",
      cuff: "16",
    },
    updatedAt: "2026-04-12",
  },
  {
    customerId: "cust-4",
    values: {
      bust: "34",
      waist: "28",
      hip: "36",
      shoulder: "13.5",
      sleeveLength: "16",
      blouseLength: "14",
      neckDepthFront: "5.5",
      neckDepthBack: "8",
      armhole: "15",
    },
    updatedAt: "2026-04-18",
  },
];

export function getCustomerMeasurements(
  customerId: string
): CustomerMeasurements | undefined {
  return customerMeasurements.find((m) => m.customerId === customerId);
}

// Merge-upsert: only overwrites the keys provided, so different garments'
// measurement modals can each contribute a subset of the customer's body
// measurements (e.g. a Blouse order fills bust/waist, a later Pant order
// fills hip/inseam) without clobbering fields saved from other garment
// types/orders.
export function saveCustomerMeasurements(data: {
  customerId: string;
  values: Record<string, string>;
  notes?: string;
}): CustomerMeasurements {
  const idx = customerMeasurements.findIndex(
    (m) => m.customerId === data.customerId
  );
  const updatedAt = new Date().toISOString().slice(0, 10);
  const record: CustomerMeasurements =
    idx >= 0
      ? {
          customerId: data.customerId,
          values: { ...customerMeasurements[idx].values, ...data.values },
          notes: data.notes ?? customerMeasurements[idx].notes,
          updatedAt,
        }
      : {
          customerId: data.customerId,
          values: { ...data.values },
          notes: data.notes,
          updatedAt,
        };
  if (idx >= 0) {
    customerMeasurements[idx] = record;
  } else {
    customerMeasurements.push(record);
  }
  return record;
}

// Seed values for a garment measurement draft: the garment-specific saved
// record (getGarmentMeasurement) wins per-key since it reflects a value
// already tailored for that garment, falling back to the customer's general
// body-measurement baseline for anything the garment-specific record
// doesn't have yet.
export function getGarmentMeasurementDraftSeed(
  customerId: string,
  garmentType: string
): { values: Record<string, string>; fitNotes: string; notes: string } {
  const base = getCustomerMeasurements(customerId)?.values ?? {};
  const persisted = getGarmentMeasurement(customerId, garmentType);
  return {
    values: { ...base, ...(persisted?.values ?? {}) },
    fitNotes: persisted?.fitNotes ?? "",
    notes: persisted?.notes ?? "",
  };
}

// Overwrite-in-place per customerId + garmentType — no version history.
export function saveGarmentMeasurement(data: {
  customerId: string;
  garmentType: string;
  values: Record<string, string>;
  fitNotes?: string;
  notes?: string;
}): GarmentMeasurement {
  const key = garmentKey(data.garmentType);
  const idx = garmentMeasurements.findIndex(
    (m) => m.customerId === data.customerId && garmentKey(m.garmentType) === key
  );
  const record: GarmentMeasurement = {
    ...data,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  if (idx >= 0) {
    garmentMeasurements[idx] = record;
  } else {
    garmentMeasurements.push(record);
  }
  return record;
}

export const paymentModes: PaymentMode[] = [
  "Cash",
  "GPay",
  "UPI",
  "Card",
  "Bank Transfer",
  "Cheque",
];

export const staff: Staff[] = [
  {
    id: "staff-1",
    staffNumber: "STAFF-0001",
    name: "Ramesh Tailor",
    phone: "9811122233",
    role: "Master Tailor",
    joiningDate: "2022-03-01",
    address: "14 Shivaji Nagar",
    emergencyContact: "9822233344",
    status: "Active",
    paymentType: "Salary",
    baseSalary: 22000,
  },
  {
    id: "staff-2",
    staffNumber: "STAFF-0002",
    name: "Vikas Chavan",
    phone: "9822334455",
    role: "Cutter",
    joiningDate: "2023-01-15",
    address: "9 Deccan Gymkhana",
    emergencyContact: "9833445566",
    status: "Active",
    paymentType: "Per Piece",
    pieceRates: { Cutting: 100 },
  },
  {
    id: "staff-3",
    staffNumber: "STAFF-0003",
    name: "Sunita Jadhav",
    phone: "9833445577",
    role: "Stitching Staff",
    joiningDate: "2023-06-10",
    address: "22 Aundh Road",
    emergencyContact: "9844556677",
    status: "Active",
    paymentType: "Per Piece",
    pieceRates: { Stitching: 200, Alteration: 80 },
  },
  {
    id: "staff-4",
    staffNumber: "STAFF-0004",
    name: "Farida Shaikh",
    phone: "9844556688",
    role: "Embroidery Staff",
    joiningDate: "2024-02-20",
    address: "5 Camp Area",
    emergencyContact: "9855667788",
    status: "Active",
    paymentType: "Per Piece",
    pieceRates: { Embroidery: 300 },
  },
  {
    id: "staff-5",
    staffNumber: "STAFF-0005",
    name: "Manoj Pawar",
    phone: "9855667799",
    role: "Finishing Staff",
    joiningDate: "2024-05-05",
    address: "31 Hadapsar",
    emergencyContact: "9866778899",
    status: "On Leave",
    paymentType: "Per Piece",
    pieceRates: { Finishing: 80, "Ironing/Packing": 40 },
  },
  {
    id: "staff-6",
    staffNumber: "STAFF-0006",
    name: "Anil Gaikwad",
    phone: "9866778800",
    role: "Delivery Staff",
    joiningDate: "2023-09-18",
    address: "2 Wanowrie",
    emergencyContact: "9877889900",
    status: "Active",
    paymentType: "Salary",
    baseSalary: 9000,
  },
];

export const workAssignments: WorkAssignment[] = [];

export const staffPayments: StaffPayment[] = [];

export function getStaff(): Staff[] {
  return staff;
}

export function getStaffById(id: string): Staff | undefined {
  return staff.find((s) => s.id === id);
}

export function getWorkAssignments(): WorkAssignment[] {
  return workAssignments;
}

export function getWorkAssignmentsForStaff(staffId: string): WorkAssignment[] {
  return workAssignments.filter((a) => a.assignedStaffId === staffId);
}

export function getWorkAssignmentsForOrder(orderId: string): WorkAssignment[] {
  return workAssignments.filter((a) => a.orderId === orderId);
}

export function getStaffPayments(): StaffPayment[] {
  return staffPayments;
}

export function getStaffPaymentsForStaff(staffId: string): StaffPayment[] {
  return staffPayments.filter((p) => p.staffId === staffId);
}

export function generateNextStaffNumber(): string {
  const maxSeq = staff.reduce(
    (max, s) => Math.max(max, Number(s.staffNumber.slice("STAFF-".length))),
    0
  );
  return `STAFF-${String(maxSeq + 1).padStart(4, "0")}`;
}

export function createStaff(data: {
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
}): Staff {
  const member: Staff = {
    id: `staff-${staff.length + 1}`,
    staffNumber: generateNextStaffNumber(),
    ...data,
  };
  staff.push(member);
  return member;
}

export function updateStaff(
  id: string,
  data: {
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
): Staff | undefined {
  const idx = staff.findIndex((s) => s.id === id);
  if (idx < 0) return undefined;
  staff[idx] = { ...staff[idx], ...data };
  return staff[idx];
}

export function createWorkAssignment(data: {
  orderId: string;
  orderItemSerialNo: number;
  taskType: TaskType;
  assignedStaffId: string;
  assignedDate: string;
  dueDate: string;
  priority: TaskPriority;
  workNotes?: string;
}): WorkAssignment {
  const order = getOrderById(data.orderId);
  const item = order?.items.find(
    (i) => i.serialNo === data.orderItemSerialNo
  );
  const assignedStaff = getStaffById(data.assignedStaffId);
  const rate = assignedStaff?.pieceRates?.[data.taskType] ?? 0;
  const wageAmount = item ? rate * item.qty : 0;

  const assignment: WorkAssignment = {
    id: `assign-${workAssignments.length + 1}`,
    ...data,
    wageAmount,
  };
  workAssignments.push(assignment);
  return assignment;
}

export function updateWorkAssignment(
  id: string,
  patch: Partial<
    Pick<
      WorkAssignment,
      | "assignedStaffId"
      | "dueDate"
      | "priority"
      | "startedDate"
      | "completedDate"
      | "cancelled"
      | "workNotes"
    >
  >
): WorkAssignment | undefined {
  const idx = workAssignments.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  workAssignments[idx] = { ...workAssignments[idx], ...patch };
  return workAssignments[idx];
}

export function recordStaffPayment(data: {
  staffId: string;
  date: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
}): StaffPayment {
  const payment: StaffPayment = {
    id: `staffpay-${staffPayments.length + 1}`,
    ...data,
  };
  staffPayments.push(payment);
  return payment;
}
