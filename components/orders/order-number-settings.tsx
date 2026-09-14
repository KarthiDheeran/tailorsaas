"use client";

import { useEffect, useState } from "react";
import { getOrderNumberSequencesAction, resetOrderNumberSequenceAction } from "@/app/(shell)/settings/order-preferences/actions";
import type { OrderNumberSequence } from "@/lib/order-numbering";

export function OrderNumberSettings({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<OrderNumberSequence[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<OrderNumberSequence | null>(null);
  const [newYear, setNewYear] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOrderNumberSequencesAction().then((result) => {
      if (cancelled) return;
      if (result.success) { setRows(result.data); setError(""); }
      else setError(result.error);
    }).catch(() => { if (!cancelled) setError("Failed to load order numbering."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  async function reset() {
    if (!selected || !confirmed) return;
    setSaving(true);
    setError("");
    try {
      const result = await resetOrderNumberSequenceAction({
        section: selected.order_section, expectedYear: selected.numbering_year, newYear: Number(newYear),
      });
      if (!result.success) { setError(result.error); return; }
      setMessage(`${selected.order_section}: the next order for ${newYear} will be 1. Existing orders retain their numbers.`);
      setSelected(null);
      setRevision((value) => value + 1);
    } catch {
      setError("Could not confirm the reset. Refresh numbering before trying again.");
    } finally { setSaving(false); }
  }

  return <section className="mt-6 rounded-xl border border-border-soft bg-white p-6 shadow-soft">
    <h2 className="text-lg font-semibold text-ink">Order numbering</h2>
    <p className="mt-1 text-sm text-ink-muted">Each Order Details category has its own sequence. Start a new numbering year when you want that category to restart at 1. This is a manual reset; the calendar year does not reset numbers automatically.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error} <button type="button" disabled={saving} onClick={() => { setSelected(null); setRevision((value) => value + 1); }} className="underline">Refresh numbering</button></p>}
    {message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
    {loading ? <p className="mt-4 text-sm">Loading numbering...</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b border-border-soft"><th className="py-2">Order Details</th><th>Numbering year</th><th>Next number</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.order_section} className="border-b border-border-soft">
        <td className="py-3 font-semibold">{row.order_section}</td><td>{row.numbering_year}</td><td>{row.next_number}</td>
        <td className="text-right">{canManage && <button type="button" disabled={saving || !!error} onClick={() => { setSelected(row); setNewYear(String(row.numbering_year + 1)); setConfirmed(false); setMessage(""); }} className="rounded-lg border border-primary px-3 py-2 font-semibold text-primary disabled:opacity-50">Start new year</button>}</td>
      </tr>)}</tbody>
    </table></div>}
    {selected && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h3 className="font-semibold">Reset {selected.order_section} numbering</h3>
      <label className="mt-3 block text-sm font-medium">New numbering year
        <input type="number" min={selected.numbering_year + 1} max={9999} step={1} disabled={saving} value={newYear} onChange={(event) => { setNewYear(event.target.value); setConfirmed(false); }} className="ml-3 w-28 rounded border border-border px-2 py-1" />
      </label>
      <p className="mt-2 text-sm">The next {selected.order_section} order will be number 1 in {newYear || "the new year"}. Existing orders and other categories will keep their numbers. You cannot reuse an earlier numbering year.</p>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving} onChange={(event) => setConfirmed(event.target.checked)} />I confirm that {selected.order_section} should start a new numbering year.</label>
      <div className="mt-3 flex gap-3"><button type="button" disabled={saving || !confirmed || !Number.isInteger(Number(newYear)) || Number(newYear) <= selected.numbering_year || Number(newYear) > 9999} onClick={() => void reset()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Resetting..." : `Start ${newYear} at 1`}</button><button type="button" disabled={saving} onClick={() => setSelected(null)} className="text-sm font-semibold">Cancel</button></div>
    </div>}
  </section>;
}
