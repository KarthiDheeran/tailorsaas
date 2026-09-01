"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  confirmQuickTallyJobCardStageSlipAction,
  getJobCardTallyPageDataAction,
  getTalliedJobCardStageSlipsForRangeAction,
  previewQuickTallyJobCardStageSlipAction,
  quickTallyJobCardStageSlipBatchAction,
  type QuickTallyPreview,
} from "@/app/(shell)/job-cards/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import { formatDate } from "@/components/orders/orders-table";
import { formatCurrency } from "@/lib/currency";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";
import type { StaffOption } from "@/lib/data/staff-db";

const QUICK_TALLY_QUEUE_KEY = "tailorsaas.quickTallyQueue.v1";
const QUICK_TALLY_BATCH_SIZE = 25;

interface FailedQuickScan {
  code: string;
  error: string;
}

function playScanTone(kind: "captured" | "success" | "error") {
  try {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === "error" ? 180 : kind === "success" ? 880 : 620;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Sound feedback is optional; scanner capture must never depend on audio.
  }
}

function quickScanCodesFromPayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed.toUpperCase().startsWith("TSB|")) return [trimmed];
  return trimmed
    .slice(4)
    .split(/[,+;]/)
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, 100);
}

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
  if (normalized.includes("stitch")) return "border-secondary-border bg-secondary-soft text-secondary";
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

function slipPayableAmount(slip: JobCardStageSlip) {
  return slip.tallyWageAmount > 0 ? slip.tallyWageAmount : slip.wageAmount;
}

