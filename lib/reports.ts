import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Customer,
  CustomerSnapshot,
  InventoryItem,
  InventoryItemType,
  Order,
  Payment,
  PaymentMode,
  PaymentType,
  Staff,
} from "@/lib/types";
import { getAllOrders } from "@/lib/data/orders-db";
import { getAllPayments } from "@/lib/data/payments-db";
import {
  getExpenses,
  isMissingExpensesSchemaError,
} from "@/lib/data/expenses-db";
import {
  getJobCards,
  isMissingJobCardsSchemaError,
} from "@/lib/data/job-cards-db";
import {
  getInventoryItems,
  isMissingInventorySchemaError,
} from "@/lib/data/inventory-db";
import { getStaff } from "@/lib/data/staff-db";
import { getAppUsers } from "@/lib/profiles";
import { paymentModes } from "@/lib/constants";
import {
  getCustomerListRows,
  getCustomerDetail,
  type CustomerStatus,
} from "@/lib/customers-db";
import type { JobCard, JobCardStage } from "@/lib/job-cards";

// ---------------------------------------------------------------------------
// Phase 6E: real, Supabase-backed report selectors — every function now
// takes an already-constructed Supabase client first. Reports is a derived,
// read-only summary view: the caller only ever needs reports.view (checked
// once, in app/(shell)/reports/actions.ts), never orders.view/customers.view
// separately — see that file for how the client is chosen (admin client,
// bypassing orders/customers RLS, once reports.view is confirmed).
//
// Customer names/phones for Sales/Payments/Orders all come from each order's
// own customerSnapshot (no live customers-table join needed for those three
// reports at all) — only the Customers tab genuinely needs the live
// customers table (via lib/customers-db.ts, real since Phase 6A), since it
// reports on customers themselves, not just orders.
// ---------------------------------------------------------------------------

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

// Pure date math, no data access — doesn't need a Supabase client.
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

