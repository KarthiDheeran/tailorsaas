import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, Order } from "@/lib/types";
import {
  getOrderListRowsForCustomer,
  getRepeatableOrdersForCustomer,
} from "@/lib/data/orders-db";
import {
  getCustomerAreaNames,
  getCustomerPageRows,
  getCustomers,
} from "@/lib/data/customers-db";
import { isActiveOrder, orderBalance } from "@/lib/order-finance";

// ---------------------------------------------------------------------------
// Phase 6A: async fork of lib/customers.ts's 3 derived selectors, reading
// real customers from lib/data/customers-db.ts. lib/customers.ts itself is
// left completely untouched — it's still imported by lib/reports.ts /
// components/reports/customers-report-view.tsx (Reports migration is
// Phase 6E, explicitly out of scope here), and making its functions async
// would break those synchronous call sites immediately.
//
// Phase 6C: order history now comes from the real, Supabase-backed
// lib/data/orders-db.ts (previously the old mock getOrdersForCustomer from
// stub-data.ts, a temporary limitation flagged since 6A/6B) — closing the
// mixed-data gap: the Customers module's list/profile pages now show live,
// accurate order-derived stats for real customers.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS
  );
}

const RECENT_WINDOW_DAYS = 90;

export type CustomerStatus = "Active" | "Inactive" | "Has Balance";

export interface CustomerListRow {
  customer: Customer;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
  firstOrderDate: string | null;
  outstandingBalance: number;
  status: CustomerStatus;
}

export interface CustomerListPageFilters {
  query?: string;
  area?: string;
  balance?: "all" | "has" | "none";
  activity?: "all" | "recent" | "inactive";
}

export interface CustomerListPageResult {
  rows: CustomerListRow[];
  totalCount: number;
  allCount: number;
}

interface CustomerOrderSummaryRow {
  customer_id: string;
  order_date: string;
  total_amount: number;
  balance: number;
  status: Order["status"];
}

function computeStatus(
  outstandingBalance: number,
  lastOrderDate: string | null,
  todayIso: string
): CustomerStatus {
  if (outstandingBalance > 0) return "Has Balance";
  if (!lastOrderDate) return "Active";
  if (
    daysBetween(lastOrderDate, todayIso) <= RECENT_WINDOW_DAYS
  ) {
    return "Active";
  }
  return "Inactive";
}

export async function getCustomerListRows(
  supabase: SupabaseClient,
  todayIso: string
): Promise<CustomerListRow[]> {
  const [customers, orderSummaryRows] = await Promise.all([
    getCustomers(supabase),
    getCustomerOrderSummaryRows(supabase),
  ]);

  const summariesByCustomerId = new Map<
    string,
    {
      totalOrders: number;
      totalSpent: number;
      lastOrderDate: string | null;
      firstOrderDate: string | null;
      outstandingBalance: number;
    }
  >();

  for (const row of orderSummaryRows) {
    const current = summariesByCustomerId.get(row.customer_id) ?? {
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: null,
      firstOrderDate: null,
      outstandingBalance: 0,
    };
    current.totalOrders += 1;
    if (isActiveOrder({ status: row.status })) {
      current.totalSpent += Number(row.total_amount || 0);
      current.firstOrderDate =
        !current.firstOrderDate || row.order_date < current.firstOrderDate
          ? row.order_date
          : current.firstOrderDate;
      current.lastOrderDate =
        !current.lastOrderDate || row.order_date > current.lastOrderDate
          ? row.order_date
          : current.lastOrderDate;
    }
    current.outstandingBalance += orderBalance({
      status: row.status,
      balance: row.balance,
    });
    summariesByCustomerId.set(row.customer_id, current);
  }

  return customers.map((customer) => {
    const summary = summariesByCustomerId.get(customer.id) ?? {
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: null,
      firstOrderDate: null,
      outstandingBalance: 0,
    };
    return {
      customer,
      totalOrders: summary.totalOrders,
      totalSpent: summary.totalSpent,
      lastOrderDate: summary.lastOrderDate,
      firstOrderDate: summary.firstOrderDate,
      outstandingBalance: summary.outstandingBalance,
      status: computeStatus(summary.outstandingBalance, summary.lastOrderDate, todayIso),
    };
  });
}

