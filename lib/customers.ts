import type { Customer, Order } from "@/lib/types";
import { getCustomers, getOrdersForCustomer } from "@/lib/data/stub-data";

// Same string-based date math as lib/dashboard.ts (see CLAUDE.md's date
// formatting gotcha) — never Date/Intl locale APIs, to avoid server/client
// hydration mismatches.
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS
  );
}

// A customer counts as "Active" if they've ordered within this many days.
const RECENT_WINDOW_DAYS = 90;

export type CustomerStatus = "Active" | "Inactive" | "Has Balance";

export interface CustomerListRow {
  customer: Customer;
  totalOrders: number;
  lastOrderDate: string | null;
  outstandingBalance: number;
  status: CustomerStatus;
}

function computeStatus(
  outstandingBalance: number,
  lastOrderDate: string | null,
  todayIso: string
): CustomerStatus {
  // Owing money always takes priority over the recency-based label.
  if (outstandingBalance > 0) return "Has Balance";
  if (
    lastOrderDate &&
    daysBetween(lastOrderDate, todayIso) <= RECENT_WINDOW_DAYS
  ) {
    return "Active";
  }
  return "Inactive";
}

export function getCustomerListRows(todayIso: string): CustomerListRow[] {
  return getCustomers().map((customer) => {
    const customerOrders = getOrdersForCustomer(customer.id);
    const lastOrderDate = customerOrders[0]?.orderDate ?? null;
    const outstandingBalance = customerOrders.reduce(
      (sum, o) => sum + o.balance,
      0
    );
    return {
      customer,
      totalOrders: customerOrders.length,
      lastOrderDate,
      outstandingBalance,
      status: computeStatus(outstandingBalance, lastOrderDate, todayIso),
    };
  });
}

export function getCustomerAreas(): string[] {
  const areas = new Set(getCustomers().map((c) => c.area).filter(Boolean));
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

export function getCustomerDetail(customer: Customer): CustomerDetail {
  const orders = getOrdersForCustomer(customer.id); // newest first
  const totalOrdersValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const outstandingBalance = orders.reduce((sum, o) => sum + o.balance, 0);
  const totalPaid = totalOrdersValue - outstandingBalance;
  // There's no standalone payment-transaction log in the stub data model
  // (advancePaid/balance are snapshots, not dated events — same limitation
  // lib/dashboard.ts notes for revenueToday), so "last payment" is
  // approximated as the most recent order with any amount paid against it.
  const lastPaymentDate =
    orders.find((o) => o.totalAmount - o.balance > 0)?.orderDate ?? null;

  return {
    customer,
    orders,
    totalOrdersValue,
    totalPaid,
    outstandingBalance,
    lastOrderDate: orders[0]?.orderDate ?? null,
    lastPaymentDate,
  };
}
