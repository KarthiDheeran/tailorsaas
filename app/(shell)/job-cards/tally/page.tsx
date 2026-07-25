"use client";

import { useMemo, useRef, useState } from "react";
import { Barcode, CheckCircle2, Loader2 } from "lucide-react";
import { scanJobCardStageSlipAction } from "@/app/(shell)/job-cards/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { formatCurrency } from "@/lib/currency";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";

function TallyContent() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState<JobCardStageSlip[]>([]);
  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const totals = useMemo(() => {
    const grouped = new Map<
      string,
      { staffName: string; count: number; amount: number; stages: Map<string, number> }
    >();
    for (const slip of scanned) {
      const current =
        grouped.get(slip.staffId) ??
        { staffName: slip.staffName, count: 0, amount: 0, stages: new Map<string, number>() };
      current.count += 1;
      current.amount += slip.wageAmount;
      current.stages.set(slip.stage, (current.stages.get(slip.stage) ?? 0) + 1);
      grouped.set(slip.staffId, current);
    }
    return Array.from(grouped.entries()).map(([staffId, row]) => ({ staffId, ...row }));
  }, [scanned]);

  async function scan(rawCode = code) {
    const trimmed = rawCode.trim();
    if (!trimmed || isScanning) return;
    setIsScanning(true);
    setMessage("");
    const result = await scanJobCardStageSlipAction(trimmed);
    setIsScanning(false);
    setCode("");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    if (!result.success) {
      setMessage(result.error);
      return;
    }

    setScanned((current) => {
      if (current.some((slip) => slip.id === result.data.id)) {
        setMessage("Already scanned in this tally.");
        return current;
      }
      setMessage(`${result.data.orderNumber} - ${result.data.staffName} added.`);
      return [result.data, ...current];
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Job Card Tally</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Scan returned stage job cards to total labour payable by worker.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void scan();
          }}
        >
          <div className="relative flex-1">
            <Barcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
              placeholder="Scan stage job card barcode"
              className="h-12 w-full rounded-lg border border-border pl-10 pr-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={isScanning || !code.trim()}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isScanning && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Scan
          </button>
        </form>
        {message && <p className="mt-3 text-sm font-semibold text-ink-muted">{message}</p>}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">Worker Totals</h2>
          <div className="mt-4 space-y-3">
            {totals.length === 0 ? (
              <p className="text-sm text-ink-muted">No job cards scanned yet.</p>
            ) : (
              totals.map((row) => (
                <div
                  key={row.staffId}
                  className="rounded-lg border border-border-soft bg-surface px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{row.staffName}</p>
                    <p className="font-bold text-primary">{formatCurrency(row.amount)}</p>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {row.count} slip{row.count === 1 ? "" : "s"} -{" "}
                    {Array.from(row.stages.entries())
                      .map(([stage, count]) => `${stage} ${count}`)
                      .join(", ")}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">Scanned Slips</h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-border-soft">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Garment</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {scanned.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-ink-muted">
                      Scan a returned job card to start.
                    </td>
                  </tr>
                ) : (
                  scanned.map((slip) => (
                    <tr key={slip.id} className="border-t border-border-soft">
                      <td className="px-3 py-2 font-semibold text-primary">{slip.orderNumber}</td>
                      <td className="px-3 py-2 text-ink">
                        {slip.garmentType} - Unit {slip.unitNo}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{slip.stage}</td>
                      <td className="px-3 py-2 text-ink">{slip.staffName}</td>
                      <td className="px-3 py-2 text-right font-semibold text-ink">
                        {formatCurrency(slip.wageAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {scanned.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-muted">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              These slips are marked tallied when scanned.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function JobCardTallyPage() {
  return (
    <RequirePermission permission="staff.manage">
      <TallyContent />
    </RequirePermission>
  );
}
