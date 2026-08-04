import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/types";
import {
  getExpenses,
  isMissingExpensesSchemaError,
} from "@/lib/data/expenses-db";
import {
  getJobCardReportRows,
  isMissingJobCardsSchemaError,
} from "@/lib/data/job-cards-db";
import {
  getOrderDatesByIds,
  getOrderListRowsInDateRange,
  getReceivableOrderListRows,
} from "@/lib/data/orders-db";
import { formatCurrency } from "@/lib/currency";
import { isActiveOrder, isReceivableOrder } from "@/lib/order-finance";
import type { ProductionQueueStage } from "@/components/dashboard/production-queue";

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
  paymentPending: Order[];
  productionQueue: ProductionQueueStage[];
  garmentSummary: { garment: string; stage: string; quantity: number }[];
  garmentStages: string[];
}

export async function getDashboardData(
  supabase: SupabaseClient,
  todayIso: string,
  filters?: { from?: string; to?: string; stage?: string }
): Promise<DashboardData> {
  const yesterdayIso = addDays(todayIso, -1);
  const [
    ordersTodaySource,
    ordersYesterdaySource,
    deliveriesTodaySource,
    receivableOrders,
    dashboardCards,
    expenseStats,
  ] = await Promise.all([
    getOrderListRowsInDateRange(supabase, "order_date", todayIso, todayIso),
    getOrderListRowsInDateRange(supabase, "order_date", yesterdayIso, yesterdayIso),
    getOrderListRowsInDateRange(supabase, "delivery_date", todayIso, todayIso),
    getReceivableOrderListRows(supabase),
    getDashboardJobCards(supabase, todayIso),
    getDashboardExpenseStats(supabase, todayIso),
  ]);

  const ordersToday = ordersTodaySource.filter(isActiveOrder);
  const ordersYesterday = ordersYesterdaySource.filter(isActiveOrder);

  const todaysDeliveries = deliveriesTodaySource.filter(isActiveOrder);
  const deliveriesPendingToday = todaysDeliveries.filter(
    isReceivableOrder
  );

  const overdueOrders = receivableOrders
    .filter((o) => o.deliveryDate < todayIso)
    .map((o) => ({ ...o, daysLate: daysBetween(o.deliveryDate, todayIso) }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const paymentPending = receivableOrders;
  const outstandingBalanceTotal = paymentPending.reduce(
    (sum, o) => sum + o.balance,
    0
  );

  // "Collected today" has no separate payment-transaction log in the stub data
  // model (advancePaid/balance are snapshots, not dated events), so it's
  // approximated as: new advances collected on orders placed today, plus
  // balances collected on orders delivered today (the spec's two-payment-step
  // model assumes the balance is settled at delivery).
  const collectedToday =
    ordersToday.reduce((sum, o) => sum + o.advancePaid, 0) +
    todaysDeliveries.reduce((sum, o) => sum + o.balance, 0);

  const jobCardStats = dashboardCards
    ? getDashboardJobCardStats(dashboardCards)
    : null;
  const summaryFrom = filters?.from || todayIso;
  const summaryTo = filters?.to || todayIso;
  let garmentSummary: DashboardData["garmentSummary"] = [];
  let garmentStages: string[] = [];
  if (dashboardCards) {
    const cards = dashboardCards;
    const orderDates = await getOrderDatesByIds(
      supabase,
      cards.map((card) => card.orderId)
    );
    garmentStages = Array.from(new Set(cards.map((card) => card.stage))).sort();
    const grouped = new Map<string, DashboardData["garmentSummary"][number]>();
    for (const card of cards) {
      const orderDate = orderDates.get(card.orderId) ?? "";
      if (orderDate < summaryFrom || orderDate > summaryTo) continue;
      if (filters?.stage && filters.stage !== "all" && card.stage !== filters.stage) continue;
      const key = `${card.garment}\u0000${card.stage}`;
      const row = grouped.get(key) ?? { garment: card.garment, stage: card.stage, quantity: 0 };
      row.quantity += 1;
      grouped.set(key, row);
    }
    garmentSummary = Array.from(grouped.values()).sort((a, b) => a.garment.localeCompare(b.garment) || a.stage.localeCompare(b.stage));
  }

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
      label: "Outstanding Balance",
      value: formatCurrency(outstandingBalanceTotal),
      sublabel: `From ${paymentPending.length} orders`,
      tone: "default",
    },
    {
      label: "Collected Today",
      value: formatCurrency(collectedToday),
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
      }
    );
  }

  if (expenseStats) {
    stats.push({
      label: "Expenses Today",
      value: formatCurrency(expenseStats.todayTotal),
      sublabel: "Shop spending",
      tone: "default",
    });
  }

  return {
    stats,
    todaysDeliveries,
    overdueOrders,
    paymentPending,
    productionQueue: jobCardStats?.productionQueue ?? [],
    garmentSummary,
    garmentStages,
  };
}

async function getDashboardJobCards(
  supabase: SupabaseClient,
  todayIso: string
): Promise<Awaited<ReturnType<typeof getJobCardReportRows>> | null> {
  try {
    return await getJobCardReportRows(supabase, todayIso);
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
    throw error;
  }
}

function getDashboardJobCardStats(
  cards: Awaited<ReturnType<typeof getJobCardReportRows>>
): { unassigned: number; delayed: number; productionQueue: ProductionQueueStage[] } {
  const active = cards.filter(
    (card) => card.stage !== "Cancelled" && card.stage !== "Delivered"
  );
  const pendingByStage = new Map<string, ProductionQueueStage>();
  for (const card of active) {
    if (card.stage === "Ready") continue;
    const current = pendingByStage.get(card.stage) ?? {
      stage: card.stage,
      count: 0,
      delayedCount: 0,
    };
    current.count += 1;
    if (card.isDelayed) current.delayedCount += 1;
    pendingByStage.set(card.stage, current);
  }
  return {
    unassigned: active.filter((card) => card.stage === "Unassigned").length,
    delayed: active.filter((card) => card.isDelayed).length,
    productionQueue: Array.from(pendingByStage.values()).sort(
      (a, b) => b.count - a.count || a.stage.localeCompare(b.stage)
    ),
  };
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
