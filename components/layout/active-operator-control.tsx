"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, UserRound } from "lucide-react";
import { getActiveOperatorStaffAction, getOperatorModeAction, startOperatorSessionAction, type ActiveOperator } from "@/app/(shell)/settings/operator-actions";

export function ActiveOperatorControl() {
  const [enabled, setEnabled] = useState(false);
  const [operator, setOperator] = useState<ActiveOperator>();
  const [staff, setStaff] = useState<{ id: string; name: string; staff_number: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffLoadError, setStaffLoadError] = useState("");

  // Selecting an operator is a deliberate shop action. Do not interrupt every
  // page refresh with the PIN dialog; the header control remains available.
  useEffect(() => { void getOperatorModeAction().then((mode) => { setEnabled(mode.enabled); setOperator(mode.operator); }); }, []);
  useEffect(() => {
    if (!open || staff.length > 0) return;
    setStaffLoading(true);
    setStaffLoadError("");
    void getActiveOperatorStaffAction()
      .then((result) => {
        if (!result.success) {
          setStaffLoadError(result.error);
          return;
        }
        setStaff(result.data);
        setStaffId(result.data[0]?.id ?? "");
        if (result.data.length === 0) setStaffLoadError("No active staff members are available. Add or activate a staff member first.");
      })
      .catch(() => setStaffLoadError("Could not load staff. Please try again."))
      .finally(() => setStaffLoading(false));
  }, [open, staff.length]);
  if (!enabled) return null;
  async function submit() { setSaving(true); setError(""); const result = await startOperatorSessionAction(staffId, pin); setSaving(false); if (!result.success) return setError(result.error); setOperator(result.data); setPin(""); setOpen(false); }
  return <>
    <button type="button" onClick={() => setOpen(true)} className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink hover:bg-surface lg:flex" title="Change active operator">
      <UserRound className="h-4 w-4 text-primary" /> {operator ? operator.name : "Select operator"}
    </button>
    {open && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-primary-tint p-2 text-primary"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-bold text-ink">Active Operator</h2><p className="text-sm text-ink-muted">Select staff and enter PIN.</p></div></div>
        <label className="mt-5 block text-sm font-semibold text-ink">Staff<select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-white px-3" autoFocus disabled={staffLoading || Boolean(staffLoadError)}><option value="">{staffLoading ? "Loading staff…" : "Select staff"}</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.staff_number}</option>)}</select></label>
        {staffLoadError && <p className="mt-3 text-sm font-semibold text-chip-red-fg">{staffLoadError}</p>}
        <label className="mt-3 block text-sm font-semibold text-ink">PIN<input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} inputMode="numeric" type="password" className="mt-1.5 h-11 w-full rounded-lg border border-border px-3" /></label>
        {error && <p className="mt-3 text-sm font-semibold text-chip-red-fg">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold">Cancel</button><button type="button" disabled={saving || !staffId || !pin || Boolean(staffLoadError)} onClick={() => void submit()} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Starting…" : "Start operator"}</button></div>
      </div>
    </div>, document.body)}
  </>;
}
