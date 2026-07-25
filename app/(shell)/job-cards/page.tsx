"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Barcode,
  ClipboardList,
  MoreVertical,
  Printer,
  Scissors,
  Search,
  Shirt,
  X,
} from "lucide-react";
import {
  assignJobCardAction,
  completeJobCardAction,
  getJobCardActivityLogsAction,
  getJobCardsPageDataAction,
  moveJobCardStageAction,
  syncMissingJobCardsAction,
} from "@/app/(shell)/job-cards/actions";
import {
  updateCustomerFabricStatusAction,
} from "@/app/(shell)/inventory/actions";
import {
  createWorkAssignmentAction,
  updateWorkAssignmentAction,
} from "@/app/(shell)/staff/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { formatDate } from "@/components/orders/orders-table";
import { buildJobCards, type JobCard, type JobCardStage } from "@/lib/job-cards";
import type {
  CustomerFabric,
  CustomerFabricStatus,
  InventoryItem,
  InventoryMovement,
  JobCardActivityLog,
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
import { Select } from "@/components/ui/select";
import {
  FabricInfo,
  JOB_CARD_FABRIC_SOURCES,
  type JobCardFabricSourceValue,
} from "@/components/job-cards/fabric-info";
import { CustomerFabricDrawer } from "@/components/job-cards/customer-fabric-drawer";
import { StockConsumptionDrawer } from "@/components/job-cards/stock-consumption-drawer";
import { measurementFieldLabel } from "@/lib/catalog";

const FILTERS: { label: string; value: JobCardStage | "all" | "active" | "delayed" }[] = [
  { label: "Active", value: "active" },
  { label: "All", value: "all" },
  { label: "Unassigned", value: "Unassigned" },
  { label: "Delayed", value: "delayed" },
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

const STAGE_FILTERS: (JobCardStage | "all")[] = [
  "all",
  "Unassigned",
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Trial",
  "Alteration",
  "Ready",
  "Delivered",
  "Cancelled",
];

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

function jobCardPrintUrl(card: JobCard) {
  const params = new URLSearchParams();
  if (card.persisted) {
    params.set("jobCardId", card.id);
  } else {
    params.set("orderItemSerialNo", String(card.item.serialNo));
    params.set("unitNo", String(card.unitNo));
  }
  return `/orders/${card.orderId}/job-cards/print?${params.toString()}`;
}

function isActiveCard(card: JobCard) {
  const stage = displayStage(card);
  return stage !== "Delivered" && stage !== "Cancelled";
}

function isDelayedCard(card: JobCard) {
  return card.isDelayed && isActiveCard(card) && displayStage(card) !== "Ready";
}

function displayStage(card: JobCard): JobCardStage {
  if (!card.assignedStaffId && card.stage !== "Delivered" && card.stage !== "Cancelled") {
    return "Unassigned";
  }
  return card.stage;
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

function createdAtMillis(card: JobCard) {
  if (!card.createdAt) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(card.createdAt);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function defaultJobCardSort(a: JobCard, b: JobCard) {
  const createdDiff = createdAtMillis(b) - createdAtMillis(a);
  if (createdDiff !== 0) return createdDiff;
  const orderDiff = b.orderNumber.localeCompare(a.orderNumber, undefined, {
    numeric: true,
  });
  if (orderDiff !== 0) return orderDiff;
  return a.item.serialNo - b.item.serialNo || a.unitNo - b.unitNo;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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

function customerFabricsForJobCard(card: JobCard, fabrics: CustomerFabric[]) {
  return fabrics.filter((fabric) => fabric.notes?.includes(card.jobCardNumber));
}

function GarmentCell({ card }: { card: JobCard }) {
  return (
    <div>
      <div className="font-medium text-ink">{card.garment}</div>
      {card.totalUnits > 1 && (
        <div className="text-xs text-ink-muted">
          Unit {card.unitNo} of {card.totalUnits}
        </div>
      )}
    </div>
  );
}

const MEASUREMENT_NOTES_KEY = "__measurementNotes";
const MEASUREMENT_NOTE_KEYS = new Set([
  MEASUREMENT_NOTES_KEY,
  "measurementNotes",
  "measurement_notes",
  "notes",
]);

function measurementEntries(card: JobCard) {
  const values = card.item.measurements;
  if (!values) return { entries: [], notes: "" };
  const entries: { key: string; label: string; value: string }[] = [];
  let notes = "";
  for (const [key, value] of Object.entries(values)) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) continue;
    if (MEASUREMENT_NOTE_KEYS.has(key)) {
      if (!notes) notes = text;
      continue;
    }
    entries.push({ key, label: measurementFieldLabel(key), value: text });
  }
  return { entries, notes };
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof ClipboardList;
  tone?: "default" | "warning";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border-soft bg-white p-5 text-left shadow-soft transition-colors hover:bg-surface"
    >
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
    </button>
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
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [filter, setFilter] = useState<JobCardStage | "all" | "active" | "delayed">("active");
  const [query, setQuery] = useState("");
  const [assignedWorkerFilter, setAssignedWorkerFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<JobCardStage | "all">("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("All");
  const [garmentFilter, setGarmentFilter] = useState("all");
  const [focusedJobCardId, setFocusedJobCardId] = useState<string | null>(null);
  const [assigningCard, setAssigningCard] = useState<JobCard | null>(null);
  const [detailsCard, setDetailsCard] = useState<JobCard | null>(null);
  const [historyCard, setHistoryCard] = useState<JobCard | null>(null);
  const [fabricCard, setFabricCard] = useState<JobCard | null>(null);
  const [stockCard, setStockCard] = useState<JobCard | null>(null);
  const [openMenuCardId, setOpenMenuCardId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only gates the very first load — refreshKey-triggered refetches (assign
  // work, etc.) shouldn't re-blank the table with a spinner. Note this is
  // distinct from persistedCards===null, which means "migration not applied"
  // after loading finishes, not "still loading".
  const [isLoading, setIsLoading] = useState(true);
  const [syncingCards, setSyncingCards] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewJobCardId = params.get("view");
    const filterParam = params.get("filter");
    const stageParam = params.get("stage");
    const assignedParam = params.get("assigned");
    let consumedParam = false;

    if (viewJobCardId) {
      setFocusedJobCardId(viewJobCardId);
      setFilter("all");
      consumedParam = true;
    }
    if (
      filterParam &&
      FILTERS.some((option) => option.value === filterParam)
    ) {
      setFilter(filterParam as JobCardStage | "all" | "active" | "delayed");
      consumedParam = true;
    }
    if (stageParam && STAGE_FILTERS.includes(stageParam as JobCardStage | "all")) {
      setStageFilter(stageParam as JobCardStage | "all");
      consumedParam = true;
    }
    if (assignedParam === "unassigned") {
      setAssignedWorkerFilter("unassigned");
      consumedParam = true;
    }
    if (consumedParam) {
      window.history.replaceState({}, "", "/job-cards");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJobCardsPageDataAction(todayIso, {
      includeInventoryItems: canViewInventory || canManageInventory,
    })
      .then((result) => {
        if (cancelled) return;
        setPersistedCards(result.jobCards);
        setOrders(result.orders);
        setStaff(result.staff.filter((member) => member.status === "Active"));
        setAssignments(result.assignments);
        setCustomerFabrics(result.customerFabrics ?? []);
        setInventoryItems(result.inventoryItems ?? []);
        setInventoryMovements(result.inventoryMovements ?? []);
        setLoadError(null);
      })
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
  }, [canManageInventory, canViewInventory, refreshKey, todayIso]);

  const jobCards = useMemo(
    () =>
      (persistedCards ?? buildJobCards(orders, todayIso, assignments, staff))
        .slice()
        .sort(defaultJobCardSort),
    [persistedCards, orders, todayIso, assignments, staff]
  );

  useEffect(() => {
    if (!detailsCard) return;
    const updatedCard = jobCards.find((card) => card.id === detailsCard.id);
    if (updatedCard && updatedCard !== detailsCard) {
      setDetailsCard(updatedCard);
    }
  }, [detailsCard, jobCards]);

  const garmentOptions = useMemo(
    () => Array.from(new Set(jobCards.map((card) => card.garment))).sort(),
    [jobCards]
  );
  const filteredCards = jobCards.filter((card) => {
    const stage = displayStage(card);
    if (!matchesSearch(card, query)) return false;
    if (filter === "active" && !isActiveCard(card)) return false;
    if (filter === "delayed" && !isDelayedCard(card)) return false;
    if (filter !== "all" && filter !== "active" && filter !== "delayed" && stage !== filter) {
      return false;
    }
    if (assignedWorkerFilter !== "all" && (card.assignedStaffId ?? "unassigned") !== assignedWorkerFilter) {
      return false;
    }
    if (stageFilter !== "all" && stage !== stageFilter) return false;
    if (!matchesDueFilter(card, dueFilter, todayIso)) return false;
    if (garmentFilter !== "all" && card.garment !== garmentFilter) return false;
    return true;
  });

  useEffect(() => {
    if (!focusedJobCardId || isLoading) return;
    const row = document.querySelector(`[data-job-card-id="${focusedJobCardId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [filteredCards, focusedJobCardId, isLoading]);
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
  const inventoryItemsById = useMemo(
    () => new Map(inventoryItems.map((item) => [item.id, item])),
    [inventoryItems]
  );
  const stockMovementsByJobCard = useMemo(() => {
    const byJobCard = new Map<string, InventoryMovement[]>();
    for (const movement of inventoryMovements) {
      if (!movement.jobCardId || movement.movementType !== "Stock Out") continue;
      const current = byJobCard.get(movement.jobCardId) ?? [];
      current.push(movement);
      byJobCard.set(movement.jobCardId, current);
    }
    return byJobCard;
  }, [inventoryMovements]);

  const activeCount = jobCards.filter(isActiveCard).length;
  const unassignedCount = jobCards.filter((c) => isActiveCard(c) && !c.assignedStaffId).length;
  const delayedCount = jobCards.filter(isDelayedCard).length;
  const readyCount = jobCards.filter((c) => displayStage(c) === "Ready").length;
  const activeOrderCount = orders.filter(
    (order) => order.status !== "Delivered" && order.status !== "Cancelled"
  ).length;
  const statusMismatchCount = jobCards.filter(
    (card) =>
      (card.orderStatus === "Ready" && displayStage(card) !== "Ready") ||
      (card.orderStatus === "Delivered" && displayStage(card) !== "Delivered") ||
      (card.orderStatus === "Cancelled" && displayStage(card) !== "Cancelled")
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
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Job Cards</h1>
          <p className="text-sm text-ink-muted">
            Garment-level work cards for assignment, production, and delivery tracking.
          </p>
        </div>
        {canManageStaff && (
          <Link
            href="/job-cards/tally"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            <Barcode className="h-4 w-4" />
            Tally Scans
          </Link>
        )}
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
            <SummaryCard label="Active Job Cards" value={activeCount} icon={ClipboardList} onClick={() => setFilter("active")} />
            <SummaryCard label="Unassigned" value={unassignedCount} icon={Scissors} onClick={() => setFilter("Unassigned")} />
            <SummaryCard label="Delayed" value={delayedCount} icon={AlertTriangle} tone="warning" onClick={() => setFilter("delayed")} />
            <SummaryCard label="Ready" value={readyCount} icon={Shirt} onClick={() => setFilter("Ready")} />
          </div>

          <div className="mb-5 space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search job card, order, customer, phone, garment, worker..."
                className="h-11 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </label>

            <div className="flex flex-wrap gap-2">
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

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                value={assignedWorkerFilter}
                onChange={(event) => setAssignedWorkerFilter(event.target.value)}
              >
                <option value="all">Assigned Worker: All</option>
                <option value="unassigned">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
              <Select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value as JobCardStage | "all")}
              >
                {STAGE_FILTERS.map((stage) => (
                  <option key={stage} value={stage}>
                    Stage: {stage === "all" ? "All" : stage}
                  </option>
                ))}
              </Select>
              <Select
                value={dueFilter}
                onChange={(event) => setDueFilter(event.target.value as DueFilter)}
              >
                {DUE_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    Due Date: {option}
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

          <div className="overflow-visible rounded-xl border border-border-soft bg-white shadow-soft">
            <table className="w-full table-fixed text-left">
              <thead className="text-[13px] font-semibold text-ink-muted">
                <tr className="border-b border-border-soft">
                  <th className="w-[13%] whitespace-nowrap px-4 py-3">Order</th>
                  <th className="w-[14%] whitespace-nowrap px-4 py-3">Job Card</th>
                  <th className="w-[17%] whitespace-nowrap px-4 py-3">Customer</th>
                  <th className="w-[13%] whitespace-nowrap px-4 py-3">Garment</th>
                  <th className="w-[14%] whitespace-nowrap px-4 py-3">Assigned To</th>
                  <th className="w-[10%] whitespace-nowrap px-4 py-3">Stage</th>
                  <th className="w-[10%] whitespace-nowrap px-4 py-3">Due Date</th>
                  <th className="w-[190px] whitespace-nowrap bg-white px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {filteredCards.map((card: JobCard) => {
                  return (
                  <tr
                    key={card.id}
                    data-job-card-id={card.id}
                    className={cn(
                      "border-t border-border-soft hover:bg-surface",
                      focusedJobCardId === card.id && "bg-primary-tint ring-2 ring-primary/30"
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
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
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailsCard(card)}
                        className="font-semibold text-primary hover:underline"
                      >
                        {card.jobCardNumber}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-medium text-ink">{card.customer?.name ?? "Unknown"}</div>
                      <div className="text-xs text-ink-muted">{card.customer?.phone ?? ""}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">
                      <GarmentCell card={card} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {card.assignedStaffId ? card.assignedTo : "Unassigned"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StageBadge stage={displayStage(card)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={card.isDelayed ? "font-semibold text-chip-red-fg" : "text-ink-muted"}>
                        {formatDate(card.deliveryDate)}
                      </span>
                      {isDelayedCard(card) && (
                        <div className="mt-1 text-xs font-semibold text-chip-red-fg">
                          Delayed
                        </div>
                      )}
                    </td>
                    <td className="w-[190px] whitespace-nowrap bg-white px-4 py-3 text-right">
                      <div className="relative flex items-center justify-end gap-2">
                        {canManageStaff && !card.assignedStaffId ? (
                          <button
                            type="button"
                            onClick={() => setAssigningCard(card)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                          >
                            Assign Work
                          </button>
                        ) : (
                          <Link
                            href={jobCardPrintUrl(card)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print Job Card
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuCardId((current) => (current === card.id ? null : card.id))
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                          aria-label="More actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenuCardId === card.id && (
                          <>
                            <button
                              type="button"
                              aria-label="Close menu"
                              className="fixed inset-0 z-10 cursor-default"
                              onClick={() => setOpenMenuCardId(null)}
                            />
                            <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-lg border border-border-soft bg-white text-left shadow-soft">
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailsCard(card);
                                  setOpenMenuCardId(null);
                                }}
                                className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface"
                              >
                                View Details
                              </button>
                              {canManageStaff && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssigningCard(card);
                                    setOpenMenuCardId(null);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface"
                                >
                                  Reassign Work
                                </button>
                              )}
                              <Link
                                href={jobCardPrintUrl(card)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOpenMenuCardId(null)}
                                className="block px-3 py-2 text-xs font-medium text-ink hover:bg-surface"
                              >
                                {card.assignedStaffId ? "Reprint" : "Print Job Card"}
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setHistoryCard(card);
                                  setOpenMenuCardId(null);
                                }}
                                className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface"
                              >
                                History
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
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

      {detailsCard && (
        <JobCardDetailsDrawer
          card={detailsCard}
          linkedFabrics={customerFabricsForJobCard(
            detailsCard,
            customerFabricsByOrder.get(detailsCard.orderId) ?? []
          )}
          jobCardFabrics={customerFabricsForJobCard(
            detailsCard,
            customerFabricsByOrder.get(detailsCard.orderId) ?? []
          )}
          stockMovements={stockMovementsByJobCard.get(detailsCard.id) ?? []}
          inventoryItemsById={inventoryItemsById}
          canManageStatus={canManageInventory}
          canManageInventory={canManageInventory}
          canManageStage={canManageStaff}
          todayIso={todayIso}
          onFabricStatusChange={updateFabricStatus}
          onAssign={() => {
            setAssigningCard(detailsCard);
            setDetailsCard(null);
          }}
          onUpdated={() => setRefreshKey((key) => key + 1)}
          onHistory={() => {
            setHistoryCard(detailsCard);
            setDetailsCard(null);
          }}
          onRecordFabric={() => {
            setFabricCard(detailsCard);
            setDetailsCard(null);
          }}
          onUseStock={() => {
            setStockCard(detailsCard);
            setDetailsCard(null);
          }}
          onClose={() => setDetailsCard(null)}
        />
      )}

      {fabricCard && (
        <CustomerFabricDrawer
          card={fabricCard}
          existingFabrics={customerFabricsForJobCard(
            fabricCard,
            customerFabricsByOrder.get(fabricCard.orderId) ?? []
          )}
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
          existingMovements={stockMovementsByJobCard.get(stockCard.id) ?? []}
          todayIso={todayIso}
          onClose={() => setStockCard(null)}
          onSaved={() => {
            setStockCard(null);
            setRefreshKey((key) => key + 1);
          }}
        />
      )}

      {historyCard && (
        <JobCardHistoryDrawer
          card={historyCard}
          staff={staff}
          onClose={() => setHistoryCard(null)}
        />
      )}
    </div>
  );
}

function JobCardHistoryDrawer({
  card,
  staff,
  onClose,
}: {
  card: JobCard;
  staff: Staff[];
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<JobCardActivityLog[] | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member.name])), [staff]);

  useEffect(() => {
    let cancelled = false;
    getJobCardActivityLogsAction(card.id)
      .then((result) => {
        if (cancelled) return;
        setLogs(result);
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(getErrorMessage(caught, "Failed to load job card history."));
        setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Job Card History</h2>
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
              {error}
            </div>
          )}
          {logs === undefined ? (
            <LoadingState label="Loading job card history..." />
          ) : logs === null ? (
            <div className="rounded-lg border border-border-soft bg-surface px-3 py-4 text-sm text-ink-muted">
              Activity history is ready in the app, but the database migration has not been applied yet.
              Apply <span className="font-semibold text-ink">supabase/migrations/0016_job_card_activity.sql</span> to start saving production history.
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-soft px-3 py-8 text-center text-sm text-ink-muted">
              No history recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border border-border-soft p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink">{log.actionType}</div>
                      <div className="mt-1 text-xs text-ink-muted">
                        {formatDateTime(log.createdAt)}
                      </div>
                    </div>
                    {log.toStage && (
                      <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-semibold text-ink-muted">
                        {log.toStage}
                      </span>
                    )}
                  </div>
                  {(log.fromStage || log.toStage) && (
                    <div className="mt-2 text-xs text-ink-muted">
                      {log.fromStage ?? "-"} {"->"} {log.toStage ?? "-"}
                    </div>
                  )}
                  {log.assignedStaffId && (
                    <div className="mt-1 text-xs text-ink-muted">
                      Assigned: {staffById.get(log.assignedStaffId) ?? "Unknown staff"}
                    </div>
                  )}
                  {log.notes && (
                    <div className="mt-2 text-xs text-ink-muted">{log.notes}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobCardStageControls({
  card,
  todayIso,
  onAssign,
  onUpdated,
}: {
  card: JobCard;
  todayIso: string;
  onAssign: () => void;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState<"complete" | "move" | null>(null);
  const [targetStage, setTargetStage] = useState<JobCardStage>(card.stage);
  const [stageReason, setStageReason] = useState("");

  useEffect(() => {
    setTargetStage(card.stage);
    setStageReason("");
  }, [card.stage]);

  const isClosed = card.stage === "Delivered" || card.stage === "Cancelled";
  const canComplete = card.persisted
    ? Boolean(card.assignedStaffId && !card.completedDate && !isClosed)
    : Boolean(card.assignment && !card.assignment.completedDate);

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

  if (isClosed) {
    return (
      <div className="mt-3 rounded-lg border border-border-soft bg-surface px-3 py-2 text-xs text-ink-muted">
        This job card is read-only because it is {card.stage.toLowerCase()}.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border-soft bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {!card.assignedStaffId && (
          <button
            type="button"
            onClick={onAssign}
            className="rounded-lg border border-primary bg-primary-tint px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint/80"
          >
            Assign Work
          </button>
        )}
        {canComplete && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={saving !== null}
            className="rounded-lg border border-primary bg-primary-tint px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving === "complete" ? "Completing..." : completeActionLabel(card)}
          </button>
        )}
      </div>

      {card.persisted && card.assignedStaffId && (
        <div className="mt-3 border-t border-border-soft pt-3">
          <div className="flex items-center gap-2">
            <Select
              value={targetStage}
              onChange={(event) => setTargetStage(event.target.value as JobCardStage)}
              className="h-9 min-w-0 flex-1 text-xs"
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
              className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
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
              className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          )}
        </div>
      )}
    </div>
  );
}

function JobCardDetailsDrawer({
  card,
  linkedFabrics,
  jobCardFabrics,
  stockMovements,
  inventoryItemsById,
  canManageStatus,
  canManageInventory,
  canManageStage,
  todayIso,
  onFabricStatusChange,
  onAssign,
  onUpdated,
  onHistory,
  onRecordFabric,
  onUseStock,
  onClose,
}: {
  card: JobCard;
  linkedFabrics: CustomerFabric[];
  jobCardFabrics: CustomerFabric[];
  stockMovements: InventoryMovement[];
  inventoryItemsById: Map<string, InventoryItem>;
  canManageStatus: boolean;
  canManageInventory: boolean;
  canManageStage: boolean;
  todayIso: string;
  onFabricStatusChange: (fabric: CustomerFabric, status: CustomerFabricStatus) => void;
  onAssign: () => void;
  onUpdated: () => void;
  onHistory: () => void;
  onRecordFabric: () => void;
  onUseStock: () => void;
  onClose: () => void;
}) {
  const measurements = measurementEntries(card);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{card.jobCardNumber}</h2>
            <p className="text-sm text-ink-muted">
              {card.garment}
              {card.totalUnits > 1 ? ` - Unit ${card.unitNo} of ${card.totalUnits}` : ""}
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
              <Link href={`/orders?view=${card.orderId}`} className="font-semibold text-primary hover:underline">
                {card.orderNumber}
              </Link>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Customer</p>
              <p className="font-semibold text-ink">{card.customer?.name ?? "Unknown"}</p>
              <p className="text-xs text-ink-muted">{card.customer?.phone ?? ""}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Assigned Worker</p>
              <p className="font-semibold text-ink">{card.assignedStaffId ? card.assignedTo : "Unassigned"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-muted">Due Date</p>
              <p className={cn("font-semibold", isDelayedCard(card) ? "text-chip-red-fg" : "text-ink")}>
                {formatDate(card.deliveryDate)}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Stage</p>
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge stage={displayStage(card)} />
              {isDelayedCard(card) && (
                <span className="rounded-full bg-chip-red px-2.5 py-1 text-xs font-semibold text-chip-red-fg">
                  Delayed
                </span>
              )}
            </div>
            {card.assignedStaffId && card.taskType && (
              <p className="mt-1 text-xs text-ink-muted">
                {card.taskType}
                {card.taskStatus ? ` - ${card.taskStatus}` : ""}
              </p>
            )}
            {canManageStage && (
              <JobCardStageControls
                card={card}
                todayIso={todayIso}
                onAssign={onAssign}
                onUpdated={onUpdated}
              />
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Fabric / Notes</p>
            <div className="rounded-lg border border-border-soft p-3">
              <FabricInfo
                card={card}
                linkedFabrics={linkedFabrics}
                canManageStatus={canManageStatus}
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

          {(stockMovements.length > 0 || jobCardFabrics.length > 0) && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Fabric Usage</p>
              <div className="space-y-3 rounded-lg border border-border-soft p-3">
                {stockMovements.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-ink">Shop Stock Used</p>
                    <div className="space-y-1 text-xs text-ink-muted">
                      {stockMovements.map((movement) => {
                        const item = inventoryItemsById.get(movement.itemId);
                        return (
                          <div key={movement.id}>
                            {item?.name ?? "Stock item"}
                            {item?.color ? `, ${item.color}` : ""} · {movement.quantity}{" "}
                            {item?.unit ?? ""} · {formatDate(movement.movementDate)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {jobCardFabrics.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-ink">Customer Fabric Recorded</p>
                    <div className="space-y-1 text-xs text-ink-muted">
                      {jobCardFabrics.map((fabric) => (
                        <div key={fabric.id}>
                          {fabric.fabricDescription}
                          {fabric.color ? `, ${fabric.color}` : ""} · {fabric.quantity}{" "}
                          {fabric.unit} · {formatDate(fabric.receivedDate)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(measurements.entries.length > 0 || measurements.notes) && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Measurements</p>
              <div className="rounded-lg border border-border-soft p-3">
                {measurements.entries.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {measurements.entries.map((entry) => (
                      <div key={entry.key}>
                        <dt className="text-xs text-ink-muted">{entry.label}</dt>
                        <dd className="font-semibold text-ink">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {measurements.notes && (
                  <p className="mt-3 whitespace-pre-wrap text-ink-muted">
                    <span className="font-semibold text-ink">Measurement Notes: </span>
                    {measurements.notes}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border-soft px-6 py-4">
          {canManageInventory && (
            <>
              <button
                type="button"
                onClick={onRecordFabric}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                {jobCardFabrics.length > 0 ? "Add Customer Fabric" : "Record Customer Fabric"}
              </button>
              <button
                type="button"
                onClick={onUseStock}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                {stockMovements.length > 0 ? "Add More Shop Stock" : "Use Shop Stock"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onAssign}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            {card.assignedStaffId ? "Reassign Work" : "Assign Work"}
          </button>
          <button
            type="button"
            onClick={onHistory}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            History
          </button>
          <Link
            href={jobCardPrintUrl(card)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <Printer className="h-4 w-4" />
            Print Job Card
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      setError("Assign a worker before moving this job card into production.");
      return;
    }
    setSaving(true);
    const result = card.persisted
      ? await assignJobCardAction(card.id, {
          taskType,
          assignedStaffId: staffId,
          dueDate,
          priority,
          startedDate: todayIso,
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
          startedDate: todayIso,
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
            <span className="text-sm font-medium text-ink-muted">Production Stage</span>
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
            <span className="text-sm font-medium text-ink-muted">Worker</span>
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
