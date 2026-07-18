"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Search, Scissors, X } from "lucide-react";
import {
  completeJobCardAction,
  getJobCardsPageDataAction,
  moveJobCardStageAction,
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
import { Select } from "@/components/ui/select";
import { measurementFieldLabel } from "@/lib/catalog";

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

const DUE_FILTERS = [
  "All",
  "Due Today",
  "Due Tomorrow",
  "Overdue",
  "This Week",
] as const;

type DueFilter = (typeof DUE_FILTERS)[number];

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayStage(card: JobCard): JobCardStage {
  if (!card.assignedStaffId && card.stage !== "Delivered" && card.stage !== "Cancelled") {
    return "Unassigned";
  }
  return card.stage;
}

function isDelayedCard(card: JobCard) {
  const stage = displayStage(card);
  return (
    card.isDelayed &&
    stage !== "Ready" &&
    stage !== "Delivered" &&
    stage !== "Cancelled"
  );
}

function matchesDueFilter(card: JobCard, dueFilter: DueFilter, todayIso: string) {
  const tomorrowIso = addDays(todayIso, 1);
  const weekEndIso = addDays(todayIso, 6);
  if (dueFilter === "All") return true;
  if (dueFilter === "Due Today") return card.deliveryDate === todayIso;
  if (dueFilter === "Due Tomorrow") return card.deliveryDate === tomorrowIso;
  if (dueFilter === "Overdue") return isDelayedCard(card);
  return card.deliveryDate >= todayIso && card.deliveryDate <= weekEndIso;
}

function matchesSearch(card: JobCard, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    card.jobCardNumber,
    card.orderNumber,
    card.customer?.name,
    card.customer?.phone,
    card.garment,
    card.assignedTo,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

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

function ProductionCard({
  card,
  linkedFabrics,
  onViewDetails,
}: {
  card: JobCard;
  linkedFabrics: CustomerFabric[];
  onViewDetails: () => void;
}) {
  const isDelayed = isDelayedCard(card);
  const hasMeasurements = Object.entries(card.item.measurements ?? {}).some(
    ([key, value]) => key !== "__measurementNotes" && value !== ""
  );
  const indicators = [
    card.fabricNotes ? "Fabric notes" : null,
    card.designNotes ? "Design notes" : null,
    hasMeasurements ? "Measurements" : null,
    linkedFabrics.length > 0 ? "Customer fabric" : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onViewDetails}
      className="block w-full bg-white p-3 text-left transition-colors hover:bg-surface"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-primary">{card.jobCardNumber}</div>
          <div className="text-xs text-ink-muted">{card.orderNumber}</div>
        </div>
        {isDelayed && (
          <span className="rounded-full bg-chip-red px-2 py-0.5 text-[11px] font-semibold text-chip-red-fg">
            Delayed
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs">
        <div className="font-semibold text-ink">{card.garment}</div>
        <div className="text-ink-muted">{card.customer?.name ?? "Unknown customer"}</div>
        <div className={isDelayed ? "font-medium text-chip-red-fg" : "text-ink-muted"}>
          Due {formatDate(card.deliveryDate)}
        </div>
        <div className="text-ink-muted">
          Assigned: {card.assignedStaffId ? card.assignedTo : "Unassigned"}
        </div>
        {indicators.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {indicators.map((indicator) => (
              <span
                key={indicator}
                className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-muted"
              >
                {indicator}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 text-xs font-semibold text-primary">View Details</div>
    </button>
  );
}

function ProductionCardActions({
  card,
  canUpdate,
  canMoveStages,
  canViewOrders,
  todayIso,
  onUpdated,
}: {
  card: JobCard;
  canUpdate: boolean;
  canMoveStages: boolean;
  canViewOrders: boolean;
  todayIso: string;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState<"complete" | "move" | null>(null);
  const [targetStage, setTargetStage] = useState<JobCardStage>(card.stage);
  const [stageReason, setStageReason] = useState("");
  useEffect(() => {
    setTargetStage(card.stage);
    setStageReason("");
  }, [card.stage]);
  const canComplete = card.persisted
    ? Boolean(card.assignedStaffId && !card.completedDate)
    : Boolean(card.assignment && !card.assignment.completedDate);
  const completeLabel = completeActionLabel(card);

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
    if (!card.assignedStaffId && targetStage !== "Unassigned") {
      window.alert("Assign a worker before moving this job card into production.");
      return;
    }
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
    <div className="border-t border-border-soft bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {canMoveStages && !card.assignedStaffId && (
          <Link
            href={`/job-cards?view=${card.id}`}
            className="rounded border border-primary bg-primary-tint px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-tint/80"
          >
            Assign Work
          </Link>
        )}
        {canViewOrders && (
          <Link
            href={`/orders?view=${card.orderId}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View Order
          </Link>
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
      {canMoveStages &&
        card.persisted &&
        card.assignedStaffId &&
        card.stage !== "Delivered" &&
        card.stage !== "Cancelled" && (
        <div className="mt-3 border-t border-border-soft pt-3">
          <div className="flex items-center gap-2">
            <Select
              value={targetStage}
              onChange={(event) => setTargetStage(event.target.value as JobCardStage)}
              className="h-8 min-w-0 flex-1 text-xs"
            >
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </Select>
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

function measurementEntries(card: JobCard) {
  return Object.entries(card.item.measurements ?? {})
    .filter(([key, value]) => key !== "__measurementNotes" && value !== "")
    .map(([key, value]) => ({ key, label: measurementFieldLabel(key), value }));
}

function ProductionDetailsDrawer({
  card,
  linkedFabrics,
  canManageFabricStatus,
  canViewOrders,
  onFabricStatusChange,
  onClose,
}: {
  card: JobCard;
  linkedFabrics: CustomerFabric[];
  canManageFabricStatus: boolean;
  canViewOrders: boolean;
  onFabricStatusChange: (fabric: CustomerFabric, status: CustomerFabricStatus) => void;
  onClose: () => void;
}) {
  const measurements = measurementEntries(card);
  const measurementNotes = card.item.measurements?.__measurementNotes;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{card.jobCardNumber}</h2>
            <p className="text-sm text-ink-muted">
              {card.garment}
              {card.totalUnits > 1 ? ` · Unit ${card.unitNo} of ${card.totalUnits}` : ""}
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

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-ink-muted">Order</p>
              {canViewOrders ? (
                <Link href={`/orders?view=${card.orderId}`} className="font-semibold text-primary hover:underline">
                  {card.orderNumber}
                </Link>
              ) : (
                <p className="font-semibold text-ink">{card.orderNumber}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Customer</p>
              <p className="font-semibold text-ink">{card.customer?.name ?? "Unknown"}</p>
              {card.customer?.phone && <p className="text-xs text-ink-muted">{card.customer.phone}</p>}
            </div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Stage</p>
              <p className="font-semibold text-ink">{displayStage(card)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Due Date</p>
              <p className={isDelayedCard(card) ? "font-semibold text-chip-red-fg" : "font-semibold text-ink"}>
                {formatDate(card.deliveryDate)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Assigned Worker</p>
              <p className="font-semibold text-ink">
                {card.assignedStaffId ? card.assignedTo : "Unassigned"}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Fabric / Notes</p>
            <div className="rounded-lg border border-border-soft p-3">
              <FabricInfo
                card={card}
                linkedFabrics={linkedFabrics}
                canManageStatus={canManageFabricStatus}
                onStatusChange={onFabricStatusChange}
              />
              {card.notes && (
                <p className="mt-3 whitespace-pre-wrap text-ink-muted">
                  <span className="font-semibold text-ink">Work Notes: </span>
                  {card.notes}
                </p>
              )}
            </div>
          </div>

          {(measurements.length > 0 || measurementNotes) && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Measurements</p>
              <div className="rounded-lg border border-border-soft p-3">
                {measurements.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {measurements.map((entry) => (
                      <div key={entry.key}>
                        <dt className="text-xs text-ink-muted">{entry.label}</dt>
                        <dd className="font-semibold text-ink">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {measurementNotes && (
                  <p className="mt-3 whitespace-pre-wrap text-ink-muted">
                    <span className="font-semibold text-ink">Measurement Notes: </span>
                    {measurementNotes}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
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
  const [query, setQuery] = useState("");
  const [workerFilter, setWorkerFilter] = useState("all");
  const [garmentFilter, setGarmentFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("All");
  const [detailsCard, setDetailsCard] = useState<JobCard | null>(null);
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
  const garmentOptions = useMemo(
    () => Array.from(new Set(activeCards.map((card) => card.garment))).sort(),
    [activeCards]
  );
  const filteredCards = activeCards.filter((card) => {
    if (!matchesSearch(card, query)) return false;
    if (workerFilter !== "all" && (card.assignedStaffId ?? "unassigned") !== workerFilter) {
      return false;
    }
    if (garmentFilter !== "all" && card.garment !== garmentFilter) return false;
    if (!matchesDueFilter(card, dueFilter, todayIso)) return false;
    return true;
  });
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
      filteredCards.filter((card) => card.productionBucket === bucket),
    ])
  );

  const unassigned = activeCards.filter((card) => !card.assignedStaffId).length;
  const delayed = activeCards.filter(isDelayedCard).length;
  const ready = activeCards.filter((card) => card.productionBucket === "Ready").length;
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

          <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search job card, order, customer, phone, garment, worker..."
                  className="h-11 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:w-[600px]">
                <Select
                  value={workerFilter}
                  onChange={(event) => setWorkerFilter(event.target.value)}
                >
                  <option value="all">Worker: All</option>
                  <option value="unassigned">Worker: Unassigned</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={dueFilter}
                  onChange={(event) => setDueFilter(event.target.value as DueFilter)}
                >
                  {DUE_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      Due: {option}
                    </option>
                  ))}
                </Select>
                <Select
                  value={garmentFilter}
                  onChange={(event) => setGarmentFilter(event.target.value)}
                >
                  <option value="all">Garment: All</option>
                  {garmentOptions.map((garment) => (
                    <option key={garment} value={garment}>
                      {garment}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
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
                      <div
                        key={card.id}
                        className="overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft"
                      >
                        <ProductionCard
                          card={card}
                          linkedFabrics={customerFabricsByOrder.get(card.orderId) ?? []}
                          onViewDetails={() => setDetailsCard(card)}
                        />
                        <ProductionCardActions
                          card={card}
                          canUpdate={canManageStaff || card.assignedStaffId === currentStaffId}
                          canMoveStages={canManageStaff}
                          canViewOrders={canViewOrders}
                          todayIso={todayIso}
                          onUpdated={() => setRefreshKey((key) => key + 1)}
                        />
                      </div>
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

          {detailsCard && (
            <ProductionDetailsDrawer
              card={detailsCard}
              linkedFabrics={customerFabricsByOrder.get(detailsCard.orderId) ?? []}
              canManageFabricStatus={canManageInventory}
              canViewOrders={canViewOrders}
              onFabricStatusChange={updateFabricStatus}
              onClose={() => setDetailsCard(null)}
            />
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
