"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Barcode,
  ClipboardList,
  FileText,
  IndianRupee,
  Search,
  Truck,
  X,
} from "lucide-react";
import {
  deliverOrderItemsAction,
  getDeliveryCollectorsAction,
  getDeliveryDeskOrdersAction,
  getQuickDeliveryOrderAction,
  markOrderDeliveredAction,
  quickCollectAndDeliverAction,
  type DeliveryDeskOrder,
} from "@/app/(shell)/delivery/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { RecordPaymentModal } from "@/components/orders/record-payment-modal";
import {
  BalanceBadge,
  formatDate,
  OrderStatusChip,
} from "@/components/orders/orders-table";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import type { Order, PaymentMode } from "@/lib/types";
import type { StaffOption } from "@/lib/data/staff-db";
import { isReceivableOrder, orderBalance } from "@/lib/order-finance";

type DeliveryFilter = "all" | "ready" | "due" | "balance" | "clear";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return formatCurrency(value);
}

function customerLabel(row: DeliveryDeskOrder) {
  return row.customer?.name ?? row.order.customerSnapshot?.name ?? "Unknown customer";
}

function customerPhone(row: DeliveryDeskOrder) {
  return row.customer?.phone ?? row.order.customerSnapshot?.phone ?? "";
}

function itemsLabel(order: Order) {
  const pieces = order.items.reduce((sum, item) => sum + Math.max(0, item.qty - (item.deliveredQty ?? 0)), 0);
  const garments = Array.from(new Set(order.items.map((item) => item.particular))).join(", ");
  return `${pieces} pending pc${pieces === 1 ? "" : "s"}${garments ? ` - ${garments}` : ""}`;
}

function itemPendingQty(item: Order["items"][number]) {
  return Math.max(0, item.qty - (item.deliveredQty ?? 0));
}

function DeliveryStatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "blue" | "teal";
}) {
  const tones = {
    green: "bg-chip-mint text-chip-mint-fg",
    amber: "bg-chip-peach text-chip-peach-fg",
    red: "bg-chip-red text-chip-red-fg",
    blue: "bg-chip-blue text-chip-blue-fg",
    teal: "bg-secondary-soft text-secondary",
  };
  return (
    <div className="rounded-lg border border-border-soft bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-ink-faint">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function PartialDeliveryModal({
  row,
  collectors,
  busy,
  onClose,
  onSubmit,
}: {
  row: DeliveryDeskOrder;
  collectors: StaffOption[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: {
    items: Array<{ orderItemId: string; quantity: number }>;
    amount: number;
    paymentMode: PaymentMode;
    collectorStaffId: string;
  }) => void;
}) {
  const pendingItems = row.order.items.filter((item) => item.id && itemPendingQty(item) > 0);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendingItems.map((item) => [item.id!, "0"]))
  );
  const [amount, setAmount] = useState("0");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [collectorStaffId, setCollectorStaffId] = useState("");
  const [error, setError] = useState("");

  const deliverAmount = useMemo(() => {
    return pendingItems.reduce((sum, item) => {
      const qty = Number(quantities[item.id!] || 0);
      const rate = item.finalRate ?? item.rate;
      return sum + Math.max(0, qty) * rate;
    }, 0);
  }, [pendingItems, quantities]);
  const collectedAmount = Number(amount || 0);
  const balanceAfterCollection = Number.isFinite(collectedAmount)
    ? Math.max(0, row.order.balance - Math.max(0, collectedAmount))
    : row.order.balance;

  function fillAllPending() {
    setQuantities(Object.fromEntries(pendingItems.map((item) => [item.id!, String(itemPendingQty(item))])));
  }

  function handleSubmit() {
    const deliveryItems = pendingItems.map((item) => ({
      orderItemId: item.id!,
      quantity: Number(quantities[item.id!] || 0),
    }));
    const invalid = pendingItems.find((item) => {
      const qty = Number(quantities[item.id!] || 0);
      return !Number.isInteger(qty) || qty < 0 || qty > itemPendingQty(item);
    });
    if (invalid) {
      setError(`Enter a valid delivery quantity for ${invalid.particular}.`);
      return;
    }
    if (!deliveryItems.some((item) => item.quantity > 0)) {
      setError("Enter at least one item quantity to deliver.");
      return;
    }
    if (!Number.isFinite(collectedAmount) || collectedAmount < 0 || collectedAmount > row.order.balance) {
      setError("Enter a valid collected amount within the order balance.");
      return;
    }
    if (collectedAmount > 0 && !collectorStaffId) {
      setError("Select who collected the amount.");
      return;
    }
    setError("");
    onSubmit({ items: deliveryItems, amount: collectedAmount, paymentMode, collectorStaffId });
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[70] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">Deliver Items</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {row.order.orderNumber} · {customerLabel(row)} · Balance {money(row.order.balance)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-muted text-xs uppercase text-ink-faint">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-center">Ordered</th>
                <th className="px-3 py-2 text-center">Delivered</th>
                <th className="px-3 py-2 text-center">Pending</th>
                <th className="px-3 py-2 text-center">Deliver now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {pendingItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 font-semibold text-ink">{item.particular}</td>
                  <td className="px-3 py-2 text-right">{money(item.finalRate ?? item.rate)}</td>
                  <td className="px-3 py-2 text-center">{item.qty}</td>
                  <td className="px-3 py-2 text-center">{item.deliveredQty ?? 0}</td>
                  <td className="px-3 py-2 text-center font-semibold text-primary">{itemPendingQty(item)}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max={itemPendingQty(item)}
                      step="1"
                      value={quantities[item.id!]}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [item.id!]: event.target.value }))
                      }
                      className="h-9 w-20 rounded-lg border border-border px-2 text-center font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_140px_150px_160px_190px] xl:items-end">
          <div className="rounded-lg bg-surface-muted p-3 text-sm text-ink-muted">
            Selected delivery value: <span className="font-bold text-ink">{money(deliverAmount)}</span>
            <button type="button" onClick={fillAllPending} className="ml-3 text-xs font-bold text-primary hover:underline">
              Fill all pending
            </button>
          </div>
          <label className="block text-xs font-semibold text-ink-muted">
            Collected amount
            <input
              type="number"
              min="0"
              max={row.order.balance}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-right text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="rounded-lg bg-chip-orange px-3 py-2 text-right">
            <p className="text-xs font-semibold text-chip-orange-fg">Balance after collect</p>
            <p className="mt-1 text-base font-bold text-chip-orange-fg">{money(balanceAfterCollection)}</p>
          </div>
          <label className="block text-xs font-semibold text-ink-muted">
            Payment mode
            <select
              value={paymentMode}
              onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {["Cash", "GPay", "UPI", "Card", "Bank Transfer", "Cheque"].map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink-muted">
            Collected by
            <select
              value={collectorStaffId}
              onChange={(event) => setCollectorStaffId(event.target.value)}
              disabled={collectedAmount <= 0}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted"
            >
              <option value="">Select staff</option>
              {collectors.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-chip-red-fg">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-muted">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={busy} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
            Confirm Delivery
          </button>
        </div>
      </div>
    </>
  );
}