export async function getCustomerListPageRows(
  supabase: SupabaseClient,
  todayIso: string,
  input: {
    page: number;
    pageSize: number;
    filters: CustomerListPageFilters;
  }
): Promise<CustomerListPageResult> {
  if (
    input.filters.balance &&
    input.filters.balance !== "all" ||
    input.filters.activity &&
    input.filters.activity !== "all"
  ) {
    return getCustomerListPageRowsWithSummaryFilters(supabase, todayIso, input);
  }

  const [{ customers, totalCount }, allCount] = await Promise.all([
    getCustomerPageRows(supabase, {
      page: input.page,
      pageSize: input.pageSize,
      query: input.filters.query,
      area: input.filters.area,
    }),
    getCustomerCount(supabase),
  ]);
  const summaryRows = await getCustomerOrderSummaryRowsForCustomers(
    supabase,
    customers.map((customer) => customer.id)
  );
  return {
    rows: buildCustomerListRows(customers, summaryRows, todayIso),
    totalCount,
    allCount,
  };
}

async function getCustomerListPageRowsWithSummaryFilters(
  supabase: SupabaseClient,
  todayIso: string,
  input: {
    page: number;
    pageSize: number;
    filters: CustomerListPageFilters;
  }
): Promise<CustomerListPageResult> {
  const allRows = await getCustomerListRows(supabase, todayIso);
  const query = input.filters.query?.trim() ?? "";
  const lowerQuery = query.toLowerCase();
  const filtered = allRows.filter((row) => {
    if (query) {
      const matches =
        row.customer.name.toLowerCase().includes(lowerQuery) ||
        row.customer.phone.includes(query) ||
        row.customer.customerNumber.toLowerCase().includes(lowerQuery);
      if (!matches) return false;
    }
    if (input.filters.area && row.customer.area !== input.filters.area) return false;
    if (input.filters.balance === "has" && row.outstandingBalance <= 0) return false;
    if (input.filters.balance === "none" && row.outstandingBalance > 0) return false;
    if (input.filters.activity === "recent" && row.status !== "Active") return false;
    if (input.filters.activity === "inactive" && row.status !== "Inactive") return false;
    return true;
  });
  const from = Math.max(0, (input.page - 1) * input.pageSize);
  return {
    rows: filtered.slice(from, from + input.pageSize),
    totalCount: filtered.length,
    allCount: allRows.length,
  };
}

function buildCustomerListRows(
  customers: Customer[],
  orderSummaryRows: CustomerOrderSummaryRow[],
  todayIso: string
): CustomerListRow[] {
  const summariesByCustomerId = summarizeCustomerOrders(orderSummaryRows);
  return customers.map((customer) => {
    const summary = summariesByCustomerId.get(customer.id) ?? {
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: null,
      firstOrderDate: null,
      outstandingBalance: 0,
    };
    return {
      customer,
      totalOrders: summary.totalOrders,
      totalSpent: summary.totalSpent,
      lastOrderDate: summary.lastOrderDate,
      firstOrderDate: summary.firstOrderDate,
      outstandingBalance: summary.outstandingBalance,
      status: computeStatus(summary.outstandingBalance, summary.lastOrderDate, todayIso),
    };
  });
}

