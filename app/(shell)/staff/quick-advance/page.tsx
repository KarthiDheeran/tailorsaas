"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BanknoteArrowUp, CheckCircle2, Loader2 } from "lucide-react";
import { getQuickStaffAdvanceDataAction, recordStaffPaymentAction } from "@/app/(shell)/staff/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { formatCurrency } from "@/lib/currency";
import type { StaffOption } from "@/lib/data/staff-db";
import type { StaffPayment } from "@/lib/types";

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function advanceDateTime(payment: StaffPayment) {
  const created = new Date(payment.createdAt);
  const time = Number.isNaN(created.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(created);
  const [year, month, day] = payment.date.split("-");
  return { date: year && month && day ? `${day}-${month}-${year}` : payment.date, time };
}

function QuickStaffAdvanceContent() {
  const staffNumberRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [staffNumber, setStaffNumber] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [amount, setAmount] = useState("");
  const [entryType, setEntryType] = useState<"Advance" | "Tea">("Advance");
  const [range, setRange] = useState({ from: todayIso(), to: todayIso() });
  const [filterStaffId, setFilterStaffId] = useState("");
  const [filterType, setFilterType] = useState<"" | "Advance" | "Tea">("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const date = todayIso();

  useEffect(() => {
    setLoadingHistory(true);
    getQuickStaffAdvanceDataAction({ from: range.from, to: range.to }).then((data) => {
      setStaff(data.staff);
      setPayments(data.payments);
    }).catch(() => setError("Could not load staff payments.")).finally(() => setLoadingHistory(false));
  }, [range.from, range.to]);

  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  const filteredPayments = useMemo(() => payments.filter((payment) => (!filterStaffId || payment.staffId === filterStaffId) && (!filterType || payment.entryType === filterType)), [filterStaffId, filterType, payments]);

  function resolveStaff() {
    const number = staffNumber.trim().replace(/^#/, "");
    const member = staff.find((candidate) => String(candidate.staffCode ?? candidate.staffNumber) === number || candidate.staffNumber.toLowerCase() === number.toLowerCase());
    if (!member) {
      setSelectedStaff(null);
      setError(`Active staff number ${number || "is required"} was not found.`);
      staffNumberRef.current?.select();
      return;
    }
    setSelectedStaff(member);
    setError("");
    setMessage("");
    window.setTimeout(() => amountRef.current?.focus(), 0);
  }

  async function saveAdvance() {
    const value = Number(amount);
    if (!selectedStaff) return resolveStaff();
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an advance amount greater than zero.");
      amountRef.current?.select();
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await recordStaffPaymentAction({ staffId: selectedStaff.id, date, entryType, description: entryType === "Tea" ? "Weekly tea amount" : "Staff advance", amount: value, paymentMode: "Cash", notes: `Quick Staff ${entryType}` });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      amountRef.current?.focus();
      return;
    }
    if (date >= range.from && date <= range.to) setPayments((current) => [result.data, ...current]);
    setMessage(`${formatCurrency(value)} ${entryType.toLowerCase()} added for ${selectedStaff.name}.`);
    setStaffNumber("");
    setSelectedStaff(null);
    setAmount("");
    window.setTimeout(() => staffNumberRef.current?.focus(), 0);
  }

  return <div className="w-full max-w-none bg-[#f5f8ff] p-2 pb-4 sm:px-3 sm:py-2 lg:px-4">
    <div className="mb-2 rounded-lg border border-[#c9d7ea] bg-white px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]"><h1 className="flex items-center gap-2 text-lg font-bold text-ink"><BanknoteArrowUp className="h-5 w-5 text-primary" />Quick Staff Advance</h1><p className="mt-0.5 text-xs text-ink-muted">Enter staff number, amount, and save. Payment mode is Cash.</p></div>
    <section className="rounded-lg border border-border-soft bg-white p-3 shadow-soft">
      <div className="grid items-end gap-3 lg:grid-cols-[160px_minmax(200px,1fr)_140px_180px_auto]">
        <label className="text-sm font-semibold text-ink">Staff number<input ref={staffNumberRef} value={staffNumber} onChange={(event) => { setStaffNumber(event.target.value); setSelectedStaff(null); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); resolveStaff(); } }} inputMode="numeric" autoFocus placeholder="Example: 1" className="mt-1 h-12 w-full rounded-xl border-2 border-primary px-4 text-xl font-bold outline-none focus:ring-4 focus:ring-primary/15" /></label>
        <div className="h-12 rounded-xl bg-surface-muted px-4 py-2"><span className="block text-xs text-ink-muted">Selected staff</span><b className={selectedStaff ? "text-ink" : "text-ink-faint"}>{selectedStaff ? `${selectedStaff.staffNumber} — ${selectedStaff.name}` : "Enter staff number and press Enter"}</b></div>
        <label className="text-sm font-semibold text-ink">Type<select value={entryType} onChange={(event) => setEntryType(event.target.value as "Advance" | "Tea")} className="mt-1 h-12 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold"><option value="Advance">Advance</option><option value="Tea">Tea</option></select></label>
        <label className="text-sm font-semibold text-ink">Amount<input ref={amountRef} value={amount} onChange={(event) => setAmount(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveAdvance(); } }} disabled={!selectedStaff || busy} type="number" min="0.01" step="0.01" placeholder="0" className="mt-1 h-12 w-full rounded-xl border border-border px-4 text-right text-lg font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted" /></label>
        <button type="button" onClick={() => void saveAdvance()} disabled={!selectedStaff || busy} className="flex h-12 min-w-36 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-white hover:bg-primary-dark disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add {entryType}</button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-semibold text-chip-red-fg">{error}</p>}
      {message && <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" />{message}</p>}
    </section>
    <section className="mt-2 rounded-lg border border-border-soft bg-white p-3 shadow-soft"><div className="flex flex-wrap items-end gap-2"><h2 className="mr-auto text-sm font-bold text-ink">Staff Payment History</h2><label className="text-xs font-semibold text-ink-muted">From<input type="date" value={range.from} max={range.to} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} className="ml-1 h-9 rounded-lg border border-border px-2" /></label><label className="text-xs font-semibold text-ink-muted">To<input type="date" value={range.to} min={range.from} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} className="ml-1 h-9 rounded-lg border border-border px-2" /></label><select value={filterStaffId} onChange={(event) => setFilterStaffId(event.target.value)} className="h-9 min-w-52 rounded-lg border border-border bg-white px-2 text-sm"><option value="">All Staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name}</option>)}</select><select value={filterType} onChange={(event) => setFilterType(event.target.value as "" | "Advance" | "Tea")} className="h-9 min-w-36 rounded-lg border border-border bg-white px-2 text-sm"><option value="">Advance + Tea</option><option value="Advance">Advance</option><option value="Tea">Tea</option></select></div><div className="mt-2 flex justify-end gap-5 rounded-lg bg-surface-muted px-3 py-2 text-sm"><span>Advance: <b className="text-primary">{formatCurrency(filteredPayments.filter((payment) => payment.entryType === "Advance").reduce((sum, payment) => sum + payment.amount, 0))}</b></span><span>Tea: <b className="text-violet-700">{formatCurrency(filteredPayments.filter((payment) => payment.entryType === "Tea").reduce((sum, payment) => sum + payment.amount, 0))}</b></span><span>Combined: <b>{formatCurrency(filteredPayments.reduce((sum, payment) => sum + payment.amount, 0))}</b></span></div>{loadingHistory ? <p className="mt-3 text-sm font-semibold text-primary">Loading payments…</p> : filteredPayments.length === 0 ? <p className="mt-3 text-sm text-ink-muted">No matching staff payments.</p> : <div className="mt-2 overflow-hidden rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-surface-muted text-left text-xs uppercase text-ink-muted"><tr><th className="px-3 py-2">Payment Date</th><th className="px-3 py-2">Recorded Time</th><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody className="divide-y divide-border-soft">{filteredPayments.map((payment) => { const member = staffById.get(payment.staffId); const recorded = advanceDateTime(payment); return <tr key={payment.id}><td className="px-3 py-2 font-semibold">{recorded.date}</td><td className="px-3 py-2 text-ink-muted">{recorded.time}</td><td className="px-3 py-2 font-semibold">{member ? `${member.staffNumber} — ${member.name}` : "Staff"}</td><td className="px-3 py-2"><span className={payment.entryType === "Tea" ? "rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700" : "rounded-full bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary"}>{payment.entryType}</span></td><td className="px-3 py-2 text-ink-muted">{payment.description}</td><td className="px-3 py-2 text-right font-bold text-primary">{formatCurrency(payment.amount)}</td></tr>; })}</tbody></table></div>}</section>
  </div>;
}

export default function QuickStaffAdvancePage() {
  return <RequirePermission permission="staff.manage"><QuickStaffAdvanceContent /></RequirePermission>;
}