function TallyContent() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const quickQueueRef = useRef<string[]>([]);
  const queuedQuickCodesRef = useRef(new Set<string>());
  const processingQuickQueueRef = useRef(false);
  const automaticallyOpenedSlipRef = useRef<string | null>(null);
  const staffLoadedRef = useRef(false);
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState<JobCardStageSlip[]>([]);
  const [tallyDate, setTallyDate] = useState(todayIso);
  const [tallyToDate, setTallyToDate] = useState(todayIso);
  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [queuedScanCount, setQueuedScanCount] = useState(0);
  const [failedQuickScans, setFailedQuickScans] = useState<FailedQuickScan[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionPayable, setSessionPayable] = useState(0);
  const [scanMode, setScanMode] = useState<"quick" | "partial">("quick");
  const [scanState, setScanState] = useState<"idle" | "processing" | "success" | "error" | "duplicate">("idle");
  const [loadingTallies, setLoadingTallies] = useState(true);
  const [pendingPreview, setPendingPreview] = useState<QuickTallyPreview | null>(null);
  const [pendingCode, setPendingCode] = useState("");
  const [completedQty, setCompletedQty] = useState(1);
  const [extraAmount, setExtraAmount] = useState(0);
  const [extraNotes, setExtraNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingTallies(true);
    const request: Promise<{ slips: JobCardStageSlip[]; staff?: StaffOption[] }> = staffLoadedRef.current
      ? getTalliedJobCardStageSlipsForRangeAction(tallyDate, tallyToDate).then((slips) => ({ slips }))
      : getJobCardTallyPageDataAction(tallyDate, tallyToDate);
    request
      .then((result) => {
        if (cancelled) return;
        setScanned(result.slips);
        if (result.staff) {
          setStaff(result.staff);
          staffLoadedRef.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Could not load tally scans for this date range.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTallies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tallyDate, tallyToDate]);

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
      const talliedUnits = Math.max(1, Number(slip.talliedQuantity) || 1);
      const staffKey = slip.staffId ?? "unassigned";
      const current =
        grouped.get(staffKey) ??
        { staffName: slip.staffName, count: 0, amount: 0, stages: new Map<string, number>() };
      current.count += talliedUnits;
      current.amount += slipPayableAmount(slip);
      current.stages.set(slip.stage, (current.stages.get(slip.stage) ?? 0) + talliedUnits);
      grouped.set(staffKey, current);
    }
    return Array.from(grouped.entries()).map(([staffId, row]) => ({ staffId, ...row }));
  }, [visibleSlips]);
  const todayPayable = useMemo(
    () => totals.reduce((sum, row) => sum + row.amount, 0),
    [totals]
  );
  const latestLiveSlip = visibleSlips[0];
  const visibleTalliedUnits = useMemo(
    () => visibleSlips.reduce((sum, slip) => sum + Math.max(1, Number(slip.talliedQuantity) || 1), 0),
    [visibleSlips]
  );
  const hasLiveScanFailure = scanState === "error" || scanState === "duplicate";
  const isProcessingScan = scanState === "processing";

  const focusScanField = useCallback(function focusScanField() {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!staffLoadedRef.current) return;
    try {
      const raw = window.localStorage.getItem(QUICK_TALLY_QUEUE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { staffId?: string; codes?: string[] };
      const savedStaff = staff.find((member) => member.id === saved.staffId && member.status === "Active");
      const codes = Array.isArray(saved.codes) ? saved.codes.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
      if (!savedStaff || codes.length === 0 || quickQueueRef.current.length > 0) return;
      setSelectedStaffId(savedStaff.id);
      setSessionActive(true);
      for (const value of codes) {
        const code = value.trim();
        const key = code.toUpperCase();
        if (!queuedQuickCodesRef.current.has(key)) {
          queuedQuickCodesRef.current.add(key);
          quickQueueRef.current.push(code);
        }
      }
      setQueuedScanCount(quickQueueRef.current.length);
      setMessage(`Recovered ${quickQueueRef.current.length} unsaved scan(s). Processing will resume.`);
    } catch {
      window.localStorage.removeItem(QUICK_TALLY_QUEUE_KEY);
    }
  }, [staff]);

  useEffect(() => {
    if (queuedScanCount > 0 && selectedStaffId) {
      window.localStorage.setItem(QUICK_TALLY_QUEUE_KEY, JSON.stringify({
        staffId: selectedStaffId,
        codes: quickQueueRef.current,
      }));
    } else {
      window.localStorage.removeItem(QUICK_TALLY_QUEUE_KEY);
    }
  }, [queuedScanCount, selectedStaffId]);

  const processQuickQueue = useCallback(async function processQuickQueue() {
    if (processingQuickQueueRef.current) return;
    processingQuickQueueRef.current = true;
    setIsScanning(true);

    try {
      while (quickQueueRef.current.length > 0) {
        const batch = quickQueueRef.current.slice(0, QUICK_TALLY_BATCH_SIZE);
        setScanState("processing");
        setMessage(`Saving ${batch.length} scan(s) · ${quickQueueRef.current.length} queued...`);
        try {
          const results = await quickTallyJobCardStageSlipBatchAction(batch, selectedStaffId);
          let savedCount = 0;
          for (const item of results) {
            if (!item.result.success) {
              const failureError = item.result.error;
              setFailedQuickScans((current) => [
                ...current.filter((failure) => failure.code.toUpperCase() !== item.code.toUpperCase()),
                { code: item.code, error: failureError },
              ]);
              continue;
            }
            const result = item.result;
            const talliedUnits = Math.max(1, Number(result.data.talliedQuantity) || Number(result.data.quantity) || 1);
            const payable = slipPayableAmount(result.data);
            savedCount += 1;
            setScanned((current) => [result.data, ...current.filter((slip) => slip.id !== result.data.id)]);
            setSessionCount((count) => count + talliedUnits);
            setSessionPayable((amount) => amount + payable);
            setFailedQuickScans((current) => current.filter((failure) => failure.code.toUpperCase() !== item.code.toUpperCase()));
            if (result.data.talliedAt) {
              const talliedDate = localDateKey(result.data.talliedAt);
              setTallyDate(talliedDate);
              setTallyToDate((current) => (current < talliedDate ? talliedDate : current));
            }
          }
          if (savedCount === results.length) {
            setScanState("success");
            playScanTone("success");
          } else {
            setScanState("error");
            playScanTone("error");
          }
          setMessage(`${savedCount}/${batch.length} saved · ${Math.max(0, quickQueueRef.current.length - batch.length)} remaining.`);
        } catch {
          setScanState("error");
          setMessage(`Batch could not be saved. It remains available after refresh; retrying shortly.`);
          playScanTone("error");
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
          continue;
        } finally {
          focusScanField();
        }
        quickQueueRef.current.splice(0, batch.length);
        for (const queuedCode of batch) queuedQuickCodesRef.current.delete(queuedCode.toUpperCase());
        setQueuedScanCount(quickQueueRef.current.length);
      }
    } finally {
      processingQuickQueueRef.current = false;
      setIsScanning(false);
      focusScanField();
    }
  }, [focusScanField, selectedStaffId]);

  useEffect(() => {
    if (sessionActive && selectedStaffId && queuedScanCount > 0) void processQuickQueue();
  }, [processQuickQueue, queuedScanCount, selectedStaffId, sessionActive]);

  function retryFailedQuickScans() {
    if (!sessionActive || failedQuickScans.length === 0) return;
    for (const failure of failedQuickScans) {
      const key = failure.code.toUpperCase();
      if (queuedQuickCodesRef.current.has(key)) continue;
      queuedQuickCodesRef.current.add(key);
      quickQueueRef.current.push(failure.code);
    }
    setFailedQuickScans([]);
    setQueuedScanCount(quickQueueRef.current.length);
    setMessage(`${quickQueueRef.current.length} failed scan(s) queued for retry.`);
    void processQuickQueue();
  }

  const scan = useCallback(async function scan(rawCode = code) {
    const trimmed = rawCode.trim();
    if (!trimmed || pendingPreview || (scanMode === "partial" && isScanning)) {
      focusScanField();
      return;
    }
    if (!sessionActive || !selectedStaffId) {
      setScanState("error");
      setMessage(`Scanned ${trimmed}: Select a staff member and start the scan session first.`);
      focusScanField();
      return;
    }
    setCode("");
    if (inputRef.current) inputRef.current.value = "";
    if (scanMode === "quick") {
      const capturedCodes = quickScanCodesFromPayload(trimmed);
      let added = 0;
      let duplicates = 0;
      for (const capturedCode of capturedCodes) {
        const normalizedCode = capturedCode.toUpperCase();
        if (queuedQuickCodesRef.current.has(normalizedCode)) {
          duplicates += 1;
          continue;
        }
        queuedQuickCodesRef.current.add(normalizedCode);
        quickQueueRef.current.push(capturedCode);
        added += 1;
      }
      if (added === 0) {
        setScanState("duplicate");
        setMessage(`${trimmed}: already captured in the current queue.`);
        playScanTone("error");
        focusScanField();
        return;
      }
      setQueuedScanCount(quickQueueRef.current.length);
      setScanState("processing");
      setMessage(`${added} scan(s) captured${duplicates ? ` · ${duplicates} duplicate(s) skipped` : ""} · ${quickQueueRef.current.length} queued.`);
      playScanTone("captured");
      focusScanField();
      void processQuickQueue();
      return;
    }
    setIsScanning(true);
    setMessage(`Scanned ${trimmed}: Loading job card...`);
    setScanState("processing");
    try {
      const result = await previewQuickTallyJobCardStageSlipAction(trimmed, selectedStaffId);

    if (!result.success) {
      setScanState(result.error.startsWith("Already tallied") ? "duplicate" : "error");
      setMessage(`Scanned ${trimmed}: ${result.error}`);
      return;
    }

    setPendingPreview(result.data);
    setPendingCode(trimmed);
    setCompletedQty(Math.max(1, result.data.completedQuantity));
    setExtraAmount(0);
    setExtraNotes("");
    setScanState("idle");
    setMessage(`${result.data.slip.slipCode}: ${result.data.pendingQuantity} item(s) pending. Confirm completed quantity.`);
    /*
      `${result.data.slipCode} completed — ${formatCurrency(result.data.wageAmount)} added to ${result.data.staffName}.`
    );
    */
    } catch {
      setScanState("error");
      setMessage(`Scanned ${trimmed}: The scan could not be recorded. Please try the same barcode again.`);
    } finally {
      setIsScanning(false);
      focusScanField();
    }
  }, [code, focusScanField, isScanning, pendingPreview, processQuickQueue, scanMode, selectedStaffId, sessionActive]);

  useEffect(() => {
    const incomingCode = searchParams.get("scan")?.trim();
    if (!incomingCode || automaticallyOpenedSlipRef.current === incomingCode) return;
    automaticallyOpenedSlipRef.current = incomingCode;
    void scan(incomingCode);
    window.history.replaceState({}, "", "/job-cards/tally");
  }, [scan, searchParams]);

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
    if (processingQuickQueueRef.current || quickQueueRef.current.length > 0) {
      setScanState("error");
      setMessage("Wait for the captured scans to finish before changing staff.");
      focusScanField();
      return;
    }
    setSessionActive(false);
    setCode("");
    if (inputRef.current) inputRef.current.value = "";
    setScanState("idle");
    setMessage("");
  }

  async function confirmPendingTally() {
    if (!pendingPreview || !pendingCode || isScanning) return;
    const quantity = Math.max(1, Math.min(pendingPreview.pendingQuantity, Math.floor(Number(completedQty) || 1)));
    setIsScanning(true);
    setMessage("");
    setScanState("idle");
    try {
      const result = await confirmQuickTallyJobCardStageSlipAction({
        code: pendingCode,
        staffId: selectedStaffId,
        completedQuantity: quantity,
        extraAmount,
        notes: extraNotes,
      });
      if (!result.success) {
        setScanState(result.error.startsWith("Already tallied") ? "duplicate" : "error");
        setMessage(`Scanned ${pendingCode}: ${result.error}`);
        return;
      }
      setScanned((current) => [result.data, ...current.filter((slip) => slip.id !== result.data.id)]);
      if (result.data.talliedAt) {
        const talliedDate = localDateKey(result.data.talliedAt);
        setTallyDate(talliedDate);
        setTallyToDate((current) => (current < talliedDate ? talliedDate : current));
      }
      setSessionCount((count) => count + quantity);
      setSessionPayable((amount) => amount + result.data.wageAmount);
      setScanState("success");
      setMessage(
        `${result.data.slipCode}: ${quantity} item(s) tallied. ${formatCurrency(result.data.wageAmount)} added to ${result.data.staffName}.`
      );
      setPendingPreview(null);
      setPendingCode("");
      setExtraAmount(0);
      setExtraNotes("");
    } catch {
      setScanState("error");
      setMessage(`Scanned ${pendingCode}: The scan could not be recorded. Please try the same barcode again.`);
    } finally {
      setIsScanning(false);
      setCode("");
      if (inputRef.current) inputRef.current.value = "";
      focusScanField();
    }
  }

  function cancelPendingTally() {
    setPendingPreview(null);
    setPendingCode("");
    setExtraAmount(0);
    setExtraNotes("");
    setScanState("idle");
    setMessage("");
    focusScanField();
  }

  return (
    <div className="w-full p-2 sm:p-3 lg:p-4">
      <div className="mb-3">
        <JobCardTabs active="tally" />
      </div>
      <section className="rounded-2xl border border-border-soft bg-white p-[18px] shadow-soft">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">Job Card Tally</h1>
            {visibleSlips.length > 0 && (
              <p className="inline-flex h-8 items-center rounded-full bg-chip-mint px-3 text-sm font-medium text-chip-mint-fg">
                {visibleTalliedUnits} Scanned Today
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
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void scan(inputRef.current?.value ?? code);
          }}
        >
          <label className="grid min-w-[190px] flex-[0_0_190px] gap-1 text-xs font-semibold text-ink-muted">
            Tally Date
            <input
              type="date"
              value={tallyDate}
              onChange={(event) => setTallyDate(event.target.value)}
              className="h-12 rounded-[10px] border border-border px-3 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="grid min-w-[190px] flex-[0_0_190px] gap-1 text-xs font-semibold text-ink-muted">
            To Date
            <input type="date" value={tallyToDate} min={tallyDate} onChange={(event) => setTallyToDate(event.target.value)} className="h-12 rounded-[10px] border border-border px-3 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="grid min-w-[260px] flex-[0_0_260px] gap-1 text-xs font-semibold text-ink-muted">
            Staff member
            <select
              value={selectedStaffId}
              disabled={sessionActive || isScanning || queuedScanCount > 0}
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
              disabled={scanMode === "partial" && isScanning}
              className="flex h-12 min-w-[150px] items-center justify-center rounded-[10px] border border-border px-4 text-sm font-semibold text-ink transition hover:bg-surface-muted"
            >
              Change Staff
            </button>
          ) : (
            <button
              type="button"
              onClick={startSession}
              disabled={!selectedStaffId || isScanning || queuedScanCount > 0}
              className="flex h-12 min-w-[150px] items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start Scanning
            </button>
          )}
          <label className="grid min-w-[360px] flex-1 gap-1 text-xs font-semibold text-ink-muted">
            Scan Barcode / Slip Code
            <span className="relative block">
            <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              onChange={(event) => setCode(event.target.value)}
              disabled={!sessionActive || (scanMode === "partial" && isScanning)}
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
          {sessionActive && <p className="font-semibold text-primary">Session: {sessionCount} saved · {queuedScanCount} queued · {formatCurrency(sessionPayable)}</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-muted">
          <span>Scans: <span className="text-ink">{visibleTalliedUnits}</span></span>
          <span className="text-border">|</span>
          <span>Workers: <span className="text-ink">{totals.length}</span></span>
          <span className="text-border">|</span>
          <span>Payable: <span className="text-primary">{formatCurrency(todayPayable)}</span></span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Scan mode</span>
          <button
            type="button"
            onClick={() => setScanMode("quick")}
            disabled={isScanning || queuedScanCount > 0 || Boolean(pendingPreview)}
            className={`h-9 rounded-lg border px-3 text-sm font-semibold transition ${
              scanMode === "quick"
                ? "border-primary bg-primary text-white"
                : "border-border bg-white text-ink hover:bg-primary-tint"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Quick Scan
          </button>
          <button
            type="button"
            onClick={() => setScanMode("partial")}
            disabled={isScanning || queuedScanCount > 0 || Boolean(pendingPreview)}
            className={`h-9 rounded-lg border px-3 text-sm font-semibold transition ${
              scanMode === "partial"
                ? "border-primary bg-primary text-white"
                : "border-border bg-white text-ink hover:bg-primary-tint"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Partial / Extra
          </button>
          <span className="text-xs text-ink-muted">
            {scanMode === "quick"
              ? "Daily scanning: records the full pending slip immediately."
              : "Monthly/special use: asks quantity and extra amount before saving."}
          </span>
        </div>
        {message && <p className={`mt-3 text-sm font-semibold ${scanState === "success" ? "text-success" : scanState === "duplicate" ? "text-warning" : scanState === "processing" ? "text-primary" : "text-danger"}`}>{message}</p>}
        {failedQuickScans.length > 0 && (
          <div className="mt-3 rounded-xl border border-danger/25 bg-danger-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-danger">{failedQuickScans.length} scan(s) need attention</p>
              <button
                type="button"
                onClick={retryFailedQuickScans}
                disabled={!sessionActive || queuedScanCount > 0}
                className="h-9 rounded-lg border border-danger/30 bg-white px-3 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retry failed scans
              </button>
            </div>
            <ul className="mt-2 grid gap-1 text-xs text-danger">
              {failedQuickScans.map((failure) => (
                <li key={failure.code}><span className="font-bold">{failure.code}</span>: {failure.error}</li>
              ))}
            </ul>
          </div>
        )}
        {loadingTallies && <p className="mt-3 text-sm text-ink-muted">Loading saved scans...</p>}
      </section>

      {pendingPreview && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm tally scan"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border-soft bg-white shadow-xl">
            <div className="border-b border-border-soft px-6 py-4">
              <h2 className="text-xl font-bold text-ink">Confirm Tally Scan</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {pendingPreview.slip.slipCode} · Order {pendingPreview.slip.orderNumber} · {pendingPreview.slip.stage}
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="grid gap-3 rounded-xl bg-surface-muted p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-ink-muted">Total Qty</p>
                  <p className="mt-1 text-lg font-bold text-ink">{pendingPreview.slip.quantity}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Already Tallied</p>
                  <p className="mt-1 text-lg font-bold text-ink">{pendingPreview.slip.talliedQuantity}</p>
                </div>
                <div>
                  <p className="text-ink-muted">Pending</p>
                  <p className="mt-1 text-lg font-bold text-primary">{pendingPreview.pendingQuantity}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold text-ink-muted">
                  Completed Qty
                  <input
                    type="number"
                    min={1}
                    max={pendingPreview.pendingQuantity}
                    value={completedQty}
                    onChange={(event) => setCompletedQty(Math.max(1, Math.min(pendingPreview.pendingQuantity, Number(event.target.value) || 1)))}
                    className="h-12 rounded-[10px] border border-border px-3 text-base font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-ink-muted">
                  Extra Amount
                  <input
                    type="number"
                    min={0}
                    value={extraAmount}
                    onChange={(event) => setExtraAmount(Math.max(0, Number(event.target.value) || 0))}
                    className="h-12 rounded-[10px] border border-border px-3 text-base font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="0"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-semibold text-ink-muted">
                Extra Notes
                <textarea
                  value={extraNotes}
                  onChange={(event) => setExtraNotes(event.target.value)}
                  className="min-h-[78px] rounded-[10px] border border-border px-3 py-2 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Optional notes for extra work"
                />
              </label>
              <div className="grid gap-2 rounded-xl border border-border-soft bg-white px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-muted">Base rate</span>
                  <span className="font-semibold text-ink">{formatCurrency(pendingPreview.basePerUnitWageAmount)} × {Number(completedQty) || 0}</span>
                </div>
                {pendingPreview.labourPerUnitWageAmount > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink-muted">Work details / add-on labour</span>
                    <span className="font-semibold text-ink">{formatCurrency(pendingPreview.labourPerUnitWageAmount)} × {Number(completedQty) || 0}</span>
                  </div>
                )}
                {extraAmount > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink-muted">Extra amount</span>
                    <span className="font-semibold text-ink">{formatCurrency(extraAmount)}</span>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary-tint px-3 py-2 text-sm font-semibold text-primary">
                Payable now: {formatCurrency((Number(completedQty) || 0) * pendingPreview.perUnitWageAmount + extraAmount)}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border-soft px-6 py-4">
              <button
                type="button"
                onClick={cancelPendingTally}
                disabled={isScanning}
                className="h-12 rounded-[10px] border border-border px-5 text-sm font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmPendingTally()}
                disabled={isScanning}
                className="h-12 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-60"
              >
                Confirm Tally
              </button>
            </div>
          </div>
        </div>
      )}

      {isScanning && pendingPreview && (
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
            : isProcessingScan
              ? "border-primary/30 bg-primary-tint"
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
        ) : isProcessingScan ? (
          <div className="flex min-h-[74px] flex-col justify-center gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-bold text-ink">Live Scan Status</h2>
              </div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-sm font-semibold text-primary">RECORDING</span>
            </div>
            <p className="text-sm font-medium text-primary">{message || "Recording scan..."}</p>
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
        <div className="hidden">
          <div className="flex h-[90px] items-center gap-3 rounded-2xl border border-border-soft bg-surface-muted px-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip-mint text-primary"><QrCode className="h-5 w-5" /></span>
            <div><p className="text-sm font-medium text-ink-muted">Today&apos;s Scans</p><p className="text-[22px] font-bold text-ink">{visibleTalliedUnits}</p></div>
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
        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div>
            <h2 className="text-lg font-semibold text-ink">Worker Totals</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{formatDate(tallyDate)}</p>
            <div className="mt-3 overflow-x-auto rounded-md border border-[#8f9bad] bg-white shadow-none">
              <table className="min-w-[420px] w-full border-collapse text-left text-xs">
                <thead className="bg-[#e7edf7] text-[11px] font-bold text-ink">
                  <tr>
                    <th className="border border-[#8f9bad] px-2 py-1">Worker</th>
                    <th className="border border-[#8f9bad] px-2 py-1 text-right">Items</th>
                    <th className="border border-[#8f9bad] px-2 py-1 text-right">Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="border border-[#aeb8c8] px-3 py-8 text-center text-ink-muted">
                        No job cards tallied for this date.
                      </td>
                    </tr>
                  ) : totals.map((row) => (
                    <tr key={row.staffId} className="hover:bg-surface-muted">
                      <td className="border border-[#aeb8c8] px-2 py-0.5 font-semibold text-ink">{row.staffName}</td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-right text-ink">{row.count}</td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-right font-bold text-primary">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink">Scanned Slips</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Showing saved scans for {formatDate(tallyDate)}.
            </p>
          <div className="mt-3 overflow-x-auto rounded-md border border-[#8f9bad] bg-white shadow-none">
            <table className="min-w-[900px] w-full border-collapse text-left text-xs">
              <thead className="bg-[#e7edf7] text-[11px] font-bold text-ink">
                <tr>
                  <th className="border border-[#8f9bad] px-2 py-1">Order</th>
                  <th className="border border-[#8f9bad] px-2 py-1">Garment</th>
                  <th className="border border-[#8f9bad] px-2 py-1">Stage</th>
                  <th className="border border-[#8f9bad] px-2 py-1">Worker</th>
                  <th className="border border-[#8f9bad] px-2 py-1">Tallied</th>
                  <th className="border border-[#8f9bad] px-2 py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleSlips.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-[#aeb8c8] px-3 py-8 text-center text-ink-muted">
                      Scan a returned job card to start this tally.
                    </td>
                  </tr>
                ) : (
                  visibleSlips.map((slip) => (
                    <tr key={slip.id} className="transition-colors hover:bg-surface-muted">
                      <td className="border border-[#aeb8c8] px-2 py-0.5">
                        <p className="font-semibold text-primary hover:underline">{slip.orderNumber}</p>
                        <p className="text-xs font-semibold text-ink-muted">{slip.slipCode}</p>
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-ink">
                        {slipGarmentLabel(slip)}
                      </td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5"><span className={`inline-flex rounded px-1.5 py-0 text-[10px] font-semibold leading-4 ${stageChipClass(slip.stage)}`}>{slip.stage}</span></td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-ink"><span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />{slip.staffName}</span></td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-ink-muted"><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{localTime(slip.talliedAt)}</span></td>
                      <td className="border border-[#aeb8c8] px-2 py-0.5 text-right font-bold text-primary">
                        {formatCurrency(slipPayableAmount(slip))}
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
