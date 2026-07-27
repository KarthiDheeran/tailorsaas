"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FileText, Loader2, X } from "lucide-react";
import { getActiveWorkStagesAction } from "@/app/(shell)/catalog/actions";
import { createJobCardStageSlipAction } from "@/app/(shell)/job-cards/actions";
import { getStaffAction } from "@/app/(shell)/staff/actions";
import type { CatalogWorkStage } from "@/lib/catalog";
import { staffGarmentStageRate } from "@/lib/staff-rates";
import type { Order, Staff, TaskType } from "@/lib/types";

export interface StageJobCardPrintTarget {
  serialNo: number;
}

type StagePrintSetupData = {
  staff: Staff[];
  workStages: CatalogWorkStage[];
};

let stagePrintSetupRequest: Promise<StagePrintSetupData> | null = null;

function getStagePrintSetupData() {
  if (!stagePrintSetupRequest) {
    stagePrintSetupRequest = Promise.all([
      getStaffAction(),
      getActiveWorkStagesAction(),
    ])
      .then(([staff, workStages]) => ({ staff, workStages }))
      .catch((error) => {
        stagePrintSetupRequest = null;
        throw error;
      });
  }
  return stagePrintSetupRequest;
}

export function StageJobCardPrintModal({
  order,
  target,
  onClose,
}: {
  order: Order;
  target: StageJobCardPrintTarget;
  onClose: () => void;
}) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [workStages, setWorkStages] = useState<CatalogWorkStage[]>([]);
  const selectedItem = order.items.find((item) => item.serialNo === target.serialNo);
  const [stage, setStage] = useState<TaskType>("Cutting");
  const activeStaff = useMemo(
    () => staff.filter((member) => member.status === "Active"),
    [staff]
  );
  const [staffId, setStaffId] = useState("");
  const selectedStaff = activeStaff.find((member) => member.id === staffId);
  const [rate, setRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const stageAddOns = useMemo(
    () =>
      (selectedItem?.addOns ?? [])
        .map((addOn) => {
          const amount = Number(addOn.workerStageRates?.[stage] ?? 0);
          return Number.isFinite(amount) && amount > 0
            ? { label: addOn.label, amount }
            : null;
        })
        .filter((addOn): addOn is { label: string; amount: number } => addOn !== null),
    [selectedItem, stage]
  );
  const stageAddOnTotal = stageAddOns.reduce((sum, addOn) => sum + addOn.amount, 0);

  useEffect(() => {
    let cancelled = false;
    getStagePrintSetupData().then(({ staff: staffResult, workStages: stages }) => {
      if (cancelled) return;
      setStaff(staffResult);
      setWorkStages(stages);
      setStage((current) =>
        stages.length > 0 && !stages.some((candidate) => candidate.stageKey === current)
          ? (stages[0].stageKey as TaskType)
          : current
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedStaff || selectedStaff.paymentType !== "Per Piece") {
      setRate(0);
      return;
    }
    const defaultRate = staffGarmentStageRate(selectedStaff, selectedItem?.garmentTypeId, stage);
    setRate(Number.isFinite(defaultRate) && defaultRate > 0 ? defaultRate : 0);
  }, [selectedItem?.garmentTypeId, selectedStaff, stage]);

  async function createPrintout() {
    if (!selectedItem) return;
    setSaving(true);
    setError("");
    const result = await createJobCardStageSlipAction({
      orderId: order.id,
      orderItemSerialNo: selectedItem.serialNo,
      unitNo: 1,
      stage,
      staffId,
      wageRate: rate,
      notes,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    window.open(`/orders/${order.id}/print/job-card?slipId=${result.data.id}`, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4 py-6 print:hidden">
      <button
        type="button"
        aria-label="Close print setup"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-job-card-title"
        className="relative w-full max-w-2xl rounded-xl border border-border-soft bg-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div>
            <h2 id="stage-job-card-title" className="text-xl font-semibold text-ink">
              Print Stage Job Card
            </h2>
            <p className="text-sm text-ink-muted">{order.orderNumber}</p>
            {selectedItem && (
              <p className="text-sm font-semibold text-primary">
                {selectedItem.serialNo} - {selectedItem.particular}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Stage
            <span className="relative block">
              <select
                value={stage}
                onChange={(event) => setStage(event.target.value as TaskType)}
                className="h-10 w-full appearance-none rounded-lg border border-border bg-white px-3 pr-10 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {workStages.map((task) => (
                  <option key={task.id} value={task.stageKey}>
                    {task.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
            </span>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            <span>
              Assign to <span className="text-red-600">*</span>
            </span>
            <span className="relative block">
              <select
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-border bg-white px-3 pr-10 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select worker</option>
                {activeStaff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} - {member.role}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
            </span>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2">
            Work Notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-10 rounded-lg border border-border px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Optional"
            />
          </label>

          <div className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ink">Worker add-ons for {stage}</p>
              <p className="font-bold text-primary">+₹{stageAddOnTotal}</p>
            </div>
            {stageAddOns.length === 0 ? (
              <p className="mt-1 text-xs text-ink-muted">
                No selected order add-ons have worker pay for this stage.
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-muted">
                {stageAddOns.map((addOn) => `${addOn.label} +₹${addOn.amount}`).join(", ")}
              </p>
            )}
          </div>
        </div>

        {error && <p className="px-5 pb-2 text-sm font-semibold text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createPrintout}
            disabled={saving || !selectedItem || !staffId}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Create Printout
          </button>
        </div>
      </div>
    </div>
  );
}
