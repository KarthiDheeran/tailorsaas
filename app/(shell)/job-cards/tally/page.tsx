"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  Barcode,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  QrCode,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  confirmJobCardStageSlipTallyAction,
  getTalliedJobCardStageSlipsAction,
  previewJobCardStageSlipAction,
} from "@/app/(shell)/job-cards/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import { formatDate } from "@/components/orders/orders-table";
import { formatCurrency } from "@/lib/currency";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function localDateKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function localTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stageChipClass(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes("stitch")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized.includes("cut")) return "border-orange-200 bg-orange-50 text-orange-700";
  if (normalized.includes("iron")) return "border-sky-200 bg-sky-50 text-sky-700";
  if (normalized.includes("pack")) return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function TallyContent() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const automaticallyOpenedSlipRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState<JobCardStageSlip[]>([]);
  const [tallyDate, setTallyDate] = useState(todayIso);
  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingSlip, setPendingSlip] = useState<JobCardStageSlip | null>(null);
  const [loadingTallies, setLoadingTallies] = useState(true);
  const pendingLabourAddOnsTotal = useMemo(
    () =>
      (pendingSlip?.labourAddOnsSnapshot ?? []).reduce(
        (sum, addOn) => sum + Number(addOn.amount ?? 0),
        0
      ),
    [pendingSlip]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingTallies(true);
    getTalliedJobCardStageSlipsAction()
      .then((slips) => {
        if (!cancelled) setScanned(slips);
      })
      .catch(() => {
        if (!cancelled) setMessage("Could not load previous tally scans.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTallies(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleSlips = useMemo(
    () => scanned.filter((slip) => localDateKey(slip.talliedAt) === tallyDate),
    [scanned, tallyDate]
  );

  const totals = useMemo(() => {
    const grouped = new Map<
      string,
      { staffName: string; count: number; amount: number; stages: Map<string, number> }
    >();
    for (const slip of visibleSlips) {
      const staffKey = slip.staffId ?? "unassigned";
      const current =
        grouped.get(staffKey) ??
        { staffName: slip.staffName, count: 0, amount: 0, stages: new Map<string, number>() };
      current.count += 1;
      current.amount += slip.wageAmount;
      current.stages.set(slip.stage, (current.stages.get(slip.stage) ?? 0) + 1);
      grouped.set(staffKey, current);
    }
    return Array.from(grouped.entries()).map(([staffId, row]) => ({ staffId, ...row }));
  }, [visibleSlips]);
  const todayPayable = useMemo(
    () => totals.reduce((sum, row) => sum + row.amount, 0),
    [totals]
  );
  const latestLiveSlip = pendingSlip ?? visibleSlips[0];
  const hasLiveScanFailure = Boolean(message) && !pendingSlip && !message.includes("recorded for") && !message.startsWith("Already tallied");

  async function scan(rawCode = code) {
    const trimmed = rawCode.trim();
    if (!trimmed || isScanning) return;
    setIsScanning(true);
    setMessage("");
    const result = await previewJobCardStageSlipAction(trimmed);
    setIsScanning(false);
    setCode("");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    if (!result.success) {
      setMessage(result.error);
      return;
    }

    setScanned((current) => {
      if (current.some((slip) => slip.id === result.data.id)) {
        const dateText = result.data.talliedAt
          ? formatDate(localDateKey(result.data.talliedAt))
          : "an earlier tally";
        setMessage(`Already tallied on ${dateText}.`);
        if (result.data.talliedAt) setTallyDate(localDateKey(result.data.talliedAt));
        return current;
      }
      setPendingSlip(result.data);
      return current;
    });
  }

  useEffect(() => {
    const incomingCode = searchParams.get("scan")?.trim();
    if (!incomingCode || automaticallyOpenedSlipRef.current === incomingCode) return;
    automaticallyOpenedSlipRef.current = incomingCode;
    void scan(incomingCode);
    window.history.replaceState({}, "", "/job-cards/tally");
  }, [searchParams]);

  async function confirmTally() {
    if (!pendingSlip || isConfirming) return;
    setIsConfirming(true);
    setMessage("");
    const result = await confirmJobCardStageSlipTallyAction(pendingSlip.id);
    setIsConfirming(false);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    setPendingSlip(null);
    setScanned((current) => {
      if (current.some((slip) => slip.id === result.data.id)) return current;
      if (result.data.talliedAt) setTallyDate(localDateKey(result.data.talliedAt));
      setMessage(
        `${result.data.slipCode} - ${result.data.orderNumber} - ${result.data.garmentType} - ${result.data.stage} recorded for ${result.data.staffName}.`
      );
      // TODO: Play a local success notification here if audio feedback is introduced.
      return [result.data, ...current];
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-5 lg:p-5">
      <div className="mb-3">
        <JobCardTabs active="tally" />
      </div>
      <section className="rounded-2xl border border-border-soft bg-white p-[18px] shadow-soft">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">Job Card Tally</h1>
            {visibleSlips.length > 0 && (
              <p className="inline-flex h-8 items-center rounded-full bg-chip-mint px-3 text-sm font-medium text-chip-mint-fg">
                {visibleSlips.length} Scanned Today
              </p>
            )}
          </div>
          <div className="w-full">
            <p className="mt-0.5 text-sm text-ink-muted">
              Scan returned stage cards to record completed work and worker payable.
            </p>
          </div>
        </div>
        <form
          className="grid gap-3 lg:grid-cols-[180px_minmax(280px,1fr)_164px]"
          onSubmit={(event) => {
            event.preventDefault();
            void scan();
          }}
        >
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">
            Tally Date
            <input
              type="date"
              value={tallyDate}
              onChange={(event) => setTallyDate(event.target.value)}
              className="h-12 rounded-[10px] border border-border px-3 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">
            Scan Barcode / Slip Code
            <span className="relative block">
            <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
              placeholder="Scan barcode or enter slip code"
              className="h-12 w-full rounded-[10px] border border-border pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            </span>
          </label>
          <button
            type="submit"
            disabled={isScanning || !code.trim()}
            className="mt-5 flex h-12 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-shadow hover:bg-primary-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 lg:mt-5"
          >
            {isScanning && <Loader2 className="h-4 w-4 animate-spin" />}
            {!isScanning && <QrCode className="h-4 w-4" aria-hidden="true" />}
            Scan Job Card
          </button>
        </form>
        {message && <p className="mt-3 text-sm font-semibold text-ink-muted">{message}</p>}
        {loadingTallies && <p className="mt-3 text-sm text-ink-muted">Loading saved scans...</p>}
      </section>

      <section
        aria-live="polite"
        className={`mt-3 rounded-2xl border p-[18px] shadow-sm transition-all duration-200 ${
          hasLiveScanFailure
            ? "border-red-200 bg-red-50"
            : latestLiveSlip
              ? "border-green-200 bg-[#ECFDF5] shadow-[0_4px_14px_rgba(22,163,74,0.10)]"
              : "border-border-soft bg-surface"
        }`}
      >
        {hasLiveScanFailure ? (
          <div className="flex min-h-[74px] flex-col justify-center gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-600"><X className="h-5 w-5" aria-hidden="true" /></span>
                <h2 className="text-lg font-bold text-red-800">Live Scan Status</h2>
              </div>
              <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">FAILED</span>
            </div>
            <p className="text-sm font-medium text-red-700">{message}</p>
          </div>
        ) : latestLiveSlip ? (
          <div className="animate-[pulse_200ms_ease-out]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-green-600"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
                <h2 className="text-lg font-bold text-ink">Live Scan Status</h2>
              </div>
              <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">SUCCESS</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <LiveScanField icon={<FileText />} label="Slip" value={latestLiveSlip.slipCode} />
              <LiveScanField icon={<Barcode />} label="Order" value={latestLiveSlip.orderNumber} />
              <LiveScanField icon={<UserRound />} label="Worker" value={latestLiveSlip.staffName} />
              <LiveScanField icon={<Barcode />} label="Garment" value={`${latestLiveSlip.garmentType} - Unit ${latestLiveSlip.unitNo}`} />
              <div className="min-w-0"><p className="text-[13px] text-ink-muted">Stage</p><span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-sm font-semibold ${stageChipClass(latestLiveSlip.stage)}`}>{latestLiveSlip.stage}</span></div>
              <LiveScanField icon={<WalletCards />} label="Amount" value={formatCurrency(latestLiveSlip.wageAmount)} emphasis />
              <LiveScanField icon={<Clock3 />} label="Time" value={localTime(latestLiveSlip.talliedAt)} subdued />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Job Card scanned successfully. Worker payable has been updated.</p>
          </div>
        ) : (
          <div className="flex min-h-[74px] items-center gap-3 text-ink-muted">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary"><Barcode className="h-5 w-5" aria-hidden="true" /></span>
            <div><h2 className="font-semibold text-ink">Ready to scan job cards</h2><p className="mt-0.5 text-sm">Scan a barcode to view the latest completed job.</p></div>
          </div>
        )}
      </section>

      <section className="mt-3 rounded-2xl border border-border-soft bg-white p-[18px] shadow-soft">
        <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex h-[90px] items-center gap-3 rounded-2xl border border-border-soft bg-[#F8FFFD] px-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip-mint text-primary"><QrCode className="h-5 w-5" /></span>
            <div><p className="text-sm font-medium text-ink-muted">Today&apos;s Scans</p><p className="text-[22px] font-bold text-ink">{visibleSlips.length}</p></div>
          </div>
          <div className="flex h-[90px] items-center gap-3 rounded-2xl border border-border-soft bg-white px-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-tint text-primary"><Users className="h-5 w-5" /></span>
            <div><p className="text-sm font-medium text-ink-muted">Today&apos;s Workers</p><p className="text-[22px] font-bold text-ink">{totals.length}</p></div>
          </div>
          <div className="flex h-[90px] items-center gap-3 rounded-2xl border border-border-soft bg-white px-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip-mint text-primary"><WalletCards className="h-5 w-5" /></span>
            <div><p className="text-sm font-medium text-ink-muted">Today&apos;s Payable</p><p className="text-[22px] font-bold text-primary">{formatCurrency(todayPayable)}</p></div>
          </div>
          <div className="flex h-[90px] items-center gap-3 rounded-2xl border border-border-soft bg-white px-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-ink-muted"><Barcode className="h-5 w-5" /></span>
            <div><p className="text-sm font-medium text-ink-muted">Pending Scans</p><p className="text-[22px] font-bold text-ink-muted">—</p></div>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <h2 className="text-lg font-semibold text-ink">Worker Totals</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{formatDate(tallyDate)}</p>
            <div className="mt-3 space-y-2.5">
              {totals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-soft px-3 py-5 text-center text-sm text-ink-muted">No job cards tallied for this date.</div>
              ) : totals.map((row) => (
                <div key={row.staffId} className="rounded-2xl border border-border-soft bg-white p-3.5 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-tint text-primary"><UserRound className="h-4.5 w-4.5" /></span>
                    <p className="min-w-0 truncate font-semibold text-ink">{row.staffName}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border-soft pt-3">
                    <div><p className="text-xs font-medium text-ink-muted">Slips</p><p className="mt-0.5 text-lg font-bold text-ink">{row.count}</p></div>
                    <div><p className="text-xs font-medium text-ink-muted">Payable</p><p className="mt-0.5 text-lg font-bold text-primary">{formatCurrency(row.amount)}</p></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-muted">
                    {Array.from(row.stages.entries()).map(([stage, count]) => <span key={stage} className="rounded-full bg-surface px-2 py-1">{stage} {count}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Scanned Slips</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Showing saved scans for {formatDate(tallyDate)}.
            </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border-soft">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-[15px] font-semibold text-slate-700">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Garment</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2">Tallied</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleSlips.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                      Scan a returned job card to start this tally.
                    </td>
                  </tr>
                ) : (
                  visibleSlips.map((slip) => (
                    <tr key={slip.id} className="h-16 border-t border-border-soft transition-colors hover:bg-[#F8FFFD]">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-primary hover:underline">{slip.orderNumber}</p>
                        <p className="text-xs font-semibold text-ink-muted">{slip.slipCode}</p>
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {slip.garmentType} - Unit {slip.unitNo}
                      </td>
                      <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stageChipClass(slip.stage)}`}>{slip.stage}</span></td>
                      <td className="px-3 py-2 text-ink"><span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />{slip.staffName}</span></td>
                      <td className="px-3 py-2 text-sm text-ink-muted"><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{localTime(slip.talliedAt)}</span></td>
                      <td className="px-3 py-2 text-right text-[18px] font-bold text-primary">
                        {formatCurrency(slip.wageAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {visibleSlips.length > 0 && (
            <p className="mt-3 flex items-center gap-2 rounded-lg border-l-4 border-primary bg-chip-mint px-3 py-2.5 text-sm text-ink-muted">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              These slips are saved as completed tally records when scanned.
            </p>
          )}
          </div>
        </div>
      </section>
      {pendingSlip && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4 py-6">
          <button
            type="button"
            aria-label="Cancel tally confirmation"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!isConfirming) setPendingSlip(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-tally-title"
            className="relative w-full max-w-lg rounded-xl border border-border-soft bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border-soft px-5 py-4">
              <div>
                <h2 id="confirm-tally-title" className="text-lg font-semibold text-ink">
                  Confirm Job Card Tally
                </h2>
                <p className="text-sm font-semibold text-primary">{pendingSlip.slipCode}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isConfirming) setPendingSlip(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Order" value={pendingSlip.orderNumber} />
                <Info label="Garment" value={`${pendingSlip.garmentType} - Unit ${pendingSlip.unitNo}`} />
                <Info label="Stage" value={pendingSlip.stage} />
                <Info label="Worker" value={pendingSlip.staffName} />
              </div>
              <div className="rounded-lg border border-border-soft bg-surface px-3 py-2">
                <p className="text-xs font-semibold text-ink-muted">Payable Breakdown</p>
                <div className="mt-2 space-y-1.5">
                  <BreakdownRow
                    label={`${pendingSlip.stage} base work`}
                    value={formatCurrency(pendingSlip.wageRate)}
                  />
                  {(pendingSlip.labourAddOnsSnapshot ?? []).map((addOn) => (
                    <BreakdownRow
                      key={addOn.key}
                      label={`Extra work - ${addOn.label}`}
                      value={formatCurrency(addOn.amount)}
                    />
                  ))}
                  {pendingLabourAddOnsTotal === 0 && (
                    <p className="text-xs text-ink-muted">No extra add-on labour for this stage.</p>
                  )}
                  <div className="border-t border-border-soft pt-1.5">
                    <BreakdownRow
                      label="Total payable"
                      value={formatCurrency(pendingSlip.wageAmount)}
                      strong
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-ink-muted">
                Confirm only after receiving this stage job card from the worker.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-4">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => setPendingSlip(null)}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => void confirmTally()}
                className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConfirming && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Tally
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveScanField({
  icon,
  label,
  value,
  emphasis = false,
  subdued = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  emphasis?: boolean;
  subdued?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
        <span className="text-primary [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">{icon}</span>
        {label}
      </p>
      <p className={`mt-1 truncate text-base font-bold ${emphasis ? "text-primary text-[18px]" : subdued ? "text-ink-muted" : "text-ink"}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={strong ? "font-semibold text-ink" : "text-ink-muted"}>{label}</span>
      <span className={strong ? "text-lg font-bold text-primary" : "font-semibold text-ink"}>
        {value}
      </span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
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
