import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/types";
import {
  getExpenses,
  isMissingExpensesSchemaError,
} from "@/lib/data/expenses-db";
import {
  getCustomerFabrics,
  getInventoryItems,
  isMissingInventorySchemaError,
} from "@/lib/data/inventory-db";
import {
  getJobCards,
  isMissingJobCardsSchemaError,
} from "@/lib/data/job-cards-db";
import { getAllOrders } from "@/lib/data/orders-db";

// Phase 6E: real, Supabase-backed selector over Order data — the customer
// names/phones the leaf components (todays-deliveries.tsx etc.) show come
// from each order's own customerSnapshot, not a live customers-table join,
// so this file (and the dashboard.view permission that gates it) never
// needs to touch the customers table at all. All comparisons use plain
// YYYY-MM-DD string dates (never Date/Intl formatting) for the same reason
// orders-table.tsx avoids them: consistent server/client rendering.

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS
  );
}

export interface DashboardStat {
  label: string;
  value: string;
  sublabel: string;
  tone: "default" | "warning";
}

export interface DashboardData {
  stats: DashboardStat[];
  todaysDeliveries: Order[];
  overdueOrders: (Order & { daysLate: number })[];
  trialQueue: Order[];
  paymentPending: Order[];
}

export async function getDashboardData(
  supabase: SupabaseClient,
  todayIso: string
): Promise<DashboardData> {
  const allOrders = await getAllOrders(supabase);
  const yesterdayIso = addDays(todayIso, -1);
  const trialWindowEndIso = addDays(todayIso, 7);

  const ordersToday = allOrders.filter((o) => o.orderDate === todayIso);
  const ordersYesterday = allOrders.filter(
    (o) => o.orderDate === yesterdayIso
  );

  const todaysDeliveries = allOrders.filter(
    (o) => o.deliveryDate === todayIso
  );
  const deliveriesPendingToday = todaysDeliveries.filter(
    (o) => o.balance > 0
  );

  const overdueOrders = allOrders
    .filter((o) => o.balance > 0 && o.deliveryDate < todayIso)
    .map((o) => ({ ...o, daysLate: daysBetween(o.deliveryDate, todayIso) }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const allPendingTrials = allOrders.filter((o) => o.trialDate >= todayIso);
  const trialsToday = allPendingTrials.filter((o) => o.trialDate === todayIso);
  const trialQueue = allPendingTrials
    .filter((o) => o.trialDate <= trialWindowEndIso)
    .sort((a, b) => (a.trialDate < b.trialDate ? -1 : 1));

  const paymentPending = allOrders
    .filter((o) => o.balance > 0)
    .sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1));
  const outstandingBalanceTotal = paymentPending.reduce(
    (sum, o) => sum + o.balance,
    0
  );

  // "Revenue today" has no separate payment-transaction log in the stub data
  // model (advancePaid/balance are snapshots, not dated events), so it's
  // approximated as: new advances collected on orders placed today, plus
  // balances collected on orders delivered today (the spec's two-payment-step
  // model assumes the balance is settled at delivery).
  const revenueToday =
    ordersToday.reduce((sum, o) => sum + o.advancePaid, 0) +
    todaysDeliveries.reduce((sum, o) => sum + o.balance, 0);

  const [jobCardStats, inventoryStats, expenseStats] = await Promise.all([
    getDashboardJobCardStats(supabase, todayIso),
    getDashboardInventoryStats(supabase),
    getDashboardExpenseStats(supabase, todayIso),
  ]);

  const orderDelta = ordersToday.length - ordersYesterday.length;
  const orderDeltaLabel =
    orderDelta === 0
      ? "Same as yesterday"
      : orderDelta > 0
        ? `+${orderDelta} from yesterday`
        : `${orderDelta} from yesterday`;

  const stats: DashboardStat[] = [
    {
      label: "Orders Today",
      value: String(ordersToday.length),
      sublabel: orderDeltaLabel,
      tone: "default",
    },
    {
      label: "Deliveries Today",
      value: String(todaysDeliveries.length),
      sublabel:
        deliveriesPendingToday.length === 0
          ? "All settled"
          : `${deliveriesPendingToday.length} pending`,
      tone: "default",
    },
    {
      label: "Overdue Orders",
      value: String(overdueOrders.length),
      sublabel: overdueOrders.length === 0 ? "All clear" : "Needs action",
      tone: overdueOrders.length === 0 ? "default" : "warning",
    },
    {
      label: "Pending Trials",
      value: String(allPendingTrials.length),
      sublabel: `${trialsToday.length} today`,
      tone: "default",
    },
    {
      label: "Outstanding Balance",
      value: `₹${outstandingBalanceTotal.toLocaleString("en-IN")}`,
      sublabel: `From ${paymentPending.length} orders`,
      tone: "default",
    },
    {
      label: "Revenue Today",
      value: `₹${revenueToday.toLocaleString("en-IN")}`,
      sublabel: "Advance + balance collected",
      tone: "default",
    },
  ];

  if (jobCardStats) {
    stats.push(
      {
        label: "Unassigned Job Cards",
        value: String(jobCardStats.unassigned),
        sublabel: "Needs staff assignment",
        tone: jobCardStats.unassigned > 0 ? "warning" : "default",
      },
      {
        label: "Delayed Job Cards",
        value: String(jobCardStats.delayed),
        sublabel: "Production attention",
        tone: jobCardStats.delayed > 0 ? "warning" : "default",
      },
      {
        label: "Ready Job Cards",
        value: String(jobCardStats.ready),
        sublabel: "Ready for delivery",
        tone: "default",
      }
    );
  }

  if (inventoryStats) {
    stats.push(
      {
        label: "Low Stock Items",
        value: String(inventoryStats.lowStock),
        sublabel: "Reorder needed",
        tone: inventoryStats.lowStock > 0 ? "warning" : "default",
      },
      {
        label: "Customer Fabric",
        value: String(inventoryStats.customerFabricInCustody),
        sublabel: "Still with shop",
        tone: "default",
      }
    );
  }

  if (expenseStats) {
    stats.push({
      label: "Expenses Today",
      value: `₹${expenseStats.todayTotal.toLocaleString("en-IN")}`,
      sublabel: "Shop spending",
      tone: "default",
    });
  }

  return {
    stats,
    todaysDeliveries,
    overdueOrders,
    trialQueue,
    paymentPending,
  };
}