function DeliveryDeskContent() {
  const { hasPermission } = useCurrentUser();
  const canRecordPayment = hasPermission("orders.recordPayment");
  const canMarkDelivered = hasPermission("orders.edit");
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const today = todayIso();

  const [rows, setRows] = useState<DeliveryDeskOrder[]>([]);
  const [collectors, setCollectors] = useState<StaffOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<DeliveryDeskOrder | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const quickScanRef = useRef<HTMLInputElement | null>(null);
  const [quickCode, setQuickCode] = useState("");
  const [quickOrder, setQuickOrder] = useState<DeliveryDeskOrder | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickPaymentMode, setQuickPaymentMode] = useState<PaymentMode>("Cash");
  const [quickCollectorStaffId, setQuickCollectorStaffId] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickMessage, setQuickMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    Promise.all([getDeliveryDeskOrdersAction(), getDeliveryCollectorsAction()])
      .then(([result, staff]) => {
        if (cancelled) return;
        setRows(result);
        setCollectors(staff);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load delivery desk."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [today]);

  const stats = useMemo(() => {
    const ready = rows.filter((row) => row.order.status === "Ready");
    const dueOrOverdue = rows.filter((row) => row.order.deliveryDate <= today);
    const balanceDue = rows.reduce((sum, row) => sum + orderBalance(row.order), 0);
    const canDeliver = ready;
    return {
      ready: ready.length,
      dueOrOverdue: dueOrOverdue.length,
      balanceDue,
      canDeliver: canDeliver.length,
    };
  }, [rows, today]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const order = row.order;
      if (dateRange.from && order.deliveryDate < dateRange.from) return false;
      if (dateRange.to && order.deliveryDate > dateRange.to) return false;
      if (filter === "ready" && order.status !== "Ready") return false;
      if (filter === "due" && order.deliveryDate > today) return false;
      if (filter === "balance" && !isReceivableOrder(order)) return false;
      if (filter === "clear" && !(order.status === "Ready" && order.balance <= 0)) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        order.orderNumber,
        customerLabel(row),
        customerPhone(row),
        row.customer?.area ?? order.customerSnapshot?.area ?? "",
        order.items.map((item) => item.particular).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, filter, today, dateRange]);

  function replaceOrder(order: Order) {
    setRows((current) =>
      current.map((row) => (row.order.id === order.id ? { ...row, order } : row))
    );
  }

  function removeOrder(orderId: string) {
    setRows((current) => current.filter((row) => row.order.id !== orderId));
  }

  function focusQuickScanField() {
    window.setTimeout(() => quickScanRef.current?.focus(), 0);
  }

  function markDelivered(orderId: string) {
    setPendingOrderId(orderId);
    startTransition(async () => {
      const result = await markOrderDeliveredAction(orderId);
      setPendingOrderId(null);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      removeOrder(result.data.id);
    });
  }

  async function scanQuickDelivery(rawCode = quickCode) {
    const value = rawCode.trim();
    if (!value || quickBusy) {
      focusQuickScanField();
      return;
    }
    setQuickBusy(true);
    setQuickMessage("");
    try {
      const result = await getQuickDeliveryOrderAction(value);
      if (!result.success) {
        setQuickOrder(null);
        setQuickMessage(`Scanned ${value}: ${result.error}`);
        return;
      }
      setQuickOrder(result.data);
      setQuickAmount(String(Math.max(0, result.data.order.balance)));
      setQuickCode("");
      if (quickScanRef.current) quickScanRef.current.value = "";
    } finally {
      setQuickBusy(false);
      focusQuickScanField();
    }
  }

  function deliverItems(
    row: DeliveryDeskOrder,
    delivery: {
      items: Array<{ orderItemId: string; quantity: number }>;
      amount: number;
      paymentMode: PaymentMode;
      collectorStaffId: string;
    }
  ) {
    setPendingOrderId(row.order.id);
    startTransition(async () => {
      const result = await deliverOrderItemsAction({
        orderId: row.order.id,
        items: delivery.items,
        amount: delivery.amount,
        paymentMode: delivery.paymentMode,
        collectorStaffId: delivery.collectorStaffId,
        notes: "Delivery desk item handover",
      });
      setPendingOrderId(null);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      if (result.data.status === "Delivered") {
        removeOrder(result.data.id);
      } else {
        replaceOrder(result.data);
      }
      setDeliveryOrder(null);
    });
  }

  async function collectAndDeliver() {
    if (!quickOrder || quickBusy) return;
    const amount = Number(quickAmount || 0);
    setQuickBusy(true);
    setQuickMessage("");
    try {
      const result = await quickCollectAndDeliverAction({
        orderId: quickOrder.order.id,
        amount,
        paymentMode: quickPaymentMode,
        collectorStaffId: quickCollectorStaffId,
        notes: "Quick delivery scan",
      });
      if (!result.success) {
        setQuickMessage(`Order ${quickOrder.order.orderNumber}: ${result.error}`);
        return;
      }
      removeOrder(result.data.id);
      setQuickMessage(`${result.data.orderNumber} collected and delivered successfully.`);
      setQuickOrder(null);
      setQuickAmount("");
      setQuickCollectorStaffId("");
      setQuickCode("");
      if (quickScanRef.current) quickScanRef.current.value = "";
    } finally {
      setQuickBusy(false);
      focusQuickScanField();
    }
  }

  return (
    <div className="w-full p-2 sm:p-3 lg:p-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Delivery Desk</h1>
          <p className="text-sm text-ink-muted">
            Settle balances and hand over ready customer orders.
          </p>
        </div>
        <Link
          href="/orders"
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <ClipboardList className="h-4 w-4" />
          Orders
        </Link>
      </div>

      <section className="mb-5 rounded-2xl border border-border-soft bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Barcode className="h-5 w-5 text-primary" />Quick Delivery Scan</h2>
            <p className="mt-0.5 text-sm text-ink-muted">Scan the customer receipt, collect any balance, and deliver the full cover.</p>
          </div>
          {quickBusy && <span className="rounded-full bg-primary-tint px-3 py-1 text-sm font-semibold text-primary">Processing…</span>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void scanQuickDelivery(quickScanRef.current?.value ?? quickCode); }} className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="relative block min-w-0 flex-1">
            <span className="mb-1 block text-xs font-semibold text-ink-muted">Receipt barcode / Order number</span>
            <Barcode className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-ink-faint" />
            <input ref={quickScanRef} value={quickCode} onChange={(event) => setQuickCode(event.target.value)} disabled={quickBusy} placeholder="Scan receipt barcode or enter 1" autoComplete="off" data-raw-barcode-input="true" className="h-11 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted" />
          </label>
          <button type="submit" disabled={quickBusy || !quickCode.trim()} className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">Find Order</button>
        </form>
        {quickMessage && <p className={`mt-3 text-sm font-semibold ${quickOrder ? "text-primary" : quickMessage.includes("successfully") ? "text-success" : "text-chip-red-fg"}`}>{quickMessage}</p>}
        {quickOrder && (
          <div className="mt-4 grid gap-3 rounded-xl border border-primary/20 bg-primary-tint/40 p-4 xl:grid-cols-[minmax(0,1fr)_140px_160px_190px_auto] xl:items-end">
            <div>
              <p className="font-bold text-primary">{quickOrder.order.orderNumber} · {customerLabel(quickOrder)}</p>
              <p className="mt-1 text-sm text-ink-muted">{itemsLabel(quickOrder.order)}</p>
              <p className="mt-1 text-sm font-semibold text-ink">Cover location: <span className="text-primary">{quickOrder.order.deliveryBin ?? "Not specified"}</span></p>
              <p className="mt-1 text-sm text-ink-muted">Outstanding balance: <span className="font-bold text-ink">{money(quickOrder.order.balance)}</span></p>
            </div>
            <label className="block text-xs font-semibold text-ink-muted">Collected amount<input type="number" min="0" max={quickOrder.order.balance} step="0.01" value={quickAmount} onChange={(event) => setQuickAmount(event.target.value)} disabled={quickBusy} className="mt-1 h-11 w-full rounded-lg border border-border bg-white px-3 text-right text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
            <label className="block text-xs font-semibold text-ink-muted">Payment mode<select value={quickPaymentMode} onChange={(event) => setQuickPaymentMode(event.target.value as PaymentMode)} disabled={quickBusy} className="mt-1 h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">{["Cash", "GPay", "UPI", "Card", "Bank Transfer", "Cheque"].map((mode) => <option key={mode}>{mode}</option>)}</select></label>
            <label className="block text-xs font-semibold text-ink-muted">Collected by<select value={quickCollectorStaffId} onChange={(event) => setQuickCollectorStaffId(event.target.value)} disabled={quickBusy || Number(quickAmount || 0) <= 0} className="mt-1 h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted"><option value="">Select staff</option>{collectors.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name}</option>)}</select></label>
            <button type="button" onClick={() => void collectAndDeliver()} disabled={quickBusy || (Number(quickAmount || 0) > 0 && !quickCollectorStaffId)} className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">Collect & Deliver</button>
          </div>
        )}
      </section>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DeliveryStatCard icon={Truck} label="Ready for handover" value={String(stats.ready)} tone="teal" />
        <DeliveryStatCard icon={ClipboardList} label="Due or overdue" value={String(stats.dueOrOverdue)} tone="amber" />
        <DeliveryStatCard icon={IndianRupee} label="Balance to collect" value={money(stats.balanceDue)} tone="red" />
        <DeliveryStatCard icon={CheckCircle2} label="Clear to deliver" value={String(stats.canDeliver)} tone="blue" />
      </div>

      <div className="mb-4 rounded-lg border border-border-soft bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="Search order, customer, phone, area, or garment"
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Delivery from date" type="date" value={dateRange.from} onChange={(event) => setDateRange((value) => ({ ...value, from: event.target.value }))} className="h-10 rounded-lg border border-border bg-white px-3 text-sm" />
            <input aria-label="Delivery to date" type="date" value={dateRange.to} onChange={(event) => setDateRange((value) => ({ ...value, to: event.target.value }))} className="h-10 rounded-lg border border-border bg-white px-3 text-sm" />
            {[
              ["all", "All"],
              ["ready", "Ready"],
              ["due", "Due"],
              ["balance", "Balance"],
              ["clear", "Clear"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as DeliveryFilter)}
                className={cn(
                  "h-10 rounded-lg border px-3 text-sm font-semibold transition-colors",
                  filter === key
                    ? "border-primary bg-primary-tint text-primary"
                    : "border-border bg-white text-ink-muted hover:bg-surface-muted hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError && <LoadError message={loadError} />}
      {!loaded ? (
        <LoadingState label="Loading delivery desk..." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#8f9bad] bg-white shadow-none">
          <table className="w-full min-w-[1180px] border-collapse text-xs">
            <thead className="bg-[#e7edf7] text-left text-[11px] font-bold text-ink">
              <tr>
                <th className="border border-[#8f9bad] px-2 py-1">Order</th>
                <th className="border border-[#8f9bad] px-2 py-1">Customer</th>
                <th className="border border-[#8f9bad] px-2 py-1">Items</th>
                <th className="border border-[#8f9bad] px-2 py-1">Delivery</th>
                <th className="border border-[#8f9bad] px-2 py-1">Status</th>
                <th className="border border-[#8f9bad] px-2 py-1 text-right">Total</th>
                <th className="border border-[#8f9bad] px-2 py-1 text-right">Balance</th>
                <th className="border border-[#8f9bad] px-2 py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="border border-[#aeb8c8] px-3 py-8 text-center text-sm text-ink-muted">
                    No delivery desk orders match this view.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const order = row.order;
                  const phone = customerPhone(row);
                  const canDeliverNow = order.status === "Ready";
                  const deliverDisabled = !canMarkDelivered || !canDeliverNow || pendingOrderId === order.id || isPending;
                  return (
                    <tr key={order.id} className="hover:bg-surface-muted/60">
                      <td className="border border-[#aeb8c8] px-2 py-0.5">
                        <Link
                          href={`/orders?view=${order.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <div className="mt-1 text-xs text-ink-faint">
                          Ordered {formatDate(order.orderDate)}
                        </div>
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5">
                        <div className="font-medium text-ink">{customerLabel(row)}</div>
                        <div className="mt-1 text-xs text-ink-faint">{phone || "No phone"}</div>
                      </td>
                      <td className="max-w-[320px] truncate border border-[#aeb8c8] px-2 py-0.5 text-ink-muted">
                        {itemsLabel(order)}
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5">
                        <div className="font-medium text-ink">{formatDate(order.deliveryDate)}</div>
                        {order.deliveryDate < today && (
                          <div className="mt-1 text-xs font-semibold text-chip-red-fg">Overdue</div>
                        )}
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5">
                        <OrderStatusChip status={order.status} />
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-right font-medium text-ink">
                        {money(order.totalAmount)}
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-right">
                        <BalanceBadge order={order} todayIso={today} />
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {phone && (
                            <ContactActions
                              phone={phone}
                              message={`Hello ${customerLabel(row)}, your order ${order.orderNumber} is ready for delivery.`}
                              contextType="Order"
                              contextId={order.id}
                            />
                          )}
                          {canPrintReceipt && (
                            <Link
                              href={`/orders/${order.id}/print/customer`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Receipt"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {canRecordPayment && isReceivableOrder(order) && (
                            <button
                              type="button"
                              onClick={() => setPaymentOrder(order)}
                              className="h-8 rounded-lg border border-border px-3 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                            >
                              Collect
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={deliverDisabled}
                            title={
                              !canMarkDelivered
                                ? "No permission"
                                : order.status !== "Ready"
                                  ? "Order is not ready"
                                  : "Mark delivered"
                            }
                            onClick={() => {
                              if (order.items.length <= 1 && itemPendingQty(order.items[0]) <= 1) {
                                markDelivered(order.id);
                              } else {
                                setDeliveryOrder(row);
                              }
                            }}
                            className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Deliver
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {paymentOrder && (
        <RecordPaymentModal
          order={paymentOrder}
          collectors={collectors}
          onClose={() => setPaymentOrder(null)}
          onRecorded={({ order }) => {
            replaceOrder(order);
            setPaymentOrder(null);
          }}
        />
      )}
      {deliveryOrder && (
        <PartialDeliveryModal
          row={deliveryOrder}
          collectors={collectors}
          busy={pendingOrderId === deliveryOrder.order.id || isPending}
          onClose={() => setDeliveryOrder(null)}
          onSubmit={(delivery) => deliverItems(deliveryOrder, delivery)}
        />
      )}
    </div>
  );
}

export default function DeliveryPage() {
  return (
    <RequirePermission permission="delivery.view">
      <DeliveryDeskContent />
    </RequirePermission>
  );
}
