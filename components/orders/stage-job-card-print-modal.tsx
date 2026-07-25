"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { createJobCardStageSlipAction } from "@/app/(shell)/job-cards/actions";
import { getStaffAction } from "@/app/(shell)/staff/actions";
import type { Order, Staff, TaskType } from "@/lib/types";

const TASK_TYPES: TaskType[] = [
  "Measurement",
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Alteration",
  "Ironing/Packing",
  "Delivery",
];

export interface StageJobCardPrintTarget {
  serialNo: number;
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

  useEffect(() => {
    let cancelled = false;
    getStaffAction().then((result) => {
      if (cancelled) return;
      setStaff(result);
      const firstActive = result.find((member) => member.status === "Active");
      if (firstActive) setStaffId((current) => current || firstActive.id);
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
    const defaultRate = Number(selectedStaff.pieceRates?.[stage] ?? 0);
    setRate(Number.isFinite(defaultRate) && defaultRate > 0 ? defaultRate : 0);
  }, [selectedStaff, stage]);

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
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value as TaskType)}
              className="h-10 rounded-lg border border-border px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {TASK_TYPES.map((task) => (
                <option key={task} value={task}>
                  {task}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Labourer / Worker
            <select
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
              className="h-10 rounded-lg border border-border px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select worker</option>
              {activeStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} - {member.role}
                </option>
              ))}
            </select>
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
