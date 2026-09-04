"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, Printer, Search } from "lucide-react";
import {
  assignProductionUnitsAndCreateSlipsAction,
  getJobCardsPageDataAction,
  transferProductionUnitAndCreateSlipAction,
  type AssignedProductionUnitInput,
} from "@/app/(shell)/job-cards/actions";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import type { StaffOption } from "@/lib/data/staff-db";
import type { JobCard } from "@/lib/job-cards";
import type { TaskType } from "@/lib/types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function assignmentInput(card: JobCard, stage: TaskType): AssignedProductionUnitInput {
  return {
    orderId: card.orderId,
    orderItemSerialNo: card.item.serialNo,
    unitNo: card.unitNo,
    stage,
  };
}

function openSlipBundle(ids: string[]) {
  const href = `/production-print/bundle?slipIds=${encodeURIComponent(ids.join(","))}`;
  window.open(href, "_blank", "noopener,noreferrer");
}

export function WorkAssignmentPage() {
  const [cards, setCards] = useState<JobCard[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<TaskType>("Cutting");
  const [staffId, setStaffId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [transferCard, setTransferCard] = useState<JobCard | null>(null);
  const [transferStaffId, setTransferStaffId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  function load() {
    setLoading(true);
    getJobCardsPageDataAction(todayIso())
      .then((data) => {
        setCards(data.jobCards ?? []);
        setStaff(data.staff.filter((member) => member.status === "Active"));
      })
      .catch(() => setError("Could not load production assignments."))
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), []);

  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cards
      .filter((card) => !["Ready", "Delivered", "Cancelled"].includes(card.stage))
      .filter((card) => {
        if (!normalized) return true;
        return [card.orderNumber, card.customer?.name, card.customer?.phone, card.garment, String(card.unitNo), card.assignedTo]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized));
      })
      .sort((a, b) => b.orderNumber.localeCompare(a.orderNumber) || a.item.serialNo - b.item.serialNo || a.unitNo - b.unitNo);
  }, [cards, query]);

  const selectableCards = visibleCards.filter((card) => card.stage === "Unassigned");

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assignAndPrint() {
    const chosen = cards.filter((card) => selected.has(card.id));
    if (!staffId || chosen.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await assignProductionUnitsAndCreateSlipsAction(
      chosen.map((card) => assignmentInput(card, stage)),
      staffId
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      load();
      return;
    }
    setMessage(`${result.data.length} unit(s) assigned and replacement-safe slips created.`);
    setSelected(new Set());
    openSlipBundle(result.data.map((slip) => slip.id));
    load();
  }

  async function transferAndPrint() {
    if (!transferCard || !transferStaffId || !transferReason.trim() || !transferCard.taskType) return;
    setBusy(true);
    setError("");
    const result = await transferProductionUnitAndCreateSlipAction({
      ...assignmentInput(transferCard, transferCard.taskType),
      jobCardId: transferCard.id,
      newStaffId: transferStaffId,
      reason: transferReason,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setMessage(`Unit ${transferCard.unitNo} transferred. The old slip can no longer complete this assignment.`);
    setTransferCard(null);
    setTransferStaffId("");
    setTransferReason("");
    openSlipBundle([result.data.id]);
    load();
  }

  return (
    <div className="w-full p-2 sm:p-3 lg:p-4">
      <div className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Work Assignment</h1>
        <p className="mt-1 text-base text-ink-muted">Optionally lock exact garment units to a worker before printing. Direct production printing remains unchanged.</p>
      </div>
      <JobCardTabs active="work-assignment" />

      <section className="mt-5 rounded-2xl border border-border-soft bg-white p-4 shadow-soft">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_170px_240px_auto] xl:items-end">
          <label className="relative block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Find order or garment</span>
            <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-ink-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-border pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Order, customer, phone, garment..." />
          </label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">Stage</span><select value={stage} onChange={(event) => { setStage(event.target.value as TaskType); setSelected(new Set()); }} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="Cutting">Cutting</option><option value="Stitching">Stitching</option></select></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-ink-muted">Assign selected units to</span><select value={staffId} onChange={(event) => setStaffId(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="">Select worker</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name}</option>)}</select></label>
          <button type="button" onClick={() => void assignAndPrint()} disabled={busy || !staffId || selected.size === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Assign & Print ({selected.size})</button>
        </div>
        <p className="mt-3 rounded-lg bg-primary-tint px-3 py-2 text-xs text-primary">Assigned slips can only be tallied for their assigned worker. Unassigned slips continue using the existing selected-worker scan flow.</p>
        {error && <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-semibold text-chip-red-fg">{error}</p>}
        {message && <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success">{message}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[980px] w-full border-collapse text-left text-sm">
            <thead className="bg-surface-muted text-xs text-ink-muted"><tr><th className="p-2"><input type="checkbox" aria-label="Select all available units" checked={selectableCards.length > 0 && selectableCards.every((card) => selected.has(card.id))} onChange={(event) => setSelected(event.target.checked ? new Set(selectableCards.map((card) => card.id)) : new Set())} /></th><th className="p-2">Order</th><th className="p-2">Customer</th><th className="p-2">Garment unit</th><th className="p-2">Current stage</th><th className="p-2">Assigned worker</th><th className="p-2 text-right">Action</th></tr></thead>
            <tbody>{visibleCards.map((card) => <tr key={card.id} className="border-t border-border-soft"><td className="p-2"><input type="checkbox" aria-label={`Select ${card.jobCardNumber}`} disabled={card.stage !== "Unassigned"} checked={selected.has(card.id)} onChange={() => toggle(card.id)} /></td><td className="p-2 font-semibold text-primary">{card.orderNumber}</td><td className="p-2"><div className="font-medium text-ink">{card.customer?.name ?? "Customer"}</div><div className="text-xs text-ink-muted">{card.customer?.phone ?? ""}</div></td><td className="p-2">{card.garment} · Unit {card.unitNo}/{card.totalUnits}</td><td className="p-2">{card.stage}</td><td className="p-2 font-semibold">{card.assignedTo}</td><td className="p-2 text-right">{card.assignedStaffId && card.taskType && <button type="button" onClick={() => { setTransferCard(card); setTransferStaffId(""); setTransferReason(""); }} className="inline-flex h-9 items-center gap-1 rounded-lg border border-primary px-3 text-xs font-semibold text-primary"><ArrowRightLeft className="h-3.5 w-3.5" />Transfer</button>}</td></tr>)}</tbody>
          </table>
          {!loading && visibleCards.length === 0 && <p className="p-10 text-center text-sm text-ink-muted">No active garment units found.</p>}
          {loading && <p className="p-10 text-center text-sm text-ink-muted">Loading garment units...</p>}
        </div>
      </section>

      {transferCard && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"><button className="absolute inset-0" aria-label="Close transfer" onClick={() => setTransferCard(null)} /><div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><h2 className="text-xl font-bold text-ink">Transfer assigned work</h2><p className="mt-1 text-sm text-ink-muted">{transferCard.orderNumber} · {transferCard.garment} · Unit {transferCard.unitNo} · {transferCard.taskType}</p><p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">A replacement slip will be created. The previous slip will fail assignment validation.</p><label className="mt-4 block text-sm font-semibold text-ink">New worker<select value={transferStaffId} onChange={(event) => setTransferStaffId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-white px-3"><option value="">Select worker</option>{staff.filter((member) => member.id !== transferCard.assignedStaffId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="mt-3 block text-sm font-semibold text-ink">Reason<textarea value={transferReason} onChange={(event) => setTransferReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-border p-3 text-sm" placeholder="Why is this unit being transferred?" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTransferCard(null)} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold">Cancel</button><button type="button" onClick={() => void transferAndPrint()} disabled={busy || !transferStaffId || !transferReason.trim()} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">Transfer & Print</button></div></div></div>}
    </div>
  );
}
