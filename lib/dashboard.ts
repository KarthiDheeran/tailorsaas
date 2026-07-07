import type { Order } from "@/lib/types";
import { getAllOrders } from "@/lib/data/stub-data";

// Computed dashboard selectors over the stub Order data. All comparisons use
// plain YYYY-MM-DD string dates (never Date/Intl formatting) for the same
// reason orders-table.tsx avoids them: consistent server/client rendering.

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

export function getDashboardData(todayIso: string): DashboardData {
  const allOrders = getAllOrders();
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

  return {
    stats,
    todaysDeliveries,
    overdueOrders,
    trialQueue,
    paymentPending,
  };
}
