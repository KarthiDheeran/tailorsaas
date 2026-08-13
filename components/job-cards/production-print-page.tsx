"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, Search } from "lucide-react";
import {
  createProductionPrintBundleAction,
  getProductionPrintOrdersAction,
} from "@/app/(shell)/job-cards/actions";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import { formatDate } from "@/components/orders/orders-table";
import { GARMENT_SECTIONS, type GarmentSection } from "@/lib/catalog";
import type { Order } from "@/lib/types";

function sequenceFor(order: Order) {
  if (typeof order.orderSequence === "number") return order.orderSequence;
  return /^\d+$/.test(order.orderNumber) ? Number(order.orderNumber) : null;
}

export function ProductionPrintPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<GarmentSection>("Men");
  const [fromSequence, setFromSequence] = useState("");
  const [toSequence, setToSequence] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProductionPrintOrdersAction()
      .then((result) => !cancelled && setOrders(result))
      .catch(() => !cancelled && setOrders([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const printableOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const from = fromSequence === "" ? null : Number(fromSequence);
    const to = toSequence === "" ? null : Number(toSequence);
    return (orders ?? [])
      .filter((order) => {
        if (["Cancelled", "Delivered"].includes(order.status)) return false;
        if (order.orderSection && order.orderSection !== section) return false;
        const sequence = sequenceFor(order);
        if (sequence === null || (from !== null && sequence < from) || (to !== null && sequence > to)) return false;
        if (fromDate && order.orderDate < fromDate) return false;
        if (toDate && order.orderDate > toDate) return false;
        if (!normalized) return true;
        return [order.orderNumber, order.customerSnapshot?.name, order.customerSnapshot?.phone]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalized));
      })
      .sort((left, right) => {
        const leftSequence = sequenceFor(left);
        const rightSequence = sequenceFor(right);
        if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) {
          return rightSequence - leftSequence;
        }
        if (leftSequence !== null && rightSequence === null) return -1;
        if (leftSequence === null && rightSequence !== null) return 1;
        return right.orderDate.localeCompare(left.orderDate) || right.orderNumber.localeCompare(left.orderNumber);
      });
  }, [fromSequence, fromDate, toDate, orders, query, section, toSequence]);

  function selectFiltered() {
    setSelected(new Set(printableOrders.map((order) => order.id)));
  }

  function toggleOrder(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function printBundle() {
    if (selected.size === 0) return;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setPrinting(true);
    setError("");
    const result = await createProductionPrintBundleAction(Array.from(selected));
    setPrinting(false);
    if (!result.success) {
      previewWindow?.close();
      setError(result.error);
      return;
    }
    const slipIds = result.data.map((slip) => slip.id).join(",");
    const href = `/production-print/bundle?slipIds=${encodeURIComponent(slipIds)}`;
    if (previewWindow) previewWindow.location.href = href;
    else window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:px-6 sm:py-5 lg:px-8">
      <div className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Production Print</h1>
        <p className="mt-1 text-base text-ink-muted">
          Print a continuous Cutting to Stitching bundle. Cut each completed Cutting slip manually.
        </p>
      </div>
      <JobCardTabs active="production-print" />
      <section className="mt-5 rounded-2xl border border-border-soft bg-white p-4 shadow-soft sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_140px_105px_105px_145px_145px_auto] lg:items-end">
          <label className="relative block min-w-0 flex-1 sm:max-w-xl">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by order number, customer, or phone" className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">Order section</span><select value={section} onChange={(event) => { setSection(event.target.value as GarmentSection); setSelected(new Set()); }} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">{GARMENT_SECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">From no.</span><input type="number" min="1" inputMode="numeric" value={fromSequence} onChange={(event) => setFromSequence(event.target.value)} placeholder="1" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">To no.</span><input type="number" min="1" inputMode="numeric" value={toSequence} onChange={(event) => setToSequence(event.target.value)} placeholder="20" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">From date</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">To date</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <button type="button" onClick={selectFiltered} disabled={printableOrders.length === 0} className="h-11 rounded-xl border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-50">Select filtered ({printableOrders.length})</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            Range: {fromSequence || "1"} to {toSequence || "..."}. Each item prints one quantity-based Cutting card, then one Stitching card.
          </p>
          <button type="button" onClick={() => void printBundle()} disabled={printing || selected.size === 0} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">{printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Print Production Bundle ({selected.size})</button>
        </div>
        {error && <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">{error}</p>}
        {orders === null ? <p className="py-12 text-center text-sm text-ink-muted">Loading orders...</p> : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border-soft">
            <table className="min-w-full text-left text-sm"><thead className="bg-surface-muted text-ink-muted"><tr><th className="w-12 px-4 py-3"><input aria-label="Select filtered orders" type="checkbox" checked={printableOrders.length > 0 && printableOrders.every((order) => selected.has(order.id))} onChange={(event) => event.target.checked ? selectFiltered() : setSelected(new Set())} /></th><th className="px-4 py-3 font-semibold">Order</th><th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Delivery</th><th className="px-4 py-3 text-right font-semibold">Garments</th></tr></thead><tbody>{printableOrders.map((order) => <tr key={order.id} className="border-t border-border-soft hover:bg-primary-tint/30"><td className="px-4 py-3"><input aria-label={`Select ${order.orderNumber}`} type="checkbox" checked={selected.has(order.id)} onChange={() => toggleOrder(order.id)} /></td><td className="px-4 py-3 font-semibold text-primary">{order.orderNumber}</td><td className="px-4 py-3"><p className="font-medium text-ink">{order.customerSnapshot?.name ?? "Customer"}</p><p className="text-xs text-ink-muted">{order.customerSnapshot?.phone ?? ""}</p></td><td className="px-4 py-3 text-ink-muted">{formatDate(order.deliveryDate)}</td><td className="px-4 py-3 text-right text-ink">{order.items.map((item) => `${item.particular} x${item.qty}`).join(", ")}</td></tr>)}</tbody></table>
            {printableOrders.length === 0 && <p className="p-10 text-center text-sm text-ink-muted">No printable orders found.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
