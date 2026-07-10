"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Scissors } from "lucide-react";
import {
  completeJobCardAction,
  getJobCardsAction,
  startJobCardAction,
} from "@/app/(shell)/job-cards/actions";
import { getOrdersAction } from "@/app/(shell)/orders/actions";
import {
  getStaffAction,
  getWorkAssignmentsAction,
  updateWorkAssignmentAction,
} from "@/app/(shell)/staff/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { formatDate } from "@/components/orders/orders-table";
import { buildJobCards, type JobCard, type ProductionBucket } from "@/lib/job-cards";
import type { Order, Staff, WorkAssignment } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUCKETS: ProductionBucket[] = [
  "Unassigned",
  "Cutting",
  "Stitching",
  "Finishing",
  "Trial / Alteration",
  "Ready",
];

const BUCKET_HELP: Record<ProductionBucket, string> = {
  Unassigned: "Waiting for staff assignment",
  Cutting: "To be cut",
  Stitching: "Tailoring in progress",
  Finishing: "Final finishing and QC",
  "Trial / Alteration": "Needs trial, correction, or rework",
  Ready: "Ready for pickup or delivery",
};

function ProductionCard({
  card,
  canManage,
  todayIso,
  onUpdated,
}: {
  card: JobCard;
  canManage: boolean;
  todayIso: string;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState<"start" | "complete" | null>(null);
  const canStart = card.persisted
    ? Boolean(card.assignedStaffId && !card.startedDate && !card.completedDate)
    : Boolean(card.assignment && !card.assignment.startedDate && !card.assignment.completedDate);
  const canComplete = card.persisted
    ? Boolean(card.assignedStaffId && card.startedDate && !card.completedDate)
    : Boolean(card.assignment && card.assignment.startedDate && !card.assignment.completedDate);

  async function handleStart() {
    if (!card.persisted && !card.assignment) return;
    setSaving("start");
    const result = card.persisted
      ? await startJobCardAction(card.id, todayIso)
      : await updateWorkAssignmentAction(card.assignment!.id, {
          startedDate: todayIso,
        });
    setSaving(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onUpdated();
  }

  async function handleComplete() {
    if (!card.persisted && !card.assignment) return;
    setSaving("complete");
    const result = card.persisted
      ? await completeJobCardAction(card.id, todayIso)
      : await updateWorkAssignmentAction(card.assignment!.id, {
          completedDate: todayIso,
        });
    setSaving(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onUpdated();
  }

  return (
    <div className="rounded-lg border border-border-soft bg-white p-3 shadow-soft">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-primary">{card.jobCardNumber}</div>
          <div className="text-xs text-ink-muted">{card.orderNumber}</div>
        </div>
        {card.isDelayed && (
          <span className="rounded-full bg-chip-red px-2 py-0.5 text-[11px] font-semibold text-chip-red-fg">
            Delayed
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs">
        <div className="font-semibold text-ink">{card.garment}</div>
        <div className="text-ink-muted">{card.customer?.name ?? "Unknown customer"}</div>
        <div className={card.isDelayed ? "font-medium text-chip-red-fg" : "text-ink-muted"}>
          Due {formatDate(card.deliveryDate)}
        </div>
        <div className="text-ink-muted">Assigned: {card.assignedTo}</div>
        {card.taskType && (
          <div className="text-ink-muted">
            Task: {card.taskType}
            {card.taskStatus ? ` - ${card.taskStatus}` : ""}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/orders?view=${card.orderId}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          View Order
        </Link>
        {canManage && canStart && (
          <button
            type="button"
            onClick={handleStart}
            disabled={saving !== null}
            className="rounded border border-border px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-surface"
          >
            {saving === "start" ? "Starting..." : "Start"}
          </button>
        )}
        {canManage && canComplete && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={saving !== null}
            className="rounded border border-primary bg-primary-tint px-2 py-1 text-xs font-semibold text-primary"
          >
            {saving === "complete" ? "Completing..." : "Complete"}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: number;
  tone?: "default" | "warning";
  icon: typeof Scissors;
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
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

function ProductionContent() {
  const { hasPermission } = useCurrentUser();
  const canManageStaff = hasPermission("staff.manage");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [persistedCards, setPersistedCards] = useState<JobCard[] | null>(null);
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
        setStaff(staffResult);
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
  const activeCards = jobCards.filter((card) => card.productionBucket !== "Closed");
  const cardsByBucket = new Map<ProductionBucket, JobCard[]>(
    BUCKETS.map((bucket) => [
      bucket,
      activeCards.filter((card) => card.productionBucket === bucket),
    ])
  );

  const unassigned = cardsByBucket.get("Unassigned")?.length ?? 0;
  const delayed = activeCards.filter((card) => card.isDelayed).length;
  const ready = cardsByBucket.get("Ready")?.length ?? 0;

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Production</h1>
        <p className="text-sm text-ink-muted">
          Workshop board for garment-level job cards.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
        {persistedCards === null
          ? "Production stages are shown from current order data until the job card migration is applied."
          : "Production stages are shown from garment-level job cards."}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Active Work" value={activeCards.length} icon={Clock} />
        <Stat label="Unassigned" value={unassigned} icon={Scissors} />
        <Stat label="Delayed" value={delayed} icon={AlertTriangle} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-6">
        {BUCKETS.map((bucket) => {
          const cards = cardsByBucket.get(bucket) ?? [];
          return (
            <section
              key={bucket}
              className="min-h-[260px] rounded-xl border border-border-soft bg-white/70 shadow-soft"
            >
              <div className="border-b border-border-soft p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">{bucket}</h2>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-muted">
                    {cards.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{BUCKET_HELP[bucket]}</p>
              </div>
              <div className="space-y-3 p-3">
                {cards.map((card) => (
                  <ProductionCard
                    key={card.id}
                    card={card}
                    canManage={canManageStaff}
                    todayIso={todayIso}
                    onUpdated={() => setRefreshKey((key) => key + 1)}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border-soft text-center text-xs text-ink-faint">
                    No job cards
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {ready > 0 && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {ready} job card{ready === 1 ? " is" : "s are"} ready for pickup or delivery.
        </div>
      )}
    </div>
  );
}

export default function ProductionPage() {
  return (
    <RequirePermission anyOf={["orders.view", "staff.view"]}>
      <ProductionContent />
    </RequirePermission>
  );
}