export async function getSalesReport(
  supabase: SupabaseClient,
  range: DateRange,
  paymentMode?: PaymentMode
): Promise<SalesReport> {
  const allOrders = await getAllOrders(supabase);
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
// Payments report — Phase 7D: rebuilt as a real per-transaction ledger over
// the payments table (supabase/migrations/0008_payments.sql), replacing the
// old one-row-per-order approximation this tab shipped with before a real
// payment log existed (see the "Data-model limitations" note further down —
// it no longer applies to this tab specifically, only to Sales/Orders,
// which still don't need per-transaction data). Still admin-client-only,
// gated on reports.view alone (see app/(shell)/reports/actions.ts).
// ---------------------------------------------------------------------------

export interface PaymentModeBreakdown {
  mode: PaymentMode;
  amount: number;
}

export interface PaymentRow {
  payment: Payment;
  orderNumber: string;
  // The order's own customerSnapshot — not a live customer record — so this
  // report still never needs customers.view (see file header).
  customer: CustomerSnapshot | undefined;
  // Resolved via lib/profiles.ts's getAppUsers, called with the same admin
  // client already used for everything else here — unlike the Order Details
  // drawer's Payment History (components/orders/payment-history-list.tsx),
  // which deliberately skips this because a plain authenticated caller's
  // RLS can't read another user's profile. Reports already bypasses that
  // RLS for its own reads, so resolving a name here is genuinely free.
  recordedByName: string | undefined;
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
  paymentType?: PaymentType;
  customerQuery?: string;
  pendingOnly?: boolean;
  overdueOnly?: boolean;
}

// Expenses total for a date range, on payment_date — powers the Payments
// tab's "Profit" stat (Collections − Expenses). Kept minimal (just a total,
// not a full report) since Expenses already has its own full ledger view on
// the Accounts page; this is only ever combined with getPaymentsReport's
// totalCollected. Returns null if the expenses migration hasn't been
// applied yet, same convention as lib/dashboard.ts's optional stat cards —
// the Profit stat just doesn't render in that case rather than showing 0
// and implying zero spend.
export async function getExpensesTotal(
  supabase: SupabaseClient,
  range: DateRange
): Promise<number | null> {
  try {
    const expenses = await getExpenses(supabase, { from: range.from, to: range.to });
    return expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  } catch (error) {
    if (isMissingExpensesSchemaError(error)) return null;
    throw error;
  }
}

export async function getPaymentsReport(
  supabase: SupabaseClient,
  filters: PaymentsFilters,
  todayIso: string
): Promise<PaymentsReport> {
  const [allOrders, allPayments, allUsers] = await Promise.all([
    getAllOrders(supabase),
    getAllPayments(supabase),
    getAppUsers(supabase),
  ]);
  const ordersById = new Map(allOrders.map((o) => [o.id, o]));
  const userNameById = new Map(allUsers.map((u) => [u.id, u.full_name]));

  // Date range now filters on when the payment was actually taken
  // (payment_date), not when its order was placed — this tab is a payment
  // ledger, so that's the date a shopkeeper actually means by "this range."
  let filtered = allPayments.filter((p) => inRange(p.paymentDate, filters.range));

  if (filters.paymentMode) {
    filtered = filtered.filter((p) => p.paymentMode === filters.paymentMode);
  }
  if (filters.paymentType) {
    filtered = filtered.filter((p) => p.paymentType === filters.paymentType);
  }
  if (filters.customerQuery?.trim()) {
    // Matches customer name/phone OR order number — Phase 7F's Payments
    // page search box needs order-no search too (a shopkeeper often knows
    // the order number, not the customer's exact name), and this filter is
    // shared with Reports' Payments tab, so both get it for free.
    const q = filters.customerQuery.trim().toLowerCase();
    filtered = filtered.filter((p) => {
      const order = ordersById.get(p.orderId);
      const c = order?.customerSnapshot;
      const matchesCustomer =
        !!c && (c.name.toLowerCase().includes(q) || c.phone.includes(q));
      const matchesOrderNo = order?.orderNumber.toLowerCase().includes(q) ?? false;
      return matchesCustomer || matchesOrderNo;
    });
  }
  // Pending/Overdue stay order-level concepts translated onto the
  // transaction list: "this payment's order still has (overdue) balance
  // outstanding," not a property of the payment itself.
  if (filters.pendingOnly) {
    filtered = filtered.filter((p) => (ordersById.get(p.orderId)?.balance ?? 0) > 0);
  }
  if (filters.overdueOnly) {
    filtered = filtered.filter((p) => {
      const order = ordersById.get(p.orderId);
      return !!order && order.balance > 0 && order.deliveryDate < todayIso;
    });
  }

  // Voided payments stay in the filtered set (so they're still visible in
  // the table, clearly marked — see payments-report-view.tsx) but are
  // excluded from every monetary total below, same rule the ledger's own
  // recompute trigger already applies to orders.advance_paid/balance.
  const counted = filtered.filter((p) => !p.voided);

  const totalCollected = counted.reduce((sum, p) => sum + p.amount, 0);
  const byMode = paymentModes
    .map((mode) => ({
      mode,
      amount: counted
        .filter((p) => p.paymentMode === mode)
        .reduce((sum, p) => sum + p.amount, 0),
    }))
    .filter((b) => b.amount > 0);

  // Distinct orders referenced by the filtered transactions, each counted
  // once regardless of how many of its payments matched the filters —
  // summing per payment row would double-count an order with more than one
  // matching transaction. orders.balance is already trigger-maintained to
  // exclude voided payments, so no extra voided-handling is needed here.
  const distinctOrders = Array.from(new Set(filtered.map((p) => p.orderId)))
    .map((id) => ordersById.get(id))
    .filter((o): o is Order => !!o);
  const outstandingBalance = distinctOrders.reduce(
    (sum, o) => sum + Math.max(o.balance, 0),
    0
  );
  const overdueBalance = distinctOrders
    .filter((o) => o.balance > 0 && o.deliveryDate < todayIso)
    .reduce((sum, o) => sum + o.balance, 0);

  const rows: PaymentRow[] = filtered.map((payment) => {
    const order = ordersById.get(payment.orderId);
    return {
      payment,
      orderNumber: order?.orderNumber ?? "—",
      customer: order?.customerSnapshot,
      recordedByName: payment.recordedBy
        ? userNameById.get(payment.recordedBy)
        : undefined,
    };
  });
  // Already newest-first from getAllPayments' own ordering — no re-sort
  // needed (unlike the old order-level version, which had to sort by
  // orderDate itself).

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

export async function getGarmentTypes(supabase: SupabaseClient): Promise<string[]> {
  const allOrders = await getAllOrders(supabase);
  const set = new Set<string>();
  allOrders.forEach((o) => o.items.forEach((i) => set.add(i.particular)));
  return Array.from(set).sort();
}

export async function getOrdersReport(
  supabase: SupabaseClient,
  filters: OrdersFilters,
  todayIso: string
): Promise<OrdersReport> {
  const weekAhead = addDays(todayIso, 7);
  const allOrders = await getAllOrders(supabase);
  const rangeOrders = allOrders.filter((o) => inRange(o.orderDate, filters.range));

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
      const c = o.customerSnapshot;
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
// Customers report — the one report that genuinely needs the live customers
// table (it reports on customers themselves, including ones with zero
// orders), via lib/customers-db.ts's real selectors (Phase 6A).
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

export async function getCustomersReport(
  supabase: SupabaseClient,
  filters: CustomersReportFilters,
  todayIso: string
): Promise<CustomersReport> {
  const listRows = await getCustomerListRows(supabase, todayIso);

  // Customer records have no createdAt timestamp, so "new" is approximated
  // from order history: a customer's first-ever order date falling inside
  // the selected range.
  const allOrders = await getAllOrders(supabase);
  const firstOrderDateByCustomer = new Map<string, string>();
  for (const o of allOrders) {
    const current = firstOrderDateByCustomer.get(o.customerId);
    if (!current || o.orderDate < current) {
      firstOrderDateByCustomer.set(o.customerId, o.orderDate);
    }
  }

  const allRows: CustomerReportRow[] = await Promise.all(
    listRows.map(async (r) => {
      const detail = await getCustomerDetail(supabase, r.customer);
      return {
        customer: r.customer,
        totalOrders: r.totalOrders,
        totalSpent: detail.totalOrdersValue,
        outstandingBalance: r.outstandingBalance,
        lastOrderDate: r.lastOrderDate,
        status: r.status,
      };
    })
  );

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

// ---------------------------------------------------------------------------
// Production report — the "Delayed job report" item from the Phase 8
// follow-up plan. Reuses lib/job-cards.ts's JobCard shape and the same
// isDelayed/stage computation already powering /job-cards and /production,
// so this stays a genuinely read-only view over the same ground truth
// rather than a second copy of the delay logic. Following the Orders tab's
// own precedent (one filterable table covers what the brainstormed spec
// called three separate reports), this single tab covers delayed jobs,
// unassigned work, and stage breakdown via one Stage filter rather than
// three separate tabs.
// ---------------------------------------------------------------------------

export type ProductionStageFilter = "all" | "unassigned" | "inProgress" | "delayed" | "ready";

export interface ProductionFilters {
  range: DateRange; // filters on the job card's due date
  stage: ProductionStageFilter;
  staffId?: string;
}

export interface ProductionReportSummary {
  totalActive: number;
  unassigned: number;
  delayed: number;
  ready: number;
}

export interface ProductionReport {
  summary: ProductionReportSummary;
  rows: JobCard[];
}

const IN_PROGRESS_STAGES: JobCardStage[] = [
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Trial",
  "Alteration",
];

// Returns null if the job cards migration hasn't been applied yet — same
// convention as lib/dashboard.ts's optional operational stat cards.
export async function getProductionReport(
  supabase: SupabaseClient,
  filters: ProductionFilters,
  todayIso: string
): Promise<ProductionReport | null> {
  try {
    const staffList = await getStaff(supabase);
    const allCards = await getJobCards(supabase, todayIso, staffList);

    const active = allCards.filter(
      (c) => c.stage !== "Delivered" && c.stage !== "Cancelled"
    );
    const summary: ProductionReportSummary = {
      totalActive: active.length,
      unassigned: active.filter((c) => c.stage === "Unassigned").length,
      delayed: active.filter((c) => c.isDelayed).length,
      ready: active.filter((c) => c.stage === "Ready").length,
    };

    let rows = allCards.filter((c) => inRange(c.deliveryDate, filters.range));
    if (filters.stage === "unassigned") {
      rows = rows.filter((c) => c.stage === "Unassigned");
    } else if (filters.stage === "delayed") {
      rows = rows.filter((c) => c.isDelayed);
    } else if (filters.stage === "ready") {
      rows = rows.filter((c) => c.stage === "Ready");
    } else if (filters.stage === "inProgress") {
      rows = rows.filter((c) => IN_PROGRESS_STAGES.includes(c.stage));
    }
    if (filters.staffId) {
      rows = rows.filter((c) => c.assignedStaffId === filters.staffId);
    }

    return { summary, rows };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Staff report — the "Staff workload/productivity" item. Deliberately built
// over job_cards.assigned_staff_id (via getJobCards), not the older
// work_assignments table lib/staff.ts's getStaffListRows reads — Job
// Cards/Production's Assign Work flow (app/(shell)/job-cards/actions.ts)
// only ever writes assigned_staff_id directly onto job_cards, so
// work_assignments stays empty for any order created after Phase 8. job_cards
// has no historical assignment log, so "completed in range" uses each card's
// own completed_date rather than a separate events table.
// ---------------------------------------------------------------------------

export interface StaffReportFilters {
  range: DateRange; // filters "completed in range" via the job card's completed date
}

export interface StaffReportRow {
  staff: Staff;
  activeJobs: number;
  delayedJobs: number;
  completedInRange: number;
  totalAssigned: number;
}

export interface StaffReportSummary {
  staffWithActiveWork: number;
  totalDelayedJobs: number;
  totalCompletedInRange: number;
}

export interface StaffReport {
  summary: StaffReportSummary;
  rows: StaffReportRow[];
}

// Returns null if the job cards migration hasn't been applied yet.
export async function getStaffReport(
  supabase: SupabaseClient,
  filters: StaffReportFilters,
  todayIso: string
): Promise<StaffReport | null> {
  try {
    const staffList = await getStaff(supabase);
    const allCards = await getJobCards(supabase, todayIso, staffList);

    const rows: StaffReportRow[] = staffList.map((member) => {
      const cardsForStaff = allCards.filter((c) => c.assignedStaffId === member.id);
      const activeJobs = cardsForStaff.filter(
        (c) => c.stage !== "Delivered" && c.stage !== "Cancelled" && c.stage !== "Ready"
      ).length;
      const delayedJobs = cardsForStaff.filter((c) => c.isDelayed).length;
      const completedInRange = cardsForStaff.filter(
        (c) => c.completedDate && inRange(c.completedDate, filters.range)
      ).length;
      return {
        staff: member,
        activeJobs,
        delayedJobs,
        completedInRange,
        totalAssigned: cardsForStaff.length,
      };
    });

    const summary: StaffReportSummary = {
      staffWithActiveWork: rows.filter((r) => r.activeJobs > 0).length,
      totalDelayedJobs: rows.reduce((sum, r) => sum + r.delayedJobs, 0),
      totalCompletedInRange: rows.reduce((sum, r) => sum + r.completedInRange, 0),
    };

    return { summary, rows };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Inventory report — the "Low-stock report" item. A point-in-time stock
// snapshot, not date-ranged (inventory_movements has dates, but on-hand
// quantity is a running total, not a per-day figure worth bucketing here).
// ---------------------------------------------------------------------------

export interface InventoryReportFilters {
  itemType?: InventoryItemType;
  lowStockOnly?: boolean;
  query?: string;
}

export interface InventoryReportRow {
  item: InventoryItem;
  value: number;
  lowStock: boolean;
}

export interface InventoryReportSummary {
  totalActiveItems: number;
  lowStockCount: number;
  totalStockValue: number;
}

export interface InventoryReport {
  summary: InventoryReportSummary;
  rows: InventoryReportRow[];
}

// Returns null if the inventory migration hasn't been applied yet.
export async function getInventoryReport(
  supabase: SupabaseClient,
  filters: InventoryReportFilters
): Promise<InventoryReport | null> {
  try {
    const allItems = await getInventoryItems(supabase);
    const active = allItems.filter((i) => i.active);

    const summary: InventoryReportSummary = {
      totalActiveItems: active.length,
      lowStockCount: active.filter((i) => i.quantityOnHand <= i.reorderLevel).length,
      totalStockValue: active.reduce(
        (sum, i) => sum + i.quantityOnHand * (i.costPerUnit ?? 0),
        0
      ),
    };

    let filtered = active;
    if (filters.itemType) filtered = filtered.filter((i) => i.itemType === filters.itemType);
    if (filters.lowStockOnly) {
      filtered = filtered.filter((i) => i.quantityOnHand <= i.reorderLevel);
    }
    if (filters.query?.trim()) {
      const q = filters.query.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.sku ?? "").toLowerCase().includes(q)
      );
    }

    const rows: InventoryReportRow[] = filtered.map((item) => ({
      item,
      value: item.quantityOnHand * (item.costPerUnit ?? 0),
      lowStock: item.quantityOnHand <= item.reorderLevel,
    }));

    return { summary, rows };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) return null;
    throw error;
  }
}
