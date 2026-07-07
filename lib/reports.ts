import type { Customer, Order, PaymentMode } from "@/lib/types";
import {
  getAllOrders,
  getCustomerById,
  paymentModes,
} from "@/lib/data/stub-data";
import {
  getCustomerListRows,
  getCustomerDetail,
  type CustomerStatus,
} from "@/lib/customers";

// Same string-based date math as lib/dashboard.ts / lib/customers.ts (see
// CLAUDE.md's date formatting gotcha) — never Date/Intl locale APIs.
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

export interface DateRange {
  from: string;
  to: string;
}

export type DateRangePreset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "thisMonth"
  | "custom";

function inRange(dateIso: string, range: DateRange): boolean {
  return dateIso >= range.from && dateIso <= range.to;
}

export function getDateRangeForPreset(
  preset: DateRangePreset,
  todayIso: string,
  custom?: DateRange
): DateRange {
  switch (preset) {
    case "today":
      return { from: todayIso, to: todayIso };
    case "yesterday": {
      const y = addDays(todayIso, -1);
      return { from: y, to: y };
    }
    case "thisWeek": {
      const [y, m, d] = todayIso.split("-").map(Number);
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      return { from: addDays(todayIso, -diffToMonday), to: todayIso };
    }
    case "thisMonth": {
      const [y, m] = todayIso.split("-").map(Number);
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: todayIso };
    }
    case "custom":
      return custom ?? { from: todayIso, to: todayIso };
    case "all":
    default:
      return { from: "0001-01-01", to: "9999-12-31" };
  }
}

// ---------------------------------------------------------------------------
// Sales report
// ---------------------------------------------------------------------------

export interface SalesRow {
  date: string;
  orders: number;
  grossSales: number;
  amountCollected: number;
  balancePending: number;
}

export interface SalesReport {
  totalSales: number;
  revenueCollected: number;
  totalOrders: number;
  avgOrderValue: number;
  rows: SalesRow[];
}

export function getSalesReport(
  range: DateRange,
  paymentMode?: PaymentMode
): SalesReport {
  const allOrders = getAllOrders();
  const ordersInRange = allOrders.filter(
    (o) =>
      inRange(o.orderDate, range) &&
      (!paymentMode || o.paymentMode === paymentMode)
  );

  const totalSales = ordersInRange.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOrders = ordersInRange.length;
  const avgOrderValue = totalOrders === 0 ? 0 : totalSales / totalOrders;

  // "Revenue Collected" (money actually received) is distinct from "Sales"
  // (order value created) per the Reports spec. There's no dated
  // payment-transaction log (same limitation as lib/dashboard.ts's
  // revenueToday), so it's approximated as: advances collected on orders
  // placed in range, plus balances collected on orders delivered-and-settled
  // in range (balance <= 0 means the delivery-time balance was paid).
  const deliveredSettledInRange = allOrders.filter(
    (o) =>
      inRange(o.deliveryDate, range) &&
      o.balance <= 0 &&
      (!paymentMode || o.paymentMode === paymentMode)
  );
  const revenueCollected =
    ordersInRange.reduce((sum, o) => sum + o.advancePaid, 0) +
    deliveredSettledInRange.reduce(
      (sum, o) => sum + (o.totalAmount - o.advancePaid),
      0
    );

  // Table rows are grouped by order-placement date only (a per-order-placed
  // view), so "Amount Collected" here is the advance collected that day —
  // not the fuller revenueCollected figure above, which also folds in
  // balances settled at delivery on other dates.
  const byDate = new Map<string, SalesRow>();
  for (const o of ordersInRange) {
    const row = byDate.get(o.orderDate) ?? {
      date: o.orderDate,
      orders: 0,
      grossSales: 0,
      amountCollected: 0,
      balancePending: 0,
    };
    row.orders += 1;
    row.grossSales += o.totalAmount;
    row.amountCollected += o.advancePaid;
    row.balancePending += o.balance;
    byDate.set(o.orderDate, row);
  }
  const rows = Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? 1 : -1
  );

  return { totalSales, revenueCollected, totalOrders, avgOrderValue, rows };
}

// ---------------------------------------------------------------------------
// Payments report
// ---------------------------------------------------------------------------

export interface PaymentModeBreakdown {
  mode: PaymentMode;
  amount: number;
}

export interface PaymentRow {
  order: Order;
  customer: Customer | undefined;
  amountCollected: number;
}

