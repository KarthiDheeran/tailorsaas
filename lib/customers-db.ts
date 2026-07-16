import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, Order } from "@/lib/types";
import { getOrdersForCustomer } from "@/lib/data/orders-db";
import { getCustomers } from "@/lib/data/customers-db";
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
  lastOrderDate: string | null;
  outstandingBalance: number;
  status: CustomerStatus;
}

interface CustomerOrderSummaryRow {
  customer_id: string;
  order_date: string;
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
    { totalOrders: number; lastOrderDate: string | null; outstandingBalance: number }
  >();

  for (const row of orderSummaryRows) {
    const current = summariesByCustomerId.get(row.customer_id) ?? {
      totalOrders: 0,
      lastOrderDate: null,
      outstandingBalance: 0,
    };
    current.totalOrders += 1;
    if (isActiveOrder({ status: row.status })) {
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
      lastOrderDate: null,
      outstandingBalance: 0,
    };
    return {
      customer,
      totalOrders: summary.totalOrders,
      lastOrderDate: summary.lastOrderDate,
      outstandingBalance: summary.outstandingBalance,
      status: computeStatus(summary.outstandingBalance, summary.lastOrderDate, todayIso),
    };
  });
}

async function getCustomerOrderSummaryRows(
  supabase: SupabaseClient
): Promise<CustomerOrderSummaryRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id, order_date, balance, status");
  if (error) throw error;
  return ((data as unknown as CustomerOrderSummaryRow[]) ?? []);
}

export async function getCustomerAreas(supabase: SupabaseClient): Promise<string[]> {
  const customers = await getCustomers(supabase);
  const areas = new Set(customers.map((c) => c.area).filter(Boolean));
  return Array.from(areas).sort();
}

export interface CustomerDetail {
  customer: Customer;
  orders: Order[];
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
  const orders = await getOrdersForCustomer(supabase, customer.id); // newest first
  const activeOrders = orders.filter(isActiveOrder);
  const totalOrdersValue = activeOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const outstandingBalance = orders.reduce((sum, o) => sum + orderBalance(o), 0);
  const totalPaid = totalOrdersValue - outstandingBalance;
  const lastPaymentDate =
    activeOrders.find((o) => o.totalAmount - o.balance > 0)?.orderDate ?? null;

  return {
    customer,
    orders,
    totalOrdersValue,
    totalPaid,
    outstandingBalance,
    lastOrderDate: activeOrders[0]?.orderDate ?? null,
    lastPaymentDate,
  };
}
