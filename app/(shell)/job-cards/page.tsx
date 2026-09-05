"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  MoreVertical,
  Search,
  Shirt,
  UserRound,
  X,
} from "lucide-react";
import {
  getJobCardActivityLogsAction,
  getJobCardInventoryContextAction,
  getJobCardsPageDataAction,
  syncMissingJobCardsAction,
  transferJobCardAction,
} from "@/app/(shell)/job-cards/actions";
import {
  updateCustomerFabricStatusAction,
} from "@/app/(shell)/inventory/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { JobCardTabs } from "@/components/job-cards/job-card-tabs";
import { formatDate } from "@/components/orders/orders-table";
import { buildJobCards, type JobCard, type JobCardStage } from "@/lib/job-cards";
import type {
  CustomerFabric,
  CustomerFabricStatus,
  InventoryItem,
  InventoryMovement,
  JobCardActivityLog,
  Order,
  PaymentMode,
  WorkAssignment,
} from "@/lib/types";
import type { StaffOption } from "@/lib/data/staff-db";
import { cn } from "@/lib/utils";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { FabricInfo } from "@/components/job-cards/fabric-info";
import { CustomerFabricDrawer } from "@/components/job-cards/customer-fabric-drawer";
import { StockConsumptionDrawer } from "@/components/job-cards/stock-consumption-drawer";
import { measurementFieldLabel } from "@/lib/catalog";
import {
  historicalGarmentValueText,
  resolveHistoricalGarmentDisplayFields,
} from "@/lib/garment-form-runtime";

const FILTERS: { label: string; value: JobCardStage | "all" | "active" | "delayed" }[] = [
  { label: "Active", value: "active" },
  { label: "All", value: "all" },
  { label: "Not Ready", value: "Unassigned" },
  { label: "Delayed", value: "delayed" },
  { label: "Ready", value: "Ready" },
  { label: "Delivered", value: "Delivered" },
  { label: "Cancelled", value: "Cancelled" },
];

const STAGE_FILTERS: (JobCardStage | "all")[] = [
  "all",
  "Unassigned",
  "Cutting",
  "Stitching",
  "Ready",
  "Delivered",
  "Cancelled",
];

const DUE_FILTERS = [
  "All",
  "Due Today",
  "Due Tomorrow",
  "Overdue",
  "This Week",
] as const;

type DueFilter = (typeof DUE_FILTERS)[number];
type JobCardLine = {
  id: string;
  card: JobCard;
  cards: JobCard[];
  stageSlipRefs: NonNullable<JobCard["stageSlipRefs"]>;
};

function StageBadge({ stage }: { stage: JobCardStage }) {
  const styles: Record<JobCardStage, string> = {
    Unassigned: "border border-warning/30 bg-warning-soft text-warning",
    Cutting: "border border-info/30 bg-info-soft text-info",
    Stitching: "border border-info/30 bg-info-soft text-info",
    Embroidery: "bg-chip-blue text-chip-blue-fg",
    Finishing: "bg-chip-blue text-chip-blue-fg",
    Trial: "bg-chip-info text-chip-info-fg",
    Alteration: "bg-chip-red text-chip-red-fg",
    Delayed: "border border-danger/30 bg-danger-soft text-danger",
    Ready: "border border-secondary-border bg-secondary-soft text-secondary",
    Delivered: "border border-success/30 bg-success-soft text-success",
    Cancelled: "border border-border bg-chip-info text-ink-faint",
  };
  return (
    <span className={cn("inline-flex h-[30px] items-center rounded-full px-3 text-[13px] font-semibold", styles[stage])}>
      {stage === "Unassigned" ? "Not Ready" : stage}
    </span>
  );
}

function isActiveCard(card: JobCard) {
  const stage = displayStage(card);
  return stage !== "Delivered" && stage !== "Cancelled";
}

function isDelayedCard(card: JobCard) {
  return card.isDelayed && isActiveCard(card) && displayStage(card) !== "Ready";
}