export interface PaymentsReport {
  totalCollected: number;
  byMode: PaymentModeBreakdown[];
  outstandingBalance: number;
  overdueBalance: number;
  rows: PaymentRow[];
}

export interface PaymentsFilters {
  range: DateRange;
  paymentMode?: PaymentMode;
  customerQuery?: string;
  pendingOnly?: boolean;
  overdueOnly?: boolean;
}

export function getPaymentsReport(
  filters: PaymentsFilters,
  todayIso: string
): PaymentsReport {
  let filtered = getAllOrders().filter((o) => inRange(o.orderDate, filters.range));

  if (filters.paymentMode) {
    filtered = filtered.filter((o) => o.paymentMode === filters.paymentMode);
  }
  if (filters.pendingOnly) {
    filtered = filtered.filter((o) => o.balance > 0);
  }
  if (filters.overdueOnly) {
    filtered = filtered.filter(
      (o) => o.balance > 0 && o.deliveryDate < todayIso
    );
  }
  if (filters.customerQuery?.trim()) {
    const q = filters.customerQuery.trim().toLowerCase();
    filtered = filtered.filter((o) => {
      const c = getCustomerById(o.customerId);
      return !!c && (c.name.toLowerCase().includes(q) || c.phone.includes(q));
    });
  }

  // A whole order's collected amount is bucketed under its single recorded
  // paymentMode field — the data model has no per-payment ledger to split
  // advance vs. balance-at-delivery by mode if they ever differed.
  const totalCollected = filtered.reduce(
    (sum, o) => sum + (o.totalAmount - o.balance),
    0
  );
  const byMode = paymentModes
    .map((mode) => ({
      mode,
      amount: filtered
        .filter((o) => o.paymentMode === mode)
        .reduce((sum, o) => sum + (o.totalAmount - o.balance), 0),
    }))
    .filter((b) => b.amount > 0);

  const outstandingBalance = filtered.reduce(
    (sum, o) => sum + Math.max(o.balance, 0),
    0
  );
  const overdueBalance = filtered
    .filter((o) => o.balance > 0 && o.deliveryDate < todayIso)
    .reduce((sum, o) => sum + o.balance, 0);

  const rows: PaymentRow[] = filtered
    .map((order) => ({
      order,
      customer: getCustomerById(order.customerId),
      amountCollected: order.totalAmount - order.balance,
    }))
    .sort((a, b) => (a.order.orderDate < b.order.orderDate ? 1 : -1));

  return { totalCollected, byMode, outstandingBalance, overdueBalance, rows };
}

// ---------------------------------------------------------------------------
// Orders report (covers Order Status / Pending Balance / Delivery Due-Overdue)
// ---------------------------------------------------------------------------

export type OrderBalanceFilter = "all" | "paid" | "balanceDue" | "overdue";
export type OrderDeliveryFilter = "all" | "overdue" | "dueSoon";

export interface OrdersFilters {
  range: DateRange;
  balanceStatus: OrderBalanceFilter;
  deliveryStatus: OrderDeliveryFilter;
  garmentType?: string;
  customerQuery?: string;
}

export interface OrdersReportSummary {
  totalOrders: number;
  balanceDueOrders: number;
  overdueOrders: number;
  dueSoonDeliveries: number;
}

export interface OrdersReport {
  summary: OrdersReportSummary;
  orders: Order[];
}

export function getGarmentTypes(): string[] {
  const set = new Set<string>();
  getAllOrders().forEach((o) => o.items.forEach((i) => set.add(i.particular)));
  return Array.from(set).sort();
}

