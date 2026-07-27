import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/types";
import {
  getExpenses,
  isMissingExpensesSchemaError,
} from "@/lib/data/expenses-db";
import {
  getJobCards,
  isMissingJobCardsSchemaError,
} from "@/lib/data/job-cards-db";
import { getAllOrders } from "@/lib/data/orders-db";
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
}

export async function getDashboardData(
  supabase: SupabaseClient,
  todayIso: string
): Promise<DashboardData> {
  const allOrders = await getAllOrders(supabase);
  const activeOrders = allOrders.filter(isActiveOrder);
  const yesterdayIso = addDays(todayIso, -1);

  const ordersToday = activeOrders.filter((o) => o.orderDate === todayIso);
  const ordersYesterday = activeOrders.filter(
    (o) => o.orderDate === yesterdayIso
  );

  const todaysDeliveries = activeOrders.filter(
    (o) => o.deliveryDate === todayIso
  );
  const deliveriesPendingToday = todaysDeliveries.filter(
    isReceivableOrder
  );

  const overdueOrders = activeOrders
    .filter((o) => isReceivableOrder(o) && o.deliveryDate < todayIso)
    .map((o) => ({ ...o, daysLate: daysBetween(o.deliveryDate, todayIso) }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const paymentPending = activeOrders
    .filter(isReceivableOrder)
    .sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1));
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

  const [jobCardStats, expenseStats] = await Promise.all([
    getDashboardJobCardStats(supabase, todayIso),
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
  };
}

async function getDashboardJobCardStats(
  supabase: SupabaseClient,
  todayIso: string
): Promise<{ unassigned: number; delayed: number; productionQueue: ProductionQueueStage[] } | null> {
  try {
    const cards = await getJobCards(supabase, todayIso);
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
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
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