async function getDashboardJobCardStats(
  supabase: SupabaseClient,
  todayIso: string
): Promise<{ unassigned: number; delayed: number; ready: number } | null> {
  try {
    const cards = await getJobCards(supabase, todayIso);
    const active = cards.filter(
      (card) => card.stage !== "Cancelled" && card.stage !== "Delivered"
    );
    return {
      unassigned: active.filter((card) => card.stage === "Unassigned").length,
      delayed: active.filter((card) => card.isDelayed).length,
      ready: active.filter((card) => card.stage === "Ready").length,
    };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
    throw error;
  }
}

async function getDashboardInventoryStats(
  supabase: SupabaseClient
): Promise<{ lowStock: number; customerFabricInCustody: number } | null> {
  try {
    const [items, customerFabrics] = await Promise.all([
      getInventoryItems(supabase),
      getCustomerFabrics(supabase),
    ]);
    return {
      lowStock: items.filter(
        (item) => item.active && item.quantityOnHand <= item.reorderLevel
      ).length,
      customerFabricInCustody: customerFabrics.filter(
        (fabric) => fabric.status === "Received" || fabric.status === "In Use"
      ).length,
    };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) return null;
    throw error;
  }
}

async function getDashboardExpenseStats(
  supabase: SupabaseClient,
  todayIso: string
): Promise<{ todayTotal: number } | null> {
  try {
    const expenses = await getExpenses(supabase, {
      from: todayIso,
      to: todayIso,
    });
    return {
      todayTotal: expenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
    };
  } catch (error) {
    if (isMissingExpensesSchemaError(error)) return null;
    throw error;
  }
}