export function getOrdersReport(
  filters: OrdersFilters,
  todayIso: string
): OrdersReport {
  const weekAhead = addDays(todayIso, 7);
  const rangeOrders = getAllOrders().filter((o) =>
    inRange(o.orderDate, filters.range)
  );

  let filtered = rangeOrders;
  if (filters.balanceStatus === "paid") {
    filtered = filtered.filter((o) => o.balance <= 0);
  } else if (filters.balanceStatus === "balanceDue") {
    filtered = filtered.filter((o) => o.balance > 0);
  } else if (filters.balanceStatus === "overdue") {
    filtered = filtered.filter(
      (o) => o.balance > 0 && o.deliveryDate < todayIso
    );
  }

  if (filters.deliveryStatus === "overdue") {
    filtered = filtered.filter(
      (o) => o.deliveryDate < todayIso && o.balance > 0
    );
  } else if (filters.deliveryStatus === "dueSoon") {
    filtered = filtered.filter(
      (o) => o.deliveryDate >= todayIso && o.deliveryDate <= weekAhead
    );
  }

  if (filters.garmentType) {
    filtered = filtered.filter((o) =>
      o.items.some((i) => i.particular === filters.garmentType)
    );
  }
  if (filters.customerQuery?.trim()) {
    const q = filters.customerQuery.trim().toLowerCase();
    filtered = filtered.filter((o) => {
      const c = getCustomerById(o.customerId);
      return !!c && (c.name.toLowerCase().includes(q) || c.phone.includes(q));
    });
  }

  // Summary cards always reflect the date-range only, so they read as a
  // stable overview regardless of which status filters are also applied.
  const summary: OrdersReportSummary = {
    totalOrders: rangeOrders.length,
    balanceDueOrders: rangeOrders.filter((o) => o.balance > 0).length,
    overdueOrders: rangeOrders.filter(
      (o) => o.balance > 0 && o.deliveryDate < todayIso
    ).length,
    dueSoonDeliveries: rangeOrders.filter(
      (o) => o.deliveryDate >= todayIso && o.deliveryDate <= weekAhead
    ).length,
  };

  return { summary, orders: filtered };
}

// ---------------------------------------------------------------------------
// Customers report
// ---------------------------------------------------------------------------

export interface CustomerReportRow {
  customer: Customer;
  totalOrders: number;
  totalSpent: number;
  outstandingBalance: number;
  lastOrderDate: string | null;
  status: CustomerStatus;
}

export interface CustomersReportSummary {
  newCustomers: number;
  repeatCustomers: number;
  customersWithBalance: number;
  avgLifetimeValue: number;
}

export interface CustomersReportFilters {
  range: DateRange;
  area?: string;
  hasBalanceOnly?: boolean;
  repeatOnly?: boolean;
  inactiveOnly?: boolean;
  customerQuery?: string;
}

export interface CustomersReport {
  summary: CustomersReportSummary;
  rows: CustomerReportRow[];
}

export function getCustomersReport(
  filters: CustomersReportFilters,
  todayIso: string
): CustomersReport {
  const listRows = getCustomerListRows(todayIso);

  // Customer records have no createdAt timestamp, so "new" is approximated
  // from order history: a customer's first-ever order date falling inside
  // the selected range.
  const allOrders = getAllOrders();
  const firstOrderDateByCustomer = new Map<string, string>();
  for (const o of allOrders) {
    const current = firstOrderDateByCustomer.get(o.customerId);
    if (!current || o.orderDate < current) {
      firstOrderDateByCustomer.set(o.customerId, o.orderDate);
    }
  }

  const allRows: CustomerReportRow[] = listRows.map((r) => {
    const detail = getCustomerDetail(r.customer);
    return {
      customer: r.customer,
      totalOrders: r.totalOrders,
      totalSpent: detail.totalOrdersValue,
      outstandingBalance: r.outstandingBalance,
      lastOrderDate: r.lastOrderDate,
      status: r.status,
    };
  });

  const newCustomers = allRows.filter((r) => {
    const first = firstOrderDateByCustomer.get(r.customer.id);
    return !!first && inRange(first, filters.range);
  }).length;
  const repeatCustomers = allRows.filter((r) => r.totalOrders > 1).length;
  const customersWithBalance = allRows.filter(
    (r) => r.outstandingBalance > 0
  ).length;
  const avgLifetimeValue =
    allRows.length === 0
      ? 0
      : allRows.reduce((sum, r) => sum + r.totalSpent, 0) / allRows.length;

  let rows = allRows;
  if (filters.area) rows = rows.filter((r) => r.customer.area === filters.area);
  if (filters.hasBalanceOnly) rows = rows.filter((r) => r.outstandingBalance > 0);
  if (filters.repeatOnly) rows = rows.filter((r) => r.totalOrders > 1);
  if (filters.inactiveOnly) rows = rows.filter((r) => r.status === "Inactive");
  if (filters.customerQuery?.trim()) {
    const q = filters.customerQuery.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.customer.name.toLowerCase().includes(q) ||
        r.customer.phone.includes(q)
    );
  }

  return {
    summary: {
      newCustomers,
      repeatCustomers,
      customersWithBalance,
      avgLifetimeValue,
    },
    rows,
  };
}
