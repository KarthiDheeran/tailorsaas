"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Printer, Search } from "lucide-react";
import {
  createProductionPrintBundleAction,
  createSequentialProductionPrintAction,
  getProductionPrintGarmentsAction,
  getProductionPrintHistoryAction,
  getProductionPrintOrdersAction,
  type ProductionPrintBatchSummary,
} from "@/app/(shell)/job-cards/actions";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import { formatDate } from "@/components/orders/orders-table";
import {
  GARMENT_SECTIONS,
  PRODUCTION_PRINT_GROUPS,
  type CatalogGarmentType,
  type GarmentSection,
  type ProductionPrintGroup,
} from "@/lib/catalog";
import type { Order } from "@/lib/types";

type ProductionGroupFilter = ProductionPrintGroup | "All";

function sequenceFor(order: Order) {
  if (typeof order.orderSequence === "number") return order.orderSequence;
  return /^\d+$/.test(order.orderNumber) ? Number(order.orderNumber) : null;
}

export function ProductionPrintPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [garments, setGarments] = useState<CatalogGarmentType[]>([]);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<GarmentSection>("Men");
  const [productionGroup, setProductionGroup] = useState<ProductionGroupFilter>("All");
  const [fromSequence, setFromSequence] = useState("");
  const [toSequence, setToSequence] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [sequentialPrinting, setSequentialPrinting] = useState(false);
  const [history, setHistory] = useState<ProductionPrintBatchSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    getProductionPrintOrdersAction()
      .then((result) => !cancelled && setOrders(result))
      .catch(() => !cancelled && setOrders([]));
    getProductionPrintGarmentsAction()
      .then((result) => !cancelled && setGarments(result))
      .catch(() => !cancelled && setGarments([]));
    getProductionPrintHistoryAction()
      .then((result) => !cancelled && setHistory(result))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const garmentsById = useMemo(() => new Map(garments.map((garment) => [garment.id, garment])), [garments]);
  const garmentsByName = useMemo(
    () => new Map(garments.map((garment) => [garment.name.trim().toLowerCase(), garment])),
    [garments]
  );

  const matchingProductionItems = useCallback((order: Order) => {
    if (productionGroup === "All") return order.items;
    return order.items.filter((item) => {
      const garment =
        (item.garmentTypeId ? garmentsById.get(item.garmentTypeId) : undefined) ??
        garmentsByName.get(item.particular.trim().toLowerCase());
      return garment?.productionPrintGroup === productionGroup;
    });
  }, [garmentsById, garmentsByName, productionGroup]);

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
        if (productionGroup !== "All" && matchingProductionItems(order).length === 0) return false;
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
  }, [fromSequence, fromDate, toDate, orders, query, section, toSequence, productionGroup, matchingProductionItems]);

  const ordersToPrint = selected.size > 0
    ? printableOrders.filter((order) => selected.has(order.id))
    : printableOrders;

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
    if (ordersToPrint.length === 0) return;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setPrinting(true);
    setError("");
    const result = await createProductionPrintBundleAction(ordersToPrint.map((order) => order.id), productionGroup);
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

  async function printNewOrders() {
    if (ordersToPrint.length === 0) return;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setSequentialPrinting(true);
    setError("");
    const result = await createSequentialProductionPrintAction(
      ordersToPrint.map((order) => order.id),
      productionGroup
    );
    setSequentialPrinting(false);
    if (!result.success) {
      previewWindow?.close();
      setError(result.error);
      return;
    }
    setHistory((current) => [result.data.batch, ...current.filter((batch) => batch.id !== result.data.batch.id)].slice(0, 20));
    const href = `/production-print/bundle?slipIds=${encodeURIComponent(result.data.batch.slipIds.join(","))}`;
    if (previewWindow) previewWindow.location.href = href;
    else window.open(href, "_blank", "noopener,noreferrer");
  }

  function reprintBatch(batch: ProductionPrintBatchSummary) {
    const href = `/production-print/bundle?slipIds=${encodeURIComponent(batch.slipIds.join(","))}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="w-full p-2 sm:p-3 lg:p-4">
      <div className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Production Print</h1>
        <p className="mt-1 text-base text-ink-muted">
          Print a continuous Cutting to Stitching bundle. Cut each completed Cutting slip manually.
        </p>
      </div>
      <JobCardTabs active="production-print" />
      <section className="mt-5 rounded-2xl border border-border-soft bg-white p-4 shadow-soft sm:p-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_140px_140px_110px_110px_145px_145px_auto] xl:items-end">
          <label className="relative block min-w-0 flex-1 sm:max-w-xl">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by order number, customer, or phone" className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">Order section</span><select value={section} onChange={(event) => { setSection(event.target.value as GarmentSection); setSelected(new Set()); }} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">{GARMENT_SECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">Print group</span><select value={productionGroup} onChange={(event) => { setProductionGroup(event.target.value as ProductionGroupFilter); setSelected(new Set()); }} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"><option value="All">All</option>{PRODUCTION_PRINT_GROUPS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">From no.</span><input type="number" min="1" inputMode="numeric" value={fromSequence} onChange={(event) => setFromSequence(event.target.value)} placeholder="1" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">To no.</span><input type="number" min="1" inputMode="numeric" value={toSequence} onChange={(event) => setToSequence(event.target.value)} placeholder="20" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">From date</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">To date</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <button type="button" onClick={selectFiltered} disabled={printableOrders.length === 0} className="h-11 rounded-xl border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-50">Select filtered ({printableOrders.length})</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            Range: {fromSequence || "1"} to {toSequence || "..."}. {productionGroup === "All" ? "All garment groups" : `${productionGroup} group only`}. Each item prints one quantity-based Cutting card, then one Stitching card.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void printNewOrders()} disabled={printing || sequentialPrinting || ordersToPrint.length === 0} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-white transition hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-60">{sequentialPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Print New Orders</button>
            <button type="button" onClick={() => void printBundle()} disabled={printing || sequentialPrinting || ordersToPrint.length === 0} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary bg-white px-4 text-sm font-semibold text-primary transition hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-60">{printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Reprint Selected ({ordersToPrint.length})</button>
          </div>
        </div>
        {error && <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">{error}</p>}
        {orders === null ? <p className="py-12 text-center text-sm text-ink-muted">Loading orders...</p> : (
          <div className="mt-4 overflow-x-auto rounded-md border border-[#8f9bad] bg-white shadow-none">
            <table className="min-w-[920px] w-full border-collapse text-left text-xs"><thead className="bg-[#e7edf7] text-[11px] font-bold text-ink"><tr><th className="w-12 border border-[#8f9bad] px-2 py-1"><input aria-label="Select filtered orders" type="checkbox" checked={printableOrders.length > 0 && printableOrders.every((order) => selected.has(order.id))} onChange={(event) => event.target.checked ? selectFiltered() : setSelected(new Set())} /></th><th className="border border-[#8f9bad] px-2 py-1 font-semibold">Order</th><th className="border border-[#8f9bad] px-2 py-1 font-semibold">Customer</th><th className="border border-[#8f9bad] px-2 py-1 font-semibold">Delivery</th><th className="border border-[#8f9bad] px-2 py-1 text-right font-semibold">Garments</th></tr></thead><tbody>{printableOrders.map((order) => { const items = matchingProductionItems(order); return <tr key={order.id} className="hover:bg-primary-tint/30"><td className="border border-[#aeb8c8] px-2 py-0.5"><input aria-label={`Select ${order.orderNumber}`} type="checkbox" checked={selected.has(order.id)} onChange={() => toggleOrder(order.id)} /></td><td className="border border-[#aeb8c8] px-2 py-0.5 font-semibold text-primary">{order.orderNumber}</td><td className="border border-[#aeb8c8] px-2 py-0.5"><p className="font-medium text-ink">{order.customerSnapshot?.name ?? "Customer"}</p><p className="text-xs text-ink-muted">{order.customerSnapshot?.phone ?? ""}</p></td><td className="border border-[#aeb8c8] px-2 py-0.5 text-ink-muted">{formatDate(order.deliveryDate)}</td><td className="border border-[#aeb8c8] px-2 py-0.5 text-right text-ink">{items.map((item) => `${item.particular} x${item.qty}`).join(", ")}</td></tr>; })}</tbody></table>
            {printableOrders.length === 0 && <p className="p-10 text-center text-sm text-ink-muted">No printable orders found.</p>}
          </div>
        )}
      </section>
      <section className="mt-5 rounded-2xl border border-border-soft bg-white p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold text-ink">Sequential Print History</h2></div>
        <p className="mt-1 text-xs text-ink-muted">Print New Orders skips every slip that already existed. Use Reprint for printer failures or another copy.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border-soft">
          <table className="min-w-[680px] w-full text-left text-sm"><thead className="bg-surface-muted text-xs text-ink-muted"><tr><th className="px-3 py-2">Generated</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Group</th><th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody>{history.map((batch) => <tr key={batch.id} className="border-t border-border-soft"><td className="px-3 py-2">{new Date(batch.createdAt).toLocaleString("en-IN")}</td><td className="px-3 py-2">{batch.orderSection}</td><td className="px-3 py-2">{batch.productionGroup}</td><td className="px-3 py-2 text-right font-semibold">{batch.orderCount}</td><td className="px-3 py-2 text-right"><button type="button" onClick={() => reprintBatch(batch)} className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-tint">Reprint</button></td></tr>)}</tbody></table>
          {history.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">No sequential print batches yet.</p>}
        </div>
      </section>
    </div>
  );
}
