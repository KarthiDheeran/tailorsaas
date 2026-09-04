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

function QuickStaffAdvanceContent() {
  const staffNumberRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [staffNumber, setStaffNumber] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const date = todayIso();

  useEffect(() => {
    getQuickStaffAdvanceDataAction(date).then((data) => {
      setStaff(data.staff);
      setPayments(data.payments);
    }).catch(() => setError("Could not load staff advances."));
  }, [date]);

  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);

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
    const result = await recordStaffPaymentAction({ staffId: selectedStaff.id, date, description: "Staff advance", amount: value, paymentMode: "Cash", notes: "Quick Staff Advance" });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      amountRef.current?.focus();
      return;
    }
    setPayments((current) => [result.data, ...current]);
    setMessage(`${formatCurrency(value)} advance added for ${selectedStaff.name}.`);
    setStaffNumber("");
    setSelectedStaff(null);
    setAmount("");
    window.setTimeout(() => staffNumberRef.current?.focus(), 0);
  }

  return <div className="w-full p-2 sm:p-3 lg:p-4">
    <div className="mb-5"><h1 className="flex items-center gap-2 text-3xl font-bold text-ink"><BanknoteArrowUp className="h-7 w-7 text-primary" />Quick Staff Advance</h1><p className="mt-1 text-sm text-ink-muted">Enter staff number, amount, and save. Payment mode is Cash.</p></div>
    <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="grid items-end gap-3 lg:grid-cols-[180px_minmax(220px,1fr)_200px_auto]">
        <label className="text-sm font-semibold text-ink">Staff number<input ref={staffNumberRef} value={staffNumber} onChange={(event) => { setStaffNumber(event.target.value); setSelectedStaff(null); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); resolveStaff(); } }} inputMode="numeric" autoFocus placeholder="Example: 1" className="mt-1 h-12 w-full rounded-xl border-2 border-primary px-4 text-xl font-bold outline-none focus:ring-4 focus:ring-primary/15" /></label>
        <div className="h-12 rounded-xl bg-surface-muted px-4 py-2"><span className="block text-xs text-ink-muted">Selected staff</span><b className={selectedStaff ? "text-ink" : "text-ink-faint"}>{selectedStaff ? `${selectedStaff.staffNumber} — ${selectedStaff.name}` : "Enter staff number and press Enter"}</b></div>
        <label className="text-sm font-semibold text-ink">Advance amount<input ref={amountRef} value={amount} onChange={(event) => setAmount(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveAdvance(); } }} disabled={!selectedStaff || busy} type="number" min="0.01" step="0.01" placeholder="0" className="mt-1 h-12 w-full rounded-xl border border-border px-4 text-right text-lg font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted" /></label>
        <button type="button" onClick={() => void saveAdvance()} disabled={!selectedStaff || busy} className="flex h-12 min-w-36 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-white hover:bg-primary-dark disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add Advance</button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-sm font-semibold text-chip-red-fg">{error}</p>}
      {message && <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" />{message}</p>}
    </section>
    <section className="mt-5 rounded-2xl border border-border-soft bg-white p-5 shadow-soft"><h2 className="text-lg font-bold text-ink">Today&apos;s advances</h2>{payments.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No staff advances added today.</p> : <div className="mt-3 overflow-hidden rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-surface-muted text-left text-xs uppercase text-ink-muted"><tr><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-border-soft">{payments.map((payment) => { const member = staffById.get(payment.staffId); return <tr key={payment.id}><td className="px-4 py-3 font-semibold">{member ? `${member.staffNumber} — ${member.name}` : "Staff"}</td><td className="px-4 py-3 text-ink-muted">{payment.description}</td><td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(payment.amount)}</td></tr>; })}</tbody></table></div>}</section>
  </div>;
}

export default function QuickStaffAdvancePage() {
  return <RequirePermission permission="staff.manage"><QuickStaffAdvanceContent /></RequirePermission>;
}
