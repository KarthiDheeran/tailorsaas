"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Barcode, CheckCircle2, Loader2 } from "lucide-react";
import { confirmWorkAssignmentScanAction, getQuickTallyStaffAction, previewWorkAssignmentScanAction, type WorkAssignmentScanPreview } from "@/app/(shell)/job-cards/actions";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import type { StaffOption } from "@/lib/data/staff-db";
import type { TaskType } from "@/lib/types";

export function WorkAssignmentScanPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState("");
  const [stage, setStage] = useState<TaskType>("Cutting");
  const [mode, setMode] = useState<"assign" | "reassign">("assign");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<WorkAssignmentScanPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => { getQuickTallyStaffAction().then(setStaff).catch(() => setStaff([])); }, []);
  function focusScanner() { window.setTimeout(() => inputRef.current?.focus(), 0); }

  async function save(current: WorkAssignmentScanPreview, scannedCode: string, transferReason = "") {
    setBusy(true); setError("");
    const result = await confirmWorkAssignmentScanAction({ code: scannedCode || current.slip.slipCode, staffId, stage, mode, reason: transferReason });
    setBusy(false);
    if (!result.success) { setError(result.error); focusScanner(); return; }
    setSessionCount((count) => count + result.data.quantity);
    setMessage(`${result.data.slipCode}: ${result.data.garmentType} - ${result.data.quantity} assigned to ${result.data.staffName}.`);
    setPreview(null); setReason("");
    if (inputRef.current) inputRef.current.value = "";
    focusScanner();
  }

  async function scan(raw: string) {
    const normalized = raw.trim();
    if (!normalized || busy || !staffId) { if (!staffId) setError("Select a worker before scanning."); focusScanner(); return; }
    setBusy(true); setError(""); setMessage("");
    if (inputRef.current) inputRef.current.value = "";
    const result = await previewWorkAssignmentScanAction(normalized, staffId, stage);
    setBusy(false);
    if (!result.success) { setError(result.error); focusScanner(); return; }
    if (mode === "assign" && result.data.slip.staffId) { setError(result.data.slip.staffId === staffId ? `Already assigned to ${result.data.targetStaffName}.` : `Already assigned to ${result.data.currentStaffName}. Select Change Assignment mode.`); focusScanner(); return; }
    if (mode === "reassign" && !result.data.slip.staffId) { setError("This slip is unassigned. Use Assign mode."); focusScanner(); return; }
    if (mode === "assign") await save(result.data, normalized);
    else setPreview(result.data);
  }

  return <div className="w-full p-2 sm:p-3 lg:p-4">
    <div className="mb-5"><h1 className="text-3xl font-bold tracking-tight text-ink">Work Assignment Scan</h1><p className="mt-1 text-base text-ink-muted">Select a worker and stage, then scan production slips. No payment information is shown.</p></div>
    <JobCardTabs active="work-assignment" />
    <section className="mt-5 rounded-2xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="grid items-end gap-3 lg:grid-cols-[minmax(220px,1fr)_170px_250px_minmax(300px,1.35fr)]">
        <label className="text-sm font-semibold text-ink">Worker<select value={staffId} disabled={busy || Boolean(preview)} onChange={(e) => { setStaffId(e.target.value); setSessionCount(0); focusScanner(); }} className="mt-1 h-12 w-full rounded-xl border border-border bg-white px-3"><option value="">Select worker</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Stage<select value={stage} disabled={busy || Boolean(preview)} onChange={(e) => { setStage(e.target.value as TaskType); setSessionCount(0); focusScanner(); }} className="mt-1 h-12 w-full rounded-xl border border-border bg-white px-3"><option value="Cutting">Cutting</option><option value="Stitching">Stitching</option></select></label>
        <div><span className="text-sm font-semibold text-ink">Mode</span><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" disabled={busy || Boolean(preview)} onClick={() => { setMode("assign"); focusScanner(); }} className={`h-12 rounded-xl border text-sm font-semibold ${mode === "assign" ? "border-primary bg-primary text-white" : "border-border"}`}>Assign</button><button type="button" disabled={busy || Boolean(preview)} onClick={() => { setMode("reassign"); focusScanner(); }} className={`h-12 rounded-xl border text-sm font-semibold ${mode === "reassign" ? "border-primary bg-primary text-white" : "border-border"}`}>Change Assignment</button></div></div>
        <form onSubmit={(e) => { e.preventDefault(); void scan(inputRef.current?.value ?? ""); }}><label className="block text-sm font-semibold text-ink">Scan barcode / slip code<span className="relative mt-1 block"><Barcode className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" /><input ref={inputRef} disabled={!staffId || busy || Boolean(preview)} onKeyDown={(e) => { if (e.key !== "Tab") return; e.preventDefault(); void scan(e.currentTarget.value); }} autoFocus autoComplete="off" data-raw-barcode-input="true" placeholder="Scan production barcode" className="h-12 w-full rounded-xl border-2 border-primary pl-12 pr-4 text-base font-semibold outline-none focus:ring-4 focus:ring-primary/15" /></span></label></form>
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-3 rounded-xl bg-surface-muted p-3 text-sm"><span className="text-ink-muted">{mode === "assign" ? "Unassigned slips are saved immediately." : "Review the current assignment and enter a reason."}</span><b className="text-primary">Session assigned: {sessionCount} unit(s)</b></div>
      {busy && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary"><Loader2 className="h-4 w-4 animate-spin" />Checking production slip…</p>}
      {error && <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-semibold text-chip-red-fg">{error}</p>}
      {message && <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" />{message}</p>}
    </section>
    {preview && mode === "reassign" && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Change Assignment</h2></div><div className="mt-4 grid gap-2 rounded-xl bg-surface-muted p-4 text-sm"><p><b>Order:</b> {preview.slip.orderNumber}</p><p><b>Garment:</b> {preview.slip.garmentType} - {preview.slip.quantity}</p><p><b>Stage:</b> {preview.slip.stage}</p><p><b>{preview.currentStaffName}</b> → <b className="text-primary">{preview.targetStaffName}</b></p></div><label className="mt-4 block text-sm font-semibold">Reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-border p-3" placeholder="Reason for changing this assignment" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setPreview(null); setReason(""); focusScanner(); }} className="h-10 rounded-lg border border-border px-4 font-semibold">Cancel</button><button type="button" disabled={busy || !reason.trim()} onClick={() => void save(preview, preview.slip.slipCode, reason)} className="h-10 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-50">Confirm Change</button></div></div></div>}
  </div>;
}
