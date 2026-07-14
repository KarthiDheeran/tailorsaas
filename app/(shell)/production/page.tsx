"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Scissors } from "lucide-react";
import {
  completeJobCardAction,
  getJobCardsPageDataAction,
  moveJobCardStageAction,
  startJobCardAction,
  syncMissingJobCardsAction,
} from "@/app/(shell)/job-cards/actions";
import {
  updateCustomerFabricStatusAction,
} from "@/app/(shell)/inventory/actions";
import {
  updateWorkAssignmentAction,
} from "@/app/(shell)/staff/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { formatDate } from "@/components/orders/orders-table";
import {
  buildJobCards,
  type JobCard,
  type JobCardStage,
  type ProductionBucket,
} from "@/lib/job-cards";
import type {
  CustomerFabric,
  CustomerFabricStatus,
  Order,
  Staff,
  WorkAssignment,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { FabricInfo } from "@/components/job-cards/fabric-info";

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

const STAGE_OPTIONS: JobCardStage[] = [
  "Unassigned",
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Trial",
  "Alteration",
  "Delayed",
  "Ready",
];

function nextStageAfterCompletion(stage: JobCardStage): JobCardStage {
  if (stage === "Unassigned") return "Cutting";
  if (stage === "Cutting") return "Stitching";
  if (stage === "Stitching" || stage === "Embroidery" || stage === "Alteration") {
    return "Finishing";
  }
  if (stage === "Trial" || stage === "Finishing") return "Ready";
  return "Ready";
}

function completeActionLabel(card: JobCard): string {
  if (!card.persisted) return "Complete";
  const nextStage = nextStageAfterCompletion(card.stage);
  if (nextStage === "Ready") return "Mark Ready";
  return `Send to ${nextStage}`;
}

function startActionLabel(card: JobCard): string {
  if (card.stage !== "Unassigned" && card.stage !== "Delayed") return `Start ${card.stage}`;
  if (card.taskType) return `Start ${card.taskType}`;
  return "Start";
}

function ProductionCard({
  card,
  canUpdate,
  canMoveStages,
  canViewOrders,
  linkedFabrics,
  canManageFabricStatus,
  onFabricStatusChange,
  todayIso,
  onUpdated,
}: {
  card: JobCard;
  canUpdate: boolean;
  canMoveStages: boolean;
  canViewOrders: boolean;
  linkedFabrics: CustomerFabric[];
  canManageFabricStatus: boolean;
  onFabricStatusChange: (fabric: CustomerFabric, status: CustomerFabricStatus) => void;
  todayIso: string;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState<"start" | "complete" | "move" | null>(null);
  const [targetStage, setTargetStage] = useState<JobCardStage>(card.stage);
  const [stageReason, setStageReason] = useState("");
  useEffect(() => {
    setTargetStage(card.stage);
    setStageReason("");
  }, [card.stage]);
  const canStart = card.persisted
    ? Boolean(card.assignedStaffId && !card.startedDate && !card.completedDate)
    : Boolean(card.assignment && !card.assignment.startedDate && !card.assignment.completedDate);
  const canComplete = card.persisted
    ? Boolean(card.assignedStaffId && card.startedDate && !card.completedDate)
    : Boolean(card.assignment && card.assignment.startedDate && !card.assignment.completedDate);
  const completeLabel = completeActionLabel(card);

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

  async function handleMoveStage() {
    if (!card.persisted || targetStage === card.stage) return;
    if ((targetStage === "Delayed" || targetStage === "Alteration") && !stageReason.trim()) {
      window.alert(targetStage === "Delayed" ? "Delay reason is required." : "Rework reason is required.");
      return;
    }
    setSaving("move");
    const result = await moveJobCardStageAction(card.id, targetStage, todayIso, stageReason);
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
        <FabricInfo
          card={card}
          linkedFabrics={linkedFabrics}
          compact
          canManageStatus={canManageFabricStatus}
          onStatusChange={onFabricStatusChange}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canViewOrders && (
          <Link
            href={`/orders?view=${card.orderId}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View Order
          </Link>
        )}
        {canUpdate && canStart && (
          <button
            type="button"
            onClick={handleStart}
            disabled={saving !== null}
            className="rounded border border-border px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-surface"
          >
            {saving === "start" ? "Starting..." : startActionLabel(card)}
          </button>
        )}
        {canUpdate && canComplete && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={saving !== null}
            className="rounded border border-primary bg-primary-tint px-2 py-1 text-xs font-semibold text-primary"
          >
            {saving === "complete" ? "Completing..." : completeLabel}
          </button>
        )}
      </div>
      {canMoveStages && card.persisted && card.stage !== "Delivered" && card.stage !== "Cancelled" && (
        <div className="mt-3 border-t border-border-soft pt-3">
          <div className="flex items-center gap-2">
            <select
              value={targetStage}
              onChange={(event) => setTargetStage(event.target.value as JobCardStage)}
              className="h-8 min-w-0 flex-1 rounded border border-border bg-white px-2 text-xs text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            >
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleMoveStage}
              disabled={saving !== null || targetStage === card.stage}
              className="h-8 rounded border border-border px-2 text-xs font-semibold text-ink-muted hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving === "move" ? "Moving..." : "Move"}
            </button>
          </div>
          {(targetStage === "Delayed" || targetStage === "Alteration") && targetStage !== card.stage && (
            <textarea
              value={stageReason}
              onChange={(event) => setStageReason(event.target.value)}
              rows={2}
              placeholder={targetStage === "Delayed" ? "Delay reason" : "Rework / alteration reason"}
              className="mt-2 w-full rounded border border-border bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          )}
        </div>
      )}
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
  const { currentUser, hasPermission } = useCurrentUser();
  const canManageStaff = hasPermission("staff.manage");
  const canViewOrders = hasPermission("orders.view");
  const canManageInventory = hasPermission("inventory.manage");
  const currentStaffId = currentUser?.staff_id ?? null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [persistedCards, setPersistedCards] = useState<JobCard[] | null>(null);
  const [customerFabrics, setCustomerFabrics] = useState<CustomerFabric[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingCards, setSyncingCards] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJobCardsPageDataAction(todayIso)
      .then((result) => {
        if (cancelled) return;
        setPersistedCards(result.jobCards);
        setOrders(result.orders);
        setStaff(result.staff);
        setAssignments(result.assignments);
        setCustomerFabrics(result.customerFabrics ?? []);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load production board."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, todayIso]);

  const jobCards = useMemo(
    () => persistedCards ?? buildJobCards(orders, todayIso, assignments, staff),
    [persistedCards, orders, todayIso, assignments, staff]
  );
  const activeCards = jobCards.filter((card) => card.productionBucket !== "Closed");
  const customerFabricsByOrder = useMemo(() => {
    const byOrder = new Map<string, CustomerFabric[]>();
    for (const fabric of customerFabrics) {
      if (!fabric.orderId) continue;
      const current = byOrder.get(fabric.orderId) ?? [];
      current.push(fabric);
      byOrder.set(fabric.orderId, current);
    }
    return byOrder;
  }, [customerFabrics]);
  const cardsByBucket = new Map<ProductionBucket, JobCard[]>(
    BUCKETS.map((bucket) => [
      bucket,
      activeCards.filter((card) => card.productionBucket === bucket),
    ])
  );

  const unassigned = cardsByBucket.get("Unassigned")?.length ?? 0;
  const delayed = activeCards.filter((card) => card.isDelayed).length;
  const ready = cardsByBucket.get("Ready")?.length ?? 0;
  const activeOrderCount = orders.filter(
    (order) => order.status !== "Delivered" && order.status !== "Cancelled"
  ).length;
  const statusMismatchCount = jobCards.filter(
    (card) =>
      (card.orderStatus === "Ready" && card.stage !== "Ready") ||
      (card.orderStatus === "Delivered" && card.stage !== "Delivered") ||
      (card.orderStatus === "Cancelled" && card.stage !== "Cancelled")
  ).length;
  const canCreateMissingCards =
    canManageStaff && persistedCards !== null && activeCards.length === 0 && activeOrderCount > 0;
  const canSyncStatusMismatch =
    canManageStaff && persistedCards !== null && statusMismatchCount > 0;

  async function createMissingJobCards() {
    setSyncingCards(true);
    const result = await syncMissingJobCardsAction();
    setSyncingCards(false);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    setRefreshKey((key) => key + 1);
  }

  async function updateFabricStatus(fabric: CustomerFabric, status: CustomerFabricStatus) {
    const result = await updateCustomerFabricStatusAction(fabric.id, status, todayIso);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    setRefreshKey((key) => key + 1);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Production</h1>
        <p className="text-sm text-ink-muted">
          Workshop board for garment-level job cards.
        </p>
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => setRefreshKey((key) => key + 1)} />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading production board..." />
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
            {persistedCards === null
              ? "Production stages are shown from current order data until the job card migration is applied."
              : "Production stages are shown from garment-level job cards."}
          </div>

          {canCreateMissingCards && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-chip-peach bg-chip-peach p-4 text-sm text-chip-peach-fg shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">No job cards have been created yet.</div>
                <div>
                  Create garment-level job cards for {activeOrderCount} active order
                  {activeOrderCount === 1 ? "" : "s"} so Production can be tracked.
                </div>
              </div>
              <button
                type="button"
                onClick={createMissingJobCards}
                disabled={syncingCards}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncingCards ? "Creating..." : "Create Job Cards"}
              </button>
            </div>
          )}

          {canSyncStatusMismatch && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-chip-peach bg-chip-peach p-4 text-sm text-chip-peach-fg shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">Some job cards need status sync.</div>
                <div>
                  {statusMismatchCount} job card{statusMismatchCount === 1 ? "" : "s"} do not match their order status.
                </div>
              </div>
              <button
                type="button"
                onClick={createMissingJobCards}
                disabled={syncingCards}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncingCards ? "Syncing..." : "Sync Job Cards"}
              </button>
            </div>
          )}

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
                        canUpdate={canManageStaff || card.assignedStaffId === currentStaffId}
                        canMoveStages={canManageStaff}
                        canViewOrders={canViewOrders}
                        linkedFabrics={customerFabricsByOrder.get(card.orderId) ?? []}
                        canManageFabricStatus={canManageInventory}
                        onFabricStatusChange={updateFabricStatus}
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
        </>
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