function summarizeCustomerOrders(orderSummaryRows: CustomerOrderSummaryRow[]) {
  const summariesByCustomerId = new Map<
    string,
    {
      totalOrders: number;
      totalSpent: number;
      lastOrderDate: string | null;
      firstOrderDate: string | null;
      outstandingBalance: number;
    }
  >();

  for (const row of orderSummaryRows) {
    const current = summariesByCustomerId.get(row.customer_id) ?? {
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: null,
      firstOrderDate: null,
      outstandingBalance: 0,
    };
    current.totalOrders += 1;
    if (isActiveOrder({ status: row.status })) {
      current.totalSpent += Number(row.total_amount || 0);
      current.firstOrderDate =
        !current.firstOrderDate || row.order_date < current.firstOrderDate
          ? row.order_date
          : current.firstOrderDate;
      current.lastOrderDate =
        !current.lastOrderDate || row.order_date > current.lastOrderDate
          ? row.order_date
          : current.lastOrderDate;
    }
    current.outstandingBalance += orderBalance({
      status: row.status,
      balance: row.balance,
    });
    summariesByCustomerId.set(row.customer_id, current);
  }

  return summariesByCustomerId;
}

async function getCustomerOrderSummaryRows(
  supabase: SupabaseClient
): Promise<CustomerOrderSummaryRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id, order_date, total_amount, balance, status");
  if (error) throw error;
  return ((data as unknown as CustomerOrderSummaryRow[]) ?? []);
}

async function getCustomerOrderSummaryRowsForCustomers(
  supabase: SupabaseClient,
  customerIds: string[]
): Promise<CustomerOrderSummaryRow[]> {
  const ids = Array.from(new Set(customerIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id, order_date, total_amount, balance, status")
    .in("customer_id", ids);
  if (error) throw error;
  return ((data as unknown as CustomerOrderSummaryRow[]) ?? []);
}

async function getCustomerOrderSummaryRowsForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<CustomerOrderSummaryRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id, order_date, total_amount, balance, status")
    .eq("customer_id", customerId);
  if (error) throw error;
  return ((data as unknown as CustomerOrderSummaryRow[]) ?? []);
}

async function getCustomerCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getCustomerAreas(supabase: SupabaseClient): Promise<string[]> {
  return getCustomerAreaNames(supabase);
}

export interface CustomerDetail {
  customer: Customer;
  orders: Order[];
  totalOrdersCount?: number;
  totalOrdersValue: number;
  totalPaid: number;
  outstandingBalance: number;
  lastOrderDate: string | null;
  lastPaymentDate: string | null;
}

export async function getCustomerDetail(
  supabase: SupabaseClient,
  customer: Customer
): Promise<CustomerDetail> {
  const orders = await getOrderListRowsForCustomer(supabase, customer.id); // newest first
  const activeOrders = orders.filter(isActiveOrder);
  const totalOrdersValue = activeOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const outstandingBalance = orders.reduce((sum, o) => sum + orderBalance(o), 0);
  const totalPaid = totalOrdersValue - outstandingBalance;
  const lastPaymentDate =
    activeOrders.find((o) => o.totalAmount - o.balance > 0)?.orderDate ?? null;

  return {
    customer,
    orders,
    totalOrdersCount: orders.length,
    totalOrdersValue,
    totalPaid,
    outstandingBalance,
    lastOrderDate: activeOrders[0]?.orderDate ?? null,
    lastPaymentDate,
  };
}

export async function getCustomerOrderEntryDetail(
  supabase: SupabaseClient,
  customer: Customer
): Promise<CustomerDetail> {
  const [orders, summaryRows] = await Promise.all([
    getRepeatableOrdersForCustomer(supabase, customer.id),
    getCustomerOrderSummaryRowsForCustomer(supabase, customer.id),
  ]);
  const activeSummaryRows = summaryRows.filter((row) =>
    isActiveOrder({ status: row.status })
  );
  const totalOrdersValue = activeSummaryRows.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0
  );
  const outstandingBalance = summaryRows.reduce(
    (sum, row) => sum + orderBalance({ status: row.status, balance: row.balance }),
    0
  );
  const lastOrderDate =
    activeSummaryRows
      .map((row) => row.order_date)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return {
    customer,
    orders,
    totalOrdersCount: summaryRows.length,
    totalOrdersValue,
    totalPaid: Math.max(totalOrdersValue - outstandingBalance, 0),
    outstandingBalance,
    lastOrderDate,
    lastPaymentDate: null,
  };
}
