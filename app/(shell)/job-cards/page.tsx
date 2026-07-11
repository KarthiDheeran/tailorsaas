"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Scissors, Shirt, X } from "lucide-react";
import {
  assignJobCardAction,
  getJobCardsAction,
  syncMissingJobCardsAction,
} from "@/app/(shell)/job-cards/actions";
import {
  getCustomerFabricsAction,
  getInventoryItemsAction,
  updateCustomerFabricStatusAction,
} from "@/app/(shell)/inventory/actions";
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
import type {
  CustomerFabric,
  CustomerFabricStatus,
  InventoryItem,
  Order,
  Staff,
  StaffRole,
  TaskPriority,
  TaskType,
  WorkAssignment,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import {
  FabricInfo,
  JOB_CARD_FABRIC_SOURCES,
  type JobCardFabricSourceValue,
} from "@/components/job-cards/fabric-info";
import { CustomerFabricDrawer } from "@/components/job-cards/customer-fabric-drawer";
import { StockConsumptionDrawer } from "@/components/job-cards/stock-consumption-drawer";

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

const TASK_ROLE_MATCH: Record<TaskType, StaffRole[]> = {
  Measurement: ["Master Tailor", "Manager", "Owner/Admin"],
  Cutting: ["Cutter", "Master Tailor"],
  Stitching: ["Stitching Staff", "Master Tailor"],
  Embroidery: ["Embroidery Staff", "Master Tailor"],
  Finishing: ["Finishing Staff", "Master Tailor"],
  Alteration: ["Alteration Staff", "Master Tailor"],
  "Ironing/Packing": ["Finishing Staff", "Delivery Staff", "Master Tailor"],
  Delivery: ["Delivery Staff", "Manager", "Owner/Admin"],
};

function isRecommendedStaffForTask(member: Staff, taskType: TaskType) {
  return TASK_ROLE_MATCH[taskType].includes(member.role);
}

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
  const canViewOrders = hasPermission("orders.view");
  const canViewInventory = hasPermission("inventory.view");
  const canManageInventory = hasPermission("inventory.manage");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [persistedCards, setPersistedCards] = useState<JobCard[] | null>(null);
  const [customerFabrics, setCustomerFabrics] = useState<CustomerFabric[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [filter, setFilter] = useState<JobCardStage | "all" | "active">("active");
  const [assigningCard, setAssigningCard] = useState<JobCard | null>(null);
  const [fabricCard, setFabricCard] = useState<JobCard | null>(null);
  const [stockCard, setStockCard] = useState<JobCard | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only gates the very first load — refreshKey-triggered refetches (assign
  // work, etc.) shouldn't re-blank the table with a spinner. Note this is
  // distinct from persistedCards===null, which means "migration not applied"
  // after loading finishes, not "still loading".
  const [isLoading, setIsLoading] = useState(true);
  const [syncingCards, setSyncingCards] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJobCardsAction(todayIso),
      getOrdersAction(),
      getStaffAction(),
      getWorkAssignmentsAction(),
      canViewInventory ? getCustomerFabricsAction() : Promise.resolve([]),
      canViewInventory ? getInventoryItemsAction() : Promise.resolve([]),
    ])
      .then(
        ([
          jobCardsResult,
          ordersResult,
          staffResult,
          assignmentsResult,
          fabricsResult,
          inventoryItemsResult,
        ]) => {
          if (cancelled) return;
          setPersistedCards(jobCardsResult);
          setOrders(ordersResult);
          setStaff(staffResult.filter((member) => member.status === "Active"));
          setAssignments(assignmentsResult);
          setCustomerFabrics(fabricsResult ?? []);
          setInventoryItems(inventoryItemsResult ?? []);
          setLoadError(null);
        }
      )
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load job cards."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewInventory, refreshKey, todayIso]);

  const jobCards = useMemo(
    () => persistedCards ?? buildJobCards(orders, todayIso, assignments, staff),
    [persistedCards, orders, todayIso, assignments, staff]
  );
  const filteredCards = jobCards.filter((card) => {
    if (filter === "all") return true;
    if (filter === "active") return card.stage !== "Delivered" && card.stage !== "Cancelled";
    return card.stage === filter;
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

  const activeCount = jobCards.filter((c) => c.stage !== "Delivered" && c.stage !== "Cancelled").length;
  const unassignedCount = jobCards.filter((c) => c.stage === "Unassigned").length;
  const delayedCount = jobCards.filter((c) => c.isDelayed).length;
  const readyCount = jobCards.filter((c) => c.stage === "Ready").length;
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
    canManageStaff && persistedCards !== null && activeCount === 0 && activeOrderCount > 0;
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
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Job Cards</h1>
        <p className="text-sm text-ink-muted">
          Garment-level work cards for assignment, production, and delivery tracking.
        </p>
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => setRefreshKey((key) => key + 1)} />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading job cards..." />
      ) : (
        <>
          {persistedCards === null && (
            <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
              Showing job cards generated from orders. Apply the job card migration to track each card as
              its own production record.
            </div>
          )}

          {canCreateMissingCards && (
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-chip-peach bg-chip-peach p-4 text-sm text-chip-peach-fg shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">No job cards have been created yet.</div>
                <div>
                  Create garment-level job cards for {activeOrderCount} active order
                  {activeOrderCount === 1 ? "" : "s"}.
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
                  <th className="whitespace-nowrap px-5 py-3">Fabric</th>
                  <th className="whitespace-nowrap px-5 py-3">Due Date</th>
                  <th className="whitespace-nowrap px-5 py-3">Order Status</th>
                  {(canManageStaff || canManageInventory) && (
                    <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {filteredCards.map((card: JobCard) => {
                  const linkedFabrics = customerFabricsByOrder.get(card.orderId) ?? [];
                  return (
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
                      {canViewOrders ? (
                        <Link
                          href={`/orders?view=${card.orderId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {card.orderNumber}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink-muted">{card.orderNumber}</span>
                      )}
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
                    <td className="px-5 py-3 align-top">
                      <FabricInfo
                        card={card}
                        linkedFabrics={linkedFabrics}
                        canManageStatus={canManageInventory}
                        onStatusChange={updateFabricStatus}
                      />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className={card.isDelayed ? "font-semibold text-chip-red-fg" : "text-ink-muted"}>
                        {formatDate(card.deliveryDate)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <OrderStatusChip status={card.orderStatus} />
                    </td>
                    {(canManageStaff || canManageInventory) && (
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {canManageInventory && (
                            <>
                              <button
                                type="button"
                                onClick={() => setStockCard(card)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                              >
                                Use Stock
                              </button>
                              <button
                                type="button"
                                onClick={() => setFabricCard(card)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                              >
                                Add Fabric
                              </button>
                            </>
                          )}
                          {canManageStaff && (
                            <button
                              type="button"
                              onClick={() => setAssigningCard(card)}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                            >
                              Assign Work
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredCards.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-border-soft bg-white p-8 text-center text-sm text-ink-muted">
              No job cards match this view.
            </div>
          )}
        </>
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

      {fabricCard && (
        <CustomerFabricDrawer
          card={fabricCard}
          todayIso={todayIso}
          onClose={() => setFabricCard(null)}
          onSaved={() => {
            setFabricCard(null);
            setRefreshKey((key) => key + 1);
          }}
        />
      )}

      {stockCard && (
        <StockConsumptionDrawer
          card={stockCard}
          items={inventoryItems}
          todayIso={todayIso}
          onClose={() => setStockCard(null)}
          onSaved={() => {
            setStockCard(null);
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
  const [fabricSource, setFabricSource] = useState<JobCardFabricSourceValue>(
    card.fabricSource ?? "Not specified"
  );
  const [fabricNotes, setFabricNotes] = useState(card.fabricNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recommendedStaff = staff.filter((member) =>
    isRecommendedStaffForTask(member, taskType)
  );
  const otherStaff = staff.filter((member) => !isRecommendedStaffForTask(member, taskType));

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
          fabricSource,
          fabricNotes,
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
              {recommendedStaff.length > 0 ? (
                <>
                  <optgroup label={`Recommended for ${taskType}`}>
                    {recommendedStaff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} - {member.role}
                      </option>
                    ))}
                  </optgroup>
                  {otherStaff.length > 0 && (
                    <optgroup label="Other active staff">
                      {otherStaff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} - {member.role}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              ) : (
                staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} - {member.role}
                  </option>
                ))
              )}
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

          {card.persisted && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-muted">Fabric Source</span>
                <select
                  value={fabricSource}
                  onChange={(e) => setFabricSource(e.target.value as JobCardFabricSourceValue)}
                  className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  {JOB_CARD_FABRIC_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-muted">Fabric Notes</span>
                <textarea
                  value={fabricNotes}
                  onChange={(e) => setFabricNotes(e.target.value)}
                  rows={3}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                  placeholder="Customer fabric, shop fabric, lining, color, or handling notes"
                />
              </label>
            </>
          )}

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
