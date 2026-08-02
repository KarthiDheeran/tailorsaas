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
  getQuickTallyStaffAction,
  getTalliedJobCardStageSlipsAction,
  quickTallyJobCardStageSlipAction,
} from "@/app/(shell)/job-cards/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import { formatDate } from "@/components/orders/orders-table";
import { formatCurrency } from "@/lib/currency";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";
import type { Staff } from "@/lib/types";

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
  if (normalized.includes("cut")) return "border-warning/30 bg-warning-soft text-warning";
  if (normalized.includes("iron")) return "border-info/30 bg-info-soft text-info";
  if (normalized.includes("pack")) return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-border-soft bg-chip-info text-ink-muted";
}

function slipGarmentLabel(slip: JobCardStageSlip) {
  const quantity = Math.max(1, Number(slip.quantity) || 1);
  return quantity > 1
    ? `${slip.garmentType} - Qty ${quantity}`
    : `${slip.garmentType} - Unit ${slip.unitNo}`;
}

function TallyContent() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const automaticallyOpenedSlipRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState<JobCardStageSlip[]>([]);
  const [tallyDate, setTallyDate] = useState(todayIso);
  const [tallyToDate, setTallyToDate] = useState(todayIso);
  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionPayable, setSessionPayable] = useState(0);
  const [scanState, setScanState] = useState<"idle" | "success" | "error" | "duplicate">("idle");
  const [loadingTallies, setLoadingTallies] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingTallies(true);
    Promise.all([getTalliedJobCardStageSlipsAction(), getQuickTallyStaffAction()])
      .then(([slips, staffMembers]) => {
        if (cancelled) return;
        setScanned(slips);
        setStaff(staffMembers);
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
    () => scanned.filter((slip) => { const date = localDateKey(slip.talliedAt); return date >= tallyDate && date <= tallyToDate; }),
    [scanned, tallyDate, tallyToDate]
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
  const latestLiveSlip = visibleSlips[0];
  const hasLiveScanFailure = scanState === "error" || scanState === "duplicate";

  function focusScanField() {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function scan(rawCode = code) {
    const trimmed = rawCode.trim();
    if (!trimmed || isScanning) {
      focusScanField();
      return;
    }
    if (!sessionActive || !selectedStaffId) {
      setScanState("error");
      setMessage(`Scanned ${trimmed}: Select a staff member and start the scan session first.`);
      focusScanField();
      return;
    }
    setIsScanning(true);
    setMessage("");
    setScanState("idle");
    try {
      const result = await quickTallyJobCardStageSlipAction(trimmed, selectedStaffId);

    if (!result.success) {
      setScanState(result.error.startsWith("Already tallied") ? "duplicate" : "error");
      setMessage(`Scanned ${trimmed}: ${result.error}`);
      return;
    }

    setScanned((current) => {
      if (current.some((slip) => slip.id === result.data.id)) return current;
      return [result.data, ...current];
    });
    if (result.data.talliedAt) setTallyDate(localDateKey(result.data.talliedAt));
    setSessionCount((count) => count + 1);
    setSessionPayable((amount) => amount + result.data.wageAmount);
    setScanState("success");
    setMessage(
      `${result.data.slipCode} completed — ${formatCurrency(result.data.wageAmount)} added to ${result.data.staffName}.`
    );
    } catch {
      setScanState("error");
      setMessage(`Scanned ${trimmed}: The scan could not be recorded. Please try the same barcode again.`);
    } finally {
      setIsScanning(false);
      setCode("");
      if (inputRef.current) inputRef.current.value = "";
      focusScanField();
    }
  }

  useEffect(() => {
    const incomingCode = searchParams.get("scan")?.trim();
    if (!incomingCode || automaticallyOpenedSlipRef.current === incomingCode) return;
    automaticallyOpenedSlipRef.current = incomingCode;
    void scan(incomingCode);
    window.history.replaceState({}, "", "/job-cards/tally");
  }, [searchParams]);

  function startSession() {
    if (!selectedStaffId) {
      setScanState("error");
      setMessage("Select a staff member before starting the scan session.");
      return;
    }
    setSessionActive(true);
    setSessionCount(0);
    setSessionPayable(0);
    setScanState("idle");
    setMessage("");
    focusScanField();
  }

  function changeStaff() {
    setSessionActive(false);
    setCode("");
    if (inputRef.current) inputRef.current.value = "";
    setScanState("idle");
    setMessage("");
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
          className="grid gap-3 xl:grid-cols-[170px_170px_240px_auto_minmax(280px,1fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            void scan(inputRef.current?.value ?? code);
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
            To Date
            <input type="date" value={tallyToDate} min={tallyDate} onChange={(event) => setTallyToDate(event.target.value)} className="h-12 rounded-[10px] border border-border px-3 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">
            Staff member
            <select
              value={selectedStaffId}
              disabled={sessionActive || isScanning}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              className="h-12 rounded-[10px] border border-border bg-white px-3 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
            >
              <option value="">Select staff</option>
              {staff.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name}</option>)}
            </select>
          </label>
          {sessionActive ? (
            <button
              type="button"
              onClick={changeStaff}
              disabled={isScanning}
              className="mt-5 flex h-12 items-center justify-center rounded-[10px] border border-border px-4 text-sm font-semibold text-ink transition hover:bg-surface-muted"
            >
              Change Staff
            </button>
          ) : (
            <button
              type="button"
              onClick={startSession}
              disabled={!selectedStaffId || isScanning}
              className="mt-5 flex h-12 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start Scanning
            </button>
          )}
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">
            Scan Barcode / Slip Code
            <span className="relative block">
            <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              onChange={(event) => setCode(event.target.value)}
              disabled={!sessionActive || isScanning}
              placeholder="Scan barcode or enter slip code"
              autoComplete="off"
              data-raw-barcode-input="true"
              className="h-12 w-full rounded-[10px] border border-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
            />
            </span>
          </label>
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
          <p className="font-medium text-ink-muted">
            {sessionActive
              ? `Scanning for ${staff.find((member) => member.id === selectedStaffId)?.name ?? "selected staff"}. Staff is locked until you choose Change Staff.`
              : "Select a staff member, then start scanning. Each barcode is recorded immediately."}
          </p>
          {sessionActive && <p className="font-semibold text-primary">Session: {sessionCount} slips · {formatCurrency(sessionPayable)}</p>}
        </div>
        {message && <p className={`mt-3 text-sm font-semibold ${scanState === "success" ? "text-success" : scanState === "duplicate" ? "text-warning" : "text-danger"}`}>{message}</p>}
        {loadingTallies && <p className="mt-3 text-sm text-ink-muted">Loading saved scans...</p>}
      </section>

      {isScanning && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4"
          role="status"
          aria-live="assertive"
          aria-label="Recording tally scan"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border-soft bg-white p-6 text-center shadow-xl">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-tint text-primary">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-ink">Recording scan…</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Updating the job card and worker payable. Please wait before scanning the next barcode.
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
            </div>
          </div>
        </div>
      )}

      <section
        aria-live="polite"
        className={`mt-3 rounded-2xl border p-[18px] shadow-sm transition-all duration-200 ${
          hasLiveScanFailure
            ? scanState === "duplicate"
              ? "border-warning/30 bg-warning-soft"
              : "border-danger/30 bg-danger-soft"
            : latestLiveSlip
              ? "border-success/30 bg-primary-tint shadow-[0_4px_14px_rgba(22,163,74,0.10)]"
              : "border-border-soft bg-surface-muted"
        }`}
      >
        {hasLiveScanFailure ? (
          <div className="flex min-h-[74px] flex-col justify-center gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${scanState === "duplicate" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger"}`}><X className="h-5 w-5" aria-hidden="true" /></span>
                <h2 className={`text-lg font-bold ${scanState === "duplicate" ? "text-warning" : "text-danger"}`}>Live Scan Status</h2>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${scanState === "duplicate" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger"}`}>{scanState === "duplicate" ? "ALREADY TALLIED" : "FAILED"}</span>
            </div>
            <p className={`text-sm font-medium ${scanState === "duplicate" ? "text-warning" : "text-danger"}`}>{message}</p>
          </div>
        ) : latestLiveSlip ? (
          <div className="animate-[pulse_200ms_ease-out]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-soft text-success"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
                <h2 className="text-lg font-bold text-ink">Live Scan Status</h2>
              </div>
              <span className="inline-flex rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">SUCCESS</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <LiveScanField icon={<FileText />} label="Slip" value={latestLiveSlip.slipCode} />
              <LiveScanField icon={<Barcode />} label="Order" value={latestLiveSlip.orderNumber} />
              <LiveScanField icon={<UserRound />} label="Worker" value={latestLiveSlip.staffName} />
              <LiveScanField icon={<Barcode />} label="Garment" value={slipGarmentLabel(latestLiveSlip)} />
              <div className="min-w-0"><p className="text-[13px] text-ink-muted">Stage</p><span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-sm font-semibold ${stageChipClass(latestLiveSlip.stage)}`}>{latestLiveSlip.stage}</span></div>
              <LiveScanField icon={<WalletCards />} label="Amount" value={formatCurrency(latestLiveSlip.wageAmount)} emphasis />
              <LiveScanField icon={<Clock3 />} label="Time" value={localTime(latestLiveSlip.talliedAt)} subdued />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Job Card scanned successfully. Worker payable has been updated.</p>
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
          <div className="flex h-[90px] items-center gap-3 rounded-2xl border border-border-soft bg-surface-muted px-4 shadow-sm">
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
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip-info text-ink-muted"><Barcode className="h-5 w-5" /></span>
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
                    {Array.from(row.stages.entries()).map(([stage, count]) => <span key={stage} className="rounded-full bg-surface-muted px-2 py-1">{stage} {count}</span>)}
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
              <thead className="bg-chip-info text-[15px] font-semibold text-ink-muted">
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
                    <tr key={slip.id} className="h-16 border-t border-border-soft transition-colors hover:bg-surface-muted">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-primary hover:underline">{slip.orderNumber}</p>
                        <p className="text-xs font-semibold text-ink-muted">{slip.slipCode}</p>
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {slipGarmentLabel(slip)}
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

export default function JobCardTallyPage() {
  return (
    <RequirePermission permission="staff.manage">
      <TallyContent />
    </RequirePermission>
  );
}