function displayStage(card: JobCard): JobCardStage {
  // A completed card is still Ready even after its worker assignment has been
  // cleared. Only unfinished, unassigned cards should display as Not Ready.
  if (
    !card.assignedStaffId &&
    card.stage !== "Ready" &&
    card.stage !== "Delivered" &&
    card.stage !== "Cancelled"
  ) {
    return "Unassigned";
  }
  return card.stage;
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

function groupJobCardsByOrder(cards: JobCard[]): JobCardLine[] {
  const byLine = new Map<string, JobCard[]>();
  for (const card of cards) {
    const key = card.orderId;
    const current = byLine.get(key) ?? [];
    current.push(card);
    byLine.set(key, current);
  }
  return Array.from(byLine.entries()).map(([id, rows]) => {
    const cardsInLine = rows.slice().sort(defaultJobCardSort);
    const slipRefs = new Map<string, NonNullable<JobCard["stageSlipRefs"]>[number]>();
    for (const card of cardsInLine) {
      for (const slip of card.stageSlipRefs ?? []) {
        slipRefs.set(`${slip.stage}:${slip.slipCode}`, slip);
      }
    }
    return {
      id,
      card: cardsInLine[0],
      cards: cardsInLine,
      stageSlipRefs: Array.from(slipRefs.values()),
    };
  });
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
    card.stageSlipCode,
    ...(card.stageSlipCodes ?? []),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function matchesLineSearch(line: JobCardLine, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return line.cards.some((card) => matchesSearch(card, query));
}

function customerFabricsForJobCard(card: JobCard, fabrics: CustomerFabric[]) {
  return fabrics.filter((fabric) => fabric.notes?.includes(card.jobCardNumber));
}

function GarmentLineCell({ line }: { line: JobCardLine }) {
  const itemsBySerial = new Map<number, JobCard>();
  for (const card of line.cards) {
    if (!itemsBySerial.has(card.item.serialNo)) itemsBySerial.set(card.item.serialNo, card);
  }
  const garments = new Map<string, { name: string; qty: number }>();
  for (const card of Array.from(itemsBySerial.values())) {
    const key = card.garment.trim().toLowerCase();
    const current = garments.get(key) ?? { name: card.garment, qty: 0 };
    current.qty += Math.max(1, Number(card.item.qty) || card.totalUnits || 1);
    garments.set(key, current);
  }
  const summary = Array.from(garments.values());
  const totalQty = summary.reduce((sum, item) => sum + item.qty, 0);
  return (
    <div>
      <div className="font-medium text-ink">
        {summary.map((item) => `${item.name} x${item.qty}`).join(", ")}
      </div>
      {summary.length > 1 && (
        <div className="text-xs text-ink-muted">
          {summary.length} items · {totalQty} pcs
        </div>
      )}
    </div>
  );
}

function lineStage(line: JobCardLine): JobCardStage {
  if (["Ready", "Delivered", "Cancelled"].includes(line.card.orderStatus)) {
    return line.card.orderStatus as JobCardStage;
  }
  const stages = Array.from(new Set(line.cards.map(displayStage)));
  return stages.length === 1 ? stages[0] : line.card.stage;
}

function isActiveLine(line: JobCardLine) {
  return line.cards.some(isActiveCard);
}

function isDelayedLine(line: JobCardLine) {
  return line.cards.some(isDelayedCard);
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
  const historicalFields = resolveHistoricalGarmentDisplayFields({
    measurements: values,
    fieldSchemaSnapshot: card.item.fieldSchemaSnapshot,
  });
  if (card.item.fieldSchemaSnapshot) {
    return {
      entries: historicalFields.map((field) => ({
        key: field.code,
        label: field.unit ? `${field.label} (${field.unit})` : field.label,
        value: historicalGarmentValueText(field.value),
      })),
      notes: typeof values[MEASUREMENT_NOTES_KEY] === "string" ? values[MEASUREMENT_NOTES_KEY].trim() : "",
    };
  }
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

function JobCardsContent() {
  const { hasPermission } = useCurrentUser();
  const canManageStaff = hasPermission("staff.manage");
  const canViewOrders = hasPermission("orders.view");
  const canViewInventory = hasPermission("inventory.view");
  const canManageInventory = hasPermission("inventory.manage");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [orders, setOrders] = useState<Order[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [persistedCards, setPersistedCards] = useState<JobCard[] | null>(null);
  const [customerFabrics, setCustomerFabrics] = useState<CustomerFabric[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [filter, setFilter] = useState<JobCardStage | "all" | "active" | "delayed">("active");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<JobCardStage | "all">("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("All");
  const [garmentFilter, setGarmentFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [focusedJobCardId, setFocusedJobCardId] = useState<string | null>(null);
  const [detailsCard, setDetailsCard] = useState<JobCard | null>(null);
  const [historyCard, setHistoryCard] = useState<JobCard | null>(null);
  const [transferCard, setTransferCard] = useState<JobCard | null>(null);
  const [readyCard, setReadyCard] = useState<JobCard | null>(null);
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
    if (consumedParam) {
      window.history.replaceState({}, "", "/job-cards");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJobCardsPageDataAction(todayIso)
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
  const jobCardLines = useMemo(() => groupJobCardsByOrder(jobCards), [jobCards]);
  const filteredLines = jobCardLines.filter((line) => {
    const card = line.card;
    const stage = lineStage(line);
    if (!matchesLineSearch(line, query)) return false;
    if (filter === "active" && !isActiveLine(line)) return false;
    if (filter === "delayed" && !isDelayedLine(line)) return false;
    if (filter !== "all" && filter !== "active" && filter !== "delayed" && stage !== filter) {
      return false;
    }
    if (stageFilter !== "all" && stage !== stageFilter) return false;
    if (!line.cards.some((candidate) => matchesDueFilter(candidate, dueFilter, todayIso))) return false;
    if (garmentFilter !== "all" && !line.cards.some((candidate) => candidate.garment === garmentFilter)) return false;
    if (dateRange.from && card.deliveryDate < dateRange.from) return false;
    if (dateRange.to && card.deliveryDate > dateRange.to) return false;
    return true;
  });

  useEffect(() => {
    if (!focusedJobCardId || isLoading) return;
    const focusedLine = filteredLines.find((line) =>
      line.cards.some((card) => card.id === focusedJobCardId)
    );
    const row = focusedLine
      ? document.querySelector(`[data-job-card-line-id="${focusedLine.id}"]`)
      : null;
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [filteredLines, focusedJobCardId, isLoading]);
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

  async function loadInventoryContext(card: JobCard, includeStockItems = false) {
    if (!canViewInventory && !canManageInventory) return;
    const result = await getJobCardInventoryContextAction({
      orderId: card.orderId,
      jobCardId: card.id,
      includeStockItems,
    });
    const mergeById = <T extends { id: string }>(current: T[], incoming: T[] | null) => {
      if (!incoming) return current;
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const item of incoming) byId.set(item.id, item);
      return Array.from(byId.values());
    };
    setCustomerFabrics((current) => mergeById(current, result.customerFabrics));
    setInventoryMovements((current) => mergeById(current, result.inventoryMovements));
    setInventoryItems((current) => mergeById(current, result.inventoryItems));
  }

  function openDetails(card: JobCard) {
    setDetailsCard(card);
    void loadInventoryContext(card).catch((error) => {
      setLoadError(getErrorMessage(error, "Failed to load job card inventory details."));
    });
  }

  function openFabric(card: JobCard) {
    setFabricCard(card);
    void loadInventoryContext(card).catch((error) => {
      setLoadError(getErrorMessage(error, "Failed to load customer fabrics."));
    });
  }

  function openStock(card: JobCard) {
    setStockCard(card);
    void loadInventoryContext(card, true).catch((error) => {
      setLoadError(getErrorMessage(error, "Failed to load stock items."));
    });
  }

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
    <div className="w-full p-2 sm:p-3 lg:p-4">
      <div className="mb-5">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-ink">Order Ready</h1>
          <p className="mt-1 text-[16px] text-ink-muted">
            Garment-level work cards for readiness, delays, and delivery tracking.
          </p>
        </div>
      </div>
      {canManageStaff && <JobCardTabs active="cards" />}
      {loadError && (
        <div className="mt-5">
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

          <div className="mb-4 space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                placeholder="Search job card, order, customer, phone, garment, worker..."
                className="h-[50px] w-full rounded-[10px] border border-border bg-white pl-11 pr-4 text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </label>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "h-[42px] shrink-0 rounded-[9px] border px-3.5 text-[15px] font-medium transition-colors",
                    filter === option.value
                      ? "border-primary bg-primary-tint font-semibold text-primary"
                      : "border-border bg-white text-ink hover:bg-surface-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value as JobCardStage | "all")}
                className="h-12 rounded-[10px] border-border text-[15px] focus:border-primary focus:ring-primary-tint"
              >
                {STAGE_FILTERS.map((stage) => (
                  <option key={stage} value={stage}>
                    Status: {stage === "all" ? "All" : stage === "Unassigned" ? "Not Ready" : stage}
                  </option>
                ))}
              </Select>
              <Select
                value={dueFilter}
                onChange={(event) => setDueFilter(event.target.value as DueFilter)}
                className="h-12 rounded-[10px] border-border text-[15px] focus:border-primary focus:ring-primary-tint"
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
                className="h-12 rounded-[10px] border-border text-[15px] focus:border-primary focus:ring-primary-tint"
              >
                <option value="all">Garment: All</option>
                {garmentOptions.map((garment) => (
                  <option key={garment} value={garment}>
                    {garment}
                  </option>
                ))}
              </Select>
              <input aria-label="Job cards from date" type="date" value={dateRange.from} onChange={(event) => setDateRange((value) => ({ ...value, from: event.target.value }))} className="h-12 rounded-[10px] border border-border bg-white px-3 text-[15px]" />
              <input aria-label="Job cards to date" type="date" value={dateRange.to} onChange={(event) => setDateRange((value) => ({ ...value, to: event.target.value }))} className="h-12 rounded-[10px] border border-border bg-white px-3 text-[15px]" />
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink-muted">{filteredLines.length} order{filteredLines.length === 1 ? "" : "s"}</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-[#8f9bad] bg-white shadow-none">
            <table className="min-w-[1220px] w-full table-auto border-collapse text-left">
              <thead className="bg-[#e7edf7] text-[11px] font-bold text-ink">
                <tr>
                  <th className="w-[120px] whitespace-nowrap border border-[#8f9bad] px-2 py-1">Order</th>
                  <th className="w-[240px] whitespace-nowrap border border-[#8f9bad] px-2 py-1">Customer</th>
                  <th className="min-w-[340px] whitespace-nowrap border border-[#8f9bad] px-2 py-1">Garment</th>
                  <th className="w-[150px] whitespace-nowrap border border-[#8f9bad] px-2 py-1">Status</th>
                  <th className="w-[180px] whitespace-nowrap border border-[#8f9bad] px-2 py-1">Due Date</th>
                  <th className="w-[250px] whitespace-nowrap border border-[#8f9bad] px-2 py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {filteredLines.map((line) => {
                  const card = line.card;
                  const stage = lineStage(line);
                  return (
                  <tr
                    key={line.id}
                    data-job-card-line-id={line.id}
                    className={cn(
                      "h-8 border-t-0 transition-colors duration-150 hover:bg-surface-muted",
                      line.cards.some((row) => row.id === focusedJobCardId) && "bg-primary-tint ring-2 ring-primary/30"
                    )}
                  >
                    <td className="whitespace-nowrap border border-[#aeb8c8] px-2 py-0.5">
                      {canViewOrders ? (
                        <Link
                          href={`/orders?view=${card.orderId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {card.orderNumber}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink-muted">{card.orderNumber}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border border-[#aeb8c8] px-2 py-0.5">
                      <div className="flex items-center gap-1.5 font-semibold text-ink"><UserRound className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />{card.customer?.name ?? "Unknown"}</div>
                      <div className="pl-5 text-[13px] text-ink-muted">{card.customer?.phone ?? ""}</div>
                    </td>
                    <td className="whitespace-nowrap border border-[#aeb8c8] px-2 py-0.5 text-ink">
                      <span className="flex items-center gap-1.5 font-semibold"><Shirt className="h-3.5 w-3.5 text-primary" aria-hidden="true" /><GarmentLineCell line={line} /></span>
                    </td>
                    <td className="whitespace-nowrap border border-[#aeb8c8] px-2 py-0.5">
                      <StageBadge stage={stage} />
                    </td>
                    <td className="whitespace-nowrap border border-[#aeb8c8] px-2 py-0.5">
                      <span className={isDelayedLine(line) ? "font-semibold text-chip-red-fg" : "text-ink-muted"}>
                        <CalendarDays className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                        {formatDate(card.deliveryDate)}
                      </span>
                      {isDelayedLine(line) && (
                        <div className="mt-1 text-xs font-semibold text-chip-red-fg">
                          Delayed
                        </div>
                      )}
                    </td>
                    <td className="w-[250px] whitespace-nowrap border border-[#aeb8c8] px-2 py-0.5 text-right">
                      <div className="relative flex flex-wrap items-center justify-end gap-2">
                        {!['Ready', 'Delivered', 'Cancelled'].includes(card.orderStatus) && (
                          <button
                            type="button"
                            onClick={() => setReadyCard(card)}
                            className="inline-flex min-h-8 items-center rounded-md border border-primary bg-white px-2 py-1 text-xs font-semibold leading-tight text-primary transition-colors hover:bg-primary-tint"
                          >
                            Mark Order Ready
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuCardId((current) => (current === card.id ? null : card.id))
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
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
                                  openDetails({ ...card, stageSlipRefs: line.stageSlipRefs });
                                  setOpenMenuCardId(null);
                                }}
                                className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-muted"
                              >
                                View Details
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setHistoryCard(card);
                                  setOpenMenuCardId(null);
                                }}
                                className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-muted"
                              >
                                History
                              </button>
                              {card.assignedStaffId &&
                                !["Ready", "Delivered", "Cancelled"].includes(stage) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTransferCard(card);
                                      setOpenMenuCardId(null);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-muted"
                                  >
                                    Transfer Job Card
                                  </button>
                                )}
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

          {filteredLines.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-border-soft bg-white p-8 text-center text-sm text-ink-muted">
              <ClipboardList className="mx-auto mb-2 h-6 w-6 text-primary" aria-hidden="true" />
              <p className="font-semibold text-ink">No job cards found</p>
              <p className="mt-1">Try changing the search or filters.</p>
            </div>
          )}
        </>
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
          onFabricStatusChange={updateFabricStatus}
          onHistory={() => {
            setHistoryCard(detailsCard);
            setDetailsCard(null);
          }}
          onRecordFabric={() => {
            openFabric(detailsCard);
            setDetailsCard(null);
          }}
          onUseStock={() => {
            openStock(detailsCard);
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

      {transferCard && (
        <JobCardTransferModal
          card={transferCard}
          staff={staff}
          onClose={() => setTransferCard(null)}
          onTransferred={() => {
            setTransferCard(null);
            setRefreshKey((key) => key + 1);
          }}
        />
      )}
      {readyCard && (
        <MarkOrderReadyModal
          card={readyCard}
          onClose={() => setReadyCard(null)}
          onSaved={() => {
            setReadyCard(null);
            setRefreshKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}

function MarkOrderReadyModal({
  card,
  onClose,
  onSaved,
}: {
  card: JobCard;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bin, setBin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const response = await fetch("/api/job-cards/mark-ready", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: card.orderId, deliveryBin: bin }),
    });
    const result = (await response.json().catch(() => ({
      success: false,
      error: "Could not mark the order ready.",
    }))) as { success: boolean; error?: string };
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Could not mark the order ready.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
      <button type="button" aria-label="Close ready order dialog" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="mark-order-ready-title" className="relative w-full max-w-md rounded-2xl border border-border-soft bg-white shadow-xl">
        <div className="border-b border-border-soft px-5 py-4">
          <h2 id="mark-order-ready-title" className="text-lg font-bold text-ink">Mark Order Ready</h2>
          <p className="mt-1 text-sm text-ink-muted">{card.orderNumber} · all garments are kept together in one cover.</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm font-semibold text-ink">
            Cover / Bin location <span className="font-normal text-ink-muted">(optional)</span>
            <input autoFocus value={bin} onChange={(event) => setBin(event.target.value)} placeholder="Example: Rack B-02" className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <p className="text-xs text-ink-muted">Delivery staff will see this location after scanning the customer receipt.</p>
          {error && <p className="text-sm font-semibold text-chip-red-fg">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-4">
          <button type="button" disabled={saving} onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{saving ? "Saving…" : "Mark Ready"}</button>
        </div>
      </div>
    </div>
  );
}

function JobCardTransferModal({
  card,
  staff,
  onClose,
  onTransferred,
}: {
  card: JobCard;
  staff: StaffOption[];
  onClose: () => void;
  onTransferred: () => void;
}) {
  const [newStaffId, setNewStaffId] = useState("");
  const [reason, setReason] = useState("");
  const [recordAdvance, setRecordAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advancePaymentMode, setAdvancePaymentMode] = useState<PaymentMode>("Cash");
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const availableStaff = staff.filter(
    (member) => member.status === "Active" && member.id !== card.assignedStaffId
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const result = await transferJobCardAction(card.id, {
      newStaffId,
      reason,
      recordAdvance,
      advanceAmount: recordAdvance ? Number(advanceAmount) : undefined,
      advancePaymentMode: recordAdvance ? advancePaymentMode : undefined,
      advanceNotes,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onTransferred();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <button type="button" className="absolute inset-0" aria-label="Close transfer dialog" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative w-full max-w-lg rounded-2xl border border-border-soft bg-white shadow-xl"
      >
        <div className="border-b border-border-soft px-6 py-5">
          <h2 className="text-xl font-semibold text-ink">Transfer Job Card</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {card.jobCardNumber} · {card.garment} · {displayStage(card)}
          </p>
          <p className="mt-2 text-sm text-ink">
            Current tailor: <span className="font-semibold">{card.assignedTo}</span>
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          {error && <div className="rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">{error}</div>}
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            New tailor
            <select value={newStaffId} onChange={(event) => setNewStaffId(event.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="">Select tailor</option>
              {availableStaff.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name} — {member.role}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Transfer reason
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="e.g. Ramesh is unavailable today" className="rounded-lg border border-border px-3 py-2 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-border-soft bg-surface-muted p-3 text-sm text-ink">
            <input type="checkbox" checked={recordAdvance} onChange={(event) => setRecordAdvance(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span><span className="block font-semibold">Record advance already paid to {card.assignedTo}</span><span className="mt-0.5 block text-xs text-ink-muted">This is added to the previous tailor’s Paid / Advance ledger and offsets their future payable balance.</span></span>
          </label>
          {recordAdvance && (
            <div className="grid gap-3 rounded-xl border border-border-soft p-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-ink">Advance amount<input value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className="h-10 rounded-lg border border-border px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
              <label className="grid gap-1.5 text-sm font-medium text-ink">Paid by<select value={advancePaymentMode} onChange={(event) => setAdvancePaymentMode(event.target.value as PaymentMode)} className="h-10 rounded-lg border border-border bg-white px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"><option>Cash</option><option>GPay</option><option>UPI</option><option>Bank Transfer</option><option>Card</option><option>Cheque</option></select></label>
              <label className="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2">Advance note (optional)<input value={advanceNotes} onChange={(event) => setAdvanceNotes(event.target.value)} placeholder="Reference or settlement note" className="h-10 rounded-lg border border-border px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
            </div>
          )}
          <p className="rounded-lg bg-primary-tint px-3 py-2 text-xs text-primary">After transfer, print a replacement stage job card for the new tailor. Only that new slip should be tally-scanned.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-soft px-6 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-muted">Cancel</button>
          <button type="submit" disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{saving ? "Transferring..." : "Transfer Job Card"}</button>
        </div>
      </form>
    </div>
  );
}

function JobCardHistoryDrawer({
  card,
  staff,
  onClose,
}: {
  card: JobCard;
  staff: StaffOption[];
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
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
            <div className="rounded-lg border border-border-soft bg-surface-muted px-3 py-4 text-sm text-ink-muted">
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
                      <span className="rounded-full bg-surface-muted px-2 py-1 text-[11px] font-semibold text-ink-muted">
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

function JobCardDetailsDrawer({
  card,
  linkedFabrics,
  jobCardFabrics,
  stockMovements,
  inventoryItemsById,
  canManageStatus,
  canManageInventory,
  onFabricStatusChange,
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
  onFabricStatusChange: (fabric: CustomerFabric, status: CustomerFabricStatus) => void;
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
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
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Production Slips</p>
            {card.stageSlipRefs && card.stageSlipRefs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-border-soft p-3">
                {card.stageSlipRefs.map((slip) => (
                  <span
                    key={`${slip.stage}:${slip.slipCode}`}
                    className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted"
                  >
                    {slip.stage} {slip.slipCode.replace(/^JCS-\d{4}-/, "")}
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border-soft px-3 py-2 text-sm text-ink-muted">
                No production slips printed.
              </div>
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
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
              >
                {jobCardFabrics.length > 0 ? "Add Customer Fabric" : "Record Customer Fabric"}
              </button>
              <button
                type="button"
                onClick={onUseStock}
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
              >
                {stockMovements.length > 0 ? "Add More Shop Stock" : "Use Shop Stock"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onHistory}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            History
          </button>
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

export default function JobCardsPage() {
  return (
    <RequirePermission anyOf={["orders.view", "staff.view"]}>
      <JobCardsContent />
    </RequirePermission>
  );
}
