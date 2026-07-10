"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Scissors, Shirt, X } from "lucide-react";
import {
  assignJobCardAction,
  getJobCardsAction,
} from "@/app/(shell)/job-cards/actions";
import { getOrdersAction } from "@/app/(shell)/orders/actions";
import {
  createWorkAssignmentAction,
  getStaffAction,
  getWorkAssignmentsAction,
} from "@/app/(shell)/staff/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { formatDate, OrderStatusChip } from "@/components/orders/orders-table";
import { buildJobCards, type JobCard, type JobCardStage } from "@/lib/job-cards";
import type { Order, Staff, TaskPriority, TaskType, WorkAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { label: string; value: JobCardStage | "all" | "active" }[] = [
  { label: "Active", value: "active" },
  { label: "All", value: "all" },
  { label: "Unassigned", value: "Unassigned" },
  { label: "Delayed", value: "Delayed" },
  { label: "Ready", value: "Ready" },
  { label: "Delivered", value: "Delivered" },
  { label: "Cancelled", value: "Cancelled" },
];

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

const PRIORITIES: TaskPriority[] = ["Low", "Normal", "High"];

function StageBadge({ stage }: { stage: JobCardStage }) {
  const styles: Record<JobCardStage, string> = {
    Unassigned: "bg-chip-info text-chip-info-fg",
    Cutting: "bg-chip-blue text-chip-blue-fg",
    Stitching: "bg-chip-blue text-chip-blue-fg",
    Embroidery: "bg-chip-blue text-chip-blue-fg",
    Finishing: "bg-chip-purple text-chip-purple-fg",
    Trial: "bg-chip-info text-chip-info-fg",
    Alteration: "bg-chip-red text-chip-red-fg",
    Delayed: "bg-chip-red text-chip-red-fg",
    Ready: "bg-chip-purple text-chip-purple-fg",
    Delivered: "bg-chip-mint text-chip-mint-fg",
    Cancelled: "bg-chip-info text-chip-info-fg",
  };
  return (
    <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-semibold", styles[stage])}>
      {stage}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof ClipboardList;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            tone === "warning" ? "bg-chip-red text-chip-red-fg" : "bg-primary-tint text-primary"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={cn("text-[26px] font-semibold", tone === "warning" ? "text-chip-red-fg" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}

function JobCardsContent() {
  const { hasPermission } = useCurrentUser();
  const canManageStaff = hasPermission("staff.manage");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [persistedCards, setPersistedCards] = useState<JobCard[] | null>(null);
  const [filter, setFilter] = useState<JobCardStage | "all" | "active">("active");
  const [assigningCard, setAssigningCard] = useState<JobCard | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJobCardsAction(todayIso),
      getOrdersAction(),
      getStaffAction(),
      getWorkAssignmentsAction(),
    ]).then(
      ([jobCardsResult, ordersResult, staffResult, assignmentsResult]) => {
        if (cancelled) return;
        setPersistedCards(jobCardsResult);
        setOrders(ordersResult);
        setStaff(staffResult.filter((member) => member.status === "Active"));
        setAssignments(assignmentsResult);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey, todayIso]);

  const jobCards = useMemo(
    () => persistedCards ?? buildJobCards(orders, todayIso, assignments, staff),
    [persistedCards, orders, todayIso, assignments, staff]
  );
  const filteredCards = jobCards.filter((card) => {
    if (filter === "all") return true;
    if (filter === "active") return card.stage !== "Delivered" && card.stage !== "Cancelled";
    return card.stage === filter;
  });

  const activeCount = jobCards.filter((c) => c.stage !== "Delivered" && c.stage !== "Cancelled").length;
  const unassignedCount = jobCards.filter((c) => c.stage === "Unassigned").length;
  const delayedCount = jobCards.filter((c) => c.isDelayed).length;
  const readyCount = jobCards.filter((c) => c.stage === "Ready").length;

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Job Cards</h1>
        <p className="text-sm text-ink-muted">
          Garment-level work cards for assignment, production, and delivery tracking.
        </p>
      </div>

      {persistedCards === null && (
        <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
          Showing job cards generated from orders. Apply the job card migration to track each card as
          its own production record.
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Active Job Cards" value={activeCount} icon={ClipboardList} />
        <SummaryCard label="Unassigned" value={unassignedCount} icon={Scissors} />
        <SummaryCard label="Delayed" value={delayedCount} icon={AlertTriangle} tone="warning" />
        <SummaryCard label="Ready" value={readyCount} icon={Shirt} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
              filter === option.value
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface hover:text-ink"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
        <table className="w-full text-left">
          <thead className="text-[13px] font-semibold text-ink-muted">
            <tr className="border-b border-border-soft">
              <th className="whitespace-nowrap px-5 py-3">Job Card</th>
              <th className="whitespace-nowrap px-5 py-3">Customer</th>
              <th className="whitespace-nowrap px-5 py-3">Garment</th>
              <th className="whitespace-nowrap px-5 py-3">Order</th>
              <th className="whitespace-nowrap px-5 py-3">Assigned To</th>
              <th className="whitespace-nowrap px-5 py-3">Stage</th>
              <th className="whitespace-nowrap px-5 py-3">Due Date</th>
              <th className="whitespace-nowrap px-5 py-3">Order Status</th>
              {canManageStaff && (
                <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {filteredCards.map((card: JobCard) => (
              <tr key={card.id} className="border-t border-border-soft hover:bg-surface">
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                  {card.jobCardNumber}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-medium text-ink">{card.customer?.name ?? "Unknown"}</div>
                  <div className="text-xs text-ink-muted">{card.customer?.phone ?? ""}</div>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink">
                  {card.garment}
                  {card.totalUnits > 1 && (
                    <span className="ml-1 text-xs text-ink-muted">
                      #{card.unitNo} of {card.totalUnits}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <Link href={`/orders?view=${card.orderId}`} className="font-medium text-primary hover:underline">
                    {card.orderNumber}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{card.assignedTo}</td>
                <td className="whitespace-nowrap px-5 py-3">
                  <StageBadge stage={card.stage} />
                  {card.taskType && (
                    <div className="mt-1 text-xs text-ink-muted">
                      {card.taskType}
                      {card.taskStatus ? ` - ${card.taskStatus}` : ""}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span className={card.isDelayed ? "font-semibold text-chip-red-fg" : "text-ink-muted"}>
                    {formatDate(card.deliveryDate)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <OrderStatusChip status={card.orderStatus} />
                </td>
                {canManageStaff && (
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setAssigningCard(card)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                    >
                      Assign Work
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredCards.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border-soft bg-white p-8 text-center text-sm text-ink-muted">
          No job cards match this view.
        </div>
      )}

      {assigningCard && (
        <AssignWorkDrawer
          card={assigningCard}
          staff={staff}
          todayIso={todayIso}
          onClose={() => setAssigningCard(null)}
          onAssigned={() => {
            setAssigningCard(null);
            setRefreshKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}

function AssignWorkDrawer({
  card,
  staff,
  todayIso,
  onClose,
  onAssigned,
}: {
  card: JobCard;
  staff: Staff[];
  todayIso: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [taskType, setTaskType] = useState<TaskType>(card.taskType ?? "Cutting");
  const [staffId, setStaffId] = useState(card.assignedStaffId ?? "");
  const [dueDate, setDueDate] = useState(card.assignment?.dueDate ?? card.deliveryDate);
  const [priority, setPriority] = useState<TaskPriority>(card.priority ?? "Normal");
  const [workNotes, setWorkNotes] = useState(card.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!staffId) {
      setError("Select a staff member.");
      return;
    }
    setSaving(true);
    const result = card.persisted
      ? await assignJobCardAction(card.id, {
          taskType,
          assignedStaffId: staffId,
          dueDate,
          priority,
          notes: workNotes,
        })
      : await createWorkAssignmentAction({
          orderId: card.orderId,
          orderItemSerialNo: card.item.serialNo,
          taskType,
          assignedStaffId: staffId,
          assignedDate: todayIso,
          dueDate,
          priority,
          workNotes,
        });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onAssigned();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Assign Work</h2>
            <p className="text-sm text-ink-muted">
              {card.jobCardNumber} - {card.garment}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Task</span>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as TaskType)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            >
              {TASK_TYPES.map((task) => (
                <option key={task} value={task}>
                  {task}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Staff Member</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            >
              <option value="">Select staff</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} - {member.role}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Due Date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Work Notes</span>
            <textarea
              value={workNotes}
              onChange={(e) => setWorkNotes(e.target.value)}
              rows={4}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              placeholder="Stitching instructions, fabric notes, or trial details"
            />
          </label>

          {error && (
            <div className="rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Assigning..." : "Assign Work"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function JobCardsPage() {
  return (
    <RequirePermission anyOf={["orders.view", "staff.view"]}>
      <JobCardsContent />
    </RequirePermission>
  );
}
