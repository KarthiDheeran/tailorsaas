"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Package, Plus, Shirt, X } from "lucide-react";
import {
  adjustInventoryStockAction,
  createCustomerFabricAction,
  createInventoryItemAction,
  updateInventoryItemAction,
  setInventoryItemActiveAction,
  getCustomerFabricsAction,
  getInventoryConsumptionMasterDataAction,
  getInventoryPageDataAction,
  saveInventoryConsumptionRuleAction,
  saveInventoryItemTypeAction,
  setInventoryConsumptionRuleActiveAction,
  updateCustomerFabricStatusAction,
  type InventoryConsumptionMasterData,
  type InventoryConsumptionRule,
  type InventoryRuleRange,
} from "@/app/(shell)/inventory/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { formatDate } from "@/components/orders/orders-table";
import {
  customerFabricStatuses,
  inventoryItemTypes,
  inventoryMovementTypes,
  inventoryUnits,
  paymentModes,
} from "@/lib/constants";
import type {
  CustomerFabric,
  CustomerFabricStatus,
  InventoryItem,
  InventoryItemType,
  InventoryMovementType,
  InventoryUnit,
  PaymentMode,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { Select } from "@/components/ui/select";
import { downloadCsv } from "@/lib/csv";
import { formatCurrency } from "@/lib/currency";

type InventoryTab = "stock" | "customer-fabric" | "masters";
type StockStatusFilter = "Active" | "Disabled" | "All";
const STOCK_ITEM_LIMIT = 300;
const CUSTOMER_FABRIC_LIMIT = 200;

function money(n: number) {
  return formatCurrency(n);
}

function numberValue(n: number) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function InventoryContent() {
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("inventory.manage");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<InventoryTab>("stock");
  const [items, setItems] = useState<InventoryItem[] | null>([]);
  const [itemStats, setItemStats] = useState({ stockItemsCount: 0, lowStockCount: 0, stockValue: 0 });
  const [customerFabrics, setCustomerFabrics] = useState<CustomerFabric[] | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [fabricQuery, setFabricQuery] = useState("");
  const [debouncedFabricQuery, setDebouncedFabricQuery] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>("Active");
  const [stockRefreshKey, setStockRefreshKey] = useState(0);
  const [fabricRefreshKey, setFabricRefreshKey] = useState(0);
  const [showItemDrawer, setShowItemDrawer] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [showCustomerFabricDrawer, setShowCustomerFabricDrawer] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [isFabricLoading, setIsFabricLoading] = useState(false);
  const [masterData, setMasterData] = useState<InventoryConsumptionMasterData | null | undefined>(undefined);
  const [masterRefreshKey, setMasterRefreshKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stockParam = params.get("stock");
    const tabParam = params.get("tab");
    if (stockParam === "low") {
      setTab("stock");
      setLowStockOnly(true);
      window.history.replaceState({}, "", "/inventory");
      return;
    }
    if (tabParam === "customer-fabric") {
      setTab("customer-fabric");
      window.history.replaceState({}, "", "/inventory");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsStockLoading(true);
    getInventoryPageDataAction({
      stockQuery: debouncedQuery,
      stockLimit: STOCK_ITEM_LIMIT,
    })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        if (result.itemStats) setItemStats(result.itemStats);
        if (result.customerFabrics !== undefined) setCustomerFabrics(result.customerFabrics);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load inventory."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setIsStockLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, stockRefreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedFabricQuery(fabricQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fabricQuery]);

  useEffect(() => {
    if (tab !== "customer-fabric") return;
    let cancelled = false;
    setIsFabricLoading(true);
    getCustomerFabricsAction({
      query: debouncedFabricQuery,
      limit: CUSTOMER_FABRIC_LIMIT,
    })
      .then((result) => {
        if (cancelled) return;
        setCustomerFabrics(result);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load customer fabrics."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsFabricLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedFabricQuery, fabricRefreshKey, tab]);

  useEffect(() => {
    if (tab !== "masters" && masterData !== undefined) return;
    let cancelled = false;
    getInventoryConsumptionMasterDataAction().then((result) => {
      if (!cancelled) setMasterData(result);
    });
    return () => { cancelled = true; };
  }, [masterData, masterRefreshKey, tab]);

  const filteredItems = useMemo(() => {
    const rows = items ?? [];
    return rows.filter((item) => {
      if (stockStatus === "Active" && !item.active) return false;
      if (stockStatus === "Disabled" && item.active) return false;
      if (lowStockOnly && (!item.active || item.quantityOnHand > item.reorderLevel)) return false;
      return true;
    });
  }, [items, lowStockOnly, stockStatus]);

  async function handleToggleItemActive(item: InventoryItem) {
    const result = await setInventoryItemActiveAction(item.id, !item.active);
    if (!result.success) return window.alert(result.error);
    setStockRefreshKey((key) => key + 1);
  }

  const filteredCustomerFabrics = customerFabrics ?? [];

  const customerFabricRows = customerFabrics ?? [];
  const inventoryMigrationMissing = items === null || customerFabrics === null;
  const canUseInventoryMutations = canManage && !inventoryMigrationMissing;
  const lowStockCount = itemStats.lowStockCount;
  const stockValue = itemStats.stockValue;
  const activeCustomerFabric = customerFabricRows.filter(
    (fabric) => fabric.status === "Received" || fabric.status === "In Use"
  ).length;

  function handleExportStock() {
    downloadCsv(
      `inventory-stock-${todayIso}.csv`,
      [
        "Name",
        "SKU",
        "Type",
        "Color",
        "Quantity On Hand",
        "Unit",
        "Reorder Level",
        "Cost Per Unit",
        "Vendor",
        "Purchase Date",
        "Purchase Cost",
        "Stock Value",
        "Status",
        "Notes",
      ],
      filteredItems.map((item) => [
        item.name,
        item.sku ?? "",
        item.itemType,
        item.color ?? "",
        item.quantityOnHand,
        item.unit,
        item.reorderLevel,
        item.costPerUnit ?? "",
        item.vendorName ?? "",
        item.purchaseDate ?? "",
        item.purchaseCost ?? "",
        item.quantityOnHand * (item.costPerUnit ?? 0),
        item.active ? "Active" : "Inactive",
        item.notes ?? "",
      ])
    );
  }

  function handleExportCustomerFabric() {
    downloadCsv(
      `customer-fabric-${todayIso}.csv`,
      [
        "Customer",
        "Phone",
        "Fabric",
        "Color",
        "Quantity",
        "Unit",
        "Received Date",
        "Returned Date",
        "Status",
        "Notes",
      ],
      filteredCustomerFabrics.map((fabric) => [
        fabric.customerName,
        fabric.customerPhone ?? "",
        fabric.fabricDescription,
        fabric.color ?? "",
        fabric.quantity,
        fabric.unit,
        fabric.receivedDate,
        fabric.returnedDate ?? "",
        fabric.status,
        fabric.notes ?? "",
      ])
    );
  }

  return (
    <div className="w-full max-w-none bg-[#f5f8ff] p-2 pb-4 sm:px-3 sm:py-2 lg:px-4 [&_table_td]:!px-2 [&_table_td]:!py-1.5 [&_table_th]:!px-2 [&_table_th]:!py-1.5">
      <div className="mb-2 rounded-lg border border-border-soft bg-white px-3 py-2">
        <h1 className="text-xl font-semibold text-ink">Inventory</h1>
        <p className="text-sm text-ink-muted">
          Track shop-owned stock separately from customer-provided fabric.
        </p>
      </div>

      {loadError && (
        <div className="mb-2">
          <LoadError
            message={loadError}
            onRetry={() => {
              if (tab === "customer-fabric") {
                setFabricRefreshKey((key) => key + 1);
                return;
              }
              setStockRefreshKey((key) => key + 1);
            }}
          />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading inventory..." />
      ) : (
        <>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stat label="Stock Items" value={itemStats.stockItemsCount.toString()} icon={Package} />
            <Stat label="Low Stock" value={lowStockCount.toString()} icon={AlertTriangle} tone="warning" />
            <Stat label="Stock Value" value={money(stockValue)} icon={Shirt} />
          </div>

          {inventoryMigrationMissing && (
            <div className="mb-2 rounded-lg border border-border-soft bg-white p-2 text-sm text-ink-muted">
              Inventory is ready in the app, but the database migration has not been applied yet.
              Apply <span className="font-semibold text-ink">supabase/migrations/0011_inventory.sql</span> to start saving stock and customer fabric records.
            </div>
          )}

          <div className="mb-2 flex items-center gap-1 border-b border-border-soft bg-white px-2">
            <TabButton label="Shop Stock" active={tab === "stock"} onClick={() => setTab("stock")} />
            <TabButton
              label={
                customerFabrics === undefined
                  ? "Customer Fabric"
                  : `Customer Fabric (${activeCustomerFabric})`
              }
              active={tab === "customer-fabric"}
              onClick={() => setTab("customer-fabric")}
            />
            {canManage && <TabButton label="Inventory Masters" active={tab === "masters"} onClick={() => setTab("masters")} />}
          </div>

          {tab === "stock" && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-white p-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search stock by name, SKU, color, or type"
                  className="h-9 w-72 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
                <button
                  type="button"
                  onClick={() => setLowStockOnly((current) => !current)}
                  className={cn(
                    "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
                    lowStockOnly
                      ? "border-primary bg-primary-tint text-primary"
                      : "border-border bg-white text-ink-muted hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  Low stock only
                </button>
                <Select
                  value={stockStatus}
                  onChange={(event) => setStockStatus(event.target.value as StockStatusFilter)}
                  className="h-9 w-32"
                >
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                  <option value="All">All</option>
                </Select>
                <ExportCsvButton
                  onClick={handleExportStock}
                  disabled={filteredItems.length === 0}
                  className={canUseInventoryMutations ? "" : "ml-auto"}
                />
                {canUseInventoryMutations && (
                  <button
                    type="button"
                    onClick={() => setShowItemDrawer(true)}
                    className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
                  >
                    <Plus className="h-4 w-4" />
                    Add Stock Item
                  </button>
                )}
              </div>
              {isStockLoading && !isLoading && (
                <p className="mb-3 text-xs text-ink-muted">Refreshing stock...</p>
              )}
              {items && items.length >= STOCK_ITEM_LIMIT && (
                <p className="mb-3 text-xs text-ink-muted">
                  Showing first {STOCK_ITEM_LIMIT} matching stock items.
                </p>
              )}

              <StockTable
                items={filteredItems}
                canManage={canUseInventoryMutations}
                onAdjust={setAdjustingItem}
                onEdit={setEditingItem}
                onToggleActive={handleToggleItemActive}
              />
            </>
          )}

          {tab === "customer-fabric" && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-white p-2">
                <input
                  value={fabricQuery}
                  onChange={(e) => setFabricQuery(e.target.value)}
                  placeholder="Search customer fabric by customer, phone, color, or status"
                  className="h-9 w-80 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
                <ExportCsvButton
                  onClick={handleExportCustomerFabric}
                  disabled={filteredCustomerFabrics.length === 0}
                  className={canUseInventoryMutations ? "" : "ml-auto"}
                />
                {canUseInventoryMutations && (
                  <button
                    type="button"
                    onClick={() => setShowCustomerFabricDrawer(true)}
                    className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
                  >
                    <Plus className="h-4 w-4" />
                    Add Customer Fabric
                  </button>
                )}
              </div>
              {customerFabrics && customerFabrics.length >= CUSTOMER_FABRIC_LIMIT && (
                <p className="mb-3 text-xs text-ink-muted">
                  Showing latest {CUSTOMER_FABRIC_LIMIT} matching fabric records.
                </p>
              )}

              {isFabricLoading && customerFabrics === undefined ? (
                <LoadingState label="Loading customer fabrics..." />
              ) : (
                <CustomerFabricTable
                  rows={filteredCustomerFabrics}
                  canManage={canUseInventoryMutations}
                  todayIso={todayIso}
                  onUpdated={() => setFabricRefreshKey((key) => key + 1)}
                />
              )}
            </>
          )}

          {tab === "masters" && canManage && (
            masterData === undefined ? <LoadingState label="Loading inventory masters..." /> :
            masterData === null ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-ink">Apply <span className="font-semibold">supabase/migrations/0093_inventory_consumption_masters.sql</span> to enable configurable item types and consumption rules.</div>
            ) : (
              <InventoryMasters data={masterData} items={(items ?? []).filter((item) => item.active)} onSaved={() => { setMasterData(undefined); setMasterRefreshKey((key) => key + 1); }} />
            )
          )}
        </>
      )}

      {showItemDrawer && (
        <StockItemDrawer
          itemTypes={(masterData?.itemTypes.filter((type) => type.isActive).map((type) => type.name) ?? inventoryItemTypes)}
          onClose={() => setShowItemDrawer(false)}
          onSaved={() => {
            setShowItemDrawer(false);
            setStockRefreshKey((key) => key + 1);
          }}
        />
      )}

      {editingItem && (
        <StockItemDrawer
          item={editingItem}
          itemTypes={Array.from(new Set([editingItem.itemType, ...(masterData?.itemTypes.filter((type) => type.isActive).map((type) => type.name) ?? inventoryItemTypes)]))}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            setStockRefreshKey((key) => key + 1);
          }}
        />
      )}

      {adjustingItem && (
        <StockAdjustDrawer
          item={adjustingItem}
          todayIso={todayIso}
          onClose={() => setAdjustingItem(null)}
          onSaved={() => {
            setAdjustingItem(null);
            setStockRefreshKey((key) => key + 1);
          }}
        />
      )}

      {showCustomerFabricDrawer && (
        <CustomerFabricDrawer
          todayIso={todayIso}
          onClose={() => setShowCustomerFabricDrawer(false)}
          onSaved={() => {
            setShowCustomerFabricDrawer(false);
            setFabricRefreshKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: typeof Package;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border-soft bg-white px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-3">
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
      <div className={cn("text-xl font-semibold", tone === "warning" ? "text-chip-red-fg" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-ink-muted hover:text-ink"
      )}
    >
      {label}
    </button>
  );
}

function StockTable({
  items,
  canManage,
  onAdjust,
  onEdit,
  onToggleActive,
}: {
  items: InventoryItem[];
  canManage: boolean;
  onAdjust: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onToggleActive: (item: InventoryItem) => void;
}) {
  if (items.length === 0) {
    return <EmptyState message="No stock items match this view." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-soft bg-white">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Item</th>
            <th className="whitespace-nowrap px-5 py-3">Type</th>
            <th className="whitespace-nowrap px-5 py-3">Color</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">On Hand</th>
            <th className="whitespace-nowrap px-5 py-3">Reorder</th>
            <th className="whitespace-nowrap px-5 py-3">Vendor</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Value</th>
            {canManage && <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {items.map((item) => {
            const low = item.active && item.quantityOnHand <= item.reorderLevel;
            return (
              <tr key={item.id} className={cn("border-t border-border-soft hover:bg-surface-muted", !item.active && "opacity-60")}>
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-semibold text-ink">{item.name}</div>
                  <div className="text-xs text-ink-muted">{item.sku || "No SKU"}</div>
                  {!item.active && <div className="text-xs font-semibold text-chip-red-fg">Disabled</div>}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{item.itemType}</td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{item.color || "-"}</td>
                <td className={cn("whitespace-nowrap px-5 py-3 text-right font-semibold", low ? "text-chip-red-fg" : "text-ink")}>
                  {numberValue(item.quantityOnHand)} {item.unit}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  {low ? (
                    <span className="rounded-full bg-chip-red px-2.5 py-0.5 text-xs font-semibold text-chip-red-fg">
                      Low stock
                    </span>
                  ) : (
                    <span className="text-ink-muted">{numberValue(item.reorderLevel)} {item.unit}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {item.vendorName || "-"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                  {money(item.quantityOnHand * (item.costPerUnit ?? 0))}
                  {item.purchaseCost != null && (
                    <div className="text-xs text-ink-faint">
                      Purchase {money(item.purchaseCost)}
                    </div>
                  )}
                </td>
                {canManage && (
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <button type="button" onClick={() => onEdit(item)} className="mr-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-tint">Edit</button>
                    <button
                      type="button"
                      onClick={() => onAdjust(item)}
                      disabled={!item.active}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Adjust Stock
                    </button>
                    <button type="button" onClick={() => onToggleActive(item)} className="ml-2 text-xs font-semibold text-ink-muted hover:text-ink">{item.active ? "Disable" : "Enable"}</button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomerFabricTable({
  rows,
  canManage,
  todayIso,
  onUpdated,
}: {
  rows: CustomerFabric[];
  canManage: boolean;
  todayIso: string;
  onUpdated: () => void;
}) {
  async function updateStatus(row: CustomerFabric, status: CustomerFabricStatus) {
    const result = await updateCustomerFabricStatusAction(row.id, status, todayIso);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onUpdated();
  }

  if (rows.length === 0) {
    return <EmptyState message="No customer-provided fabric records match this view." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-soft bg-white">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Customer</th>
            <th className="whitespace-nowrap px-5 py-3">Fabric</th>
            <th className="whitespace-nowrap px-5 py-3">Quantity</th>
            <th className="whitespace-nowrap px-5 py-3">Received</th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            {canManage && <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border-soft hover:bg-surface-muted">
              <td className="whitespace-nowrap px-5 py-3">
                <div className="font-semibold text-ink">{row.customerName}</div>
                <div className="text-xs text-ink-muted">{row.customerPhone || ""}</div>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink">
                <div>{row.fabricDescription}</div>
                <div className="text-xs text-ink-muted">{row.color || row.notes || ""}</div>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {numberValue(row.quantity)} {row.unit}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {formatDate(row.receivedDate)}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <StatusBadge status={row.status} />
              </td>
              {canManage && (
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <Select
                    value={row.status}
                    onChange={(e) => updateStatus(row, e.target.value as CustomerFabricStatus)}
                    className="h-8 w-32 text-xs font-semibold"
                  >
                    {customerFabricStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: CustomerFabricStatus }) {
  const style =
    status === "Returned" || status === "Consumed"
      ? "bg-chip-info text-chip-info-fg"
      : status === "In Use"
        ? "bg-chip-blue text-chip-blue-fg"
        : "bg-chip-mint text-chip-mint-fg";
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", style)}>
      {status}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-soft bg-white py-12 text-center">
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}

function InventoryMasters({ data, items, onSaved }: { data: InventoryConsumptionMasterData; items: InventoryItem[]; onSaved: () => void }) {
  const [typeName, setTypeName] = useState("");
  const [editing, setEditing] = useState<InventoryConsumptionRule | null>(null);
  const [showRule, setShowRule] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addType(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const result = await saveInventoryItemTypeAction({ name: typeName });
    setBusy(false);
    if (!result.success) return window.alert(result.error);
    setTypeName(""); onSaved();
  }

  async function toggleRule(rule: InventoryConsumptionRule) {
    const result = await setInventoryConsumptionRuleActiveAction(rule.id, !rule.isActive);
    if (!result.success) return window.alert(result.error);
    onSaved();
  }

  async function toggleType(type: InventoryConsumptionMasterData["itemTypes"][number]) {
    const result = await saveInventoryItemTypeAction({ id: type.id, name: type.name, isActive: !type.isActive });
    if (!result.success) return window.alert(result.error);
    onSaved();
  }

  return <div className="grid gap-2 xl:grid-cols-[minmax(260px,0.7fr)_minmax(700px,2fr)]">
    <section className="rounded-lg border border-border-soft bg-white p-3">
      <h2 className="font-semibold text-ink">Stock Item Types</h2>
      <p className="mb-3 text-xs text-ink-muted">Types used while creating stock items.</p>
      <form onSubmit={addType} className="mb-3 flex gap-2"><input value={typeName} onChange={(event) => setTypeName(event.target.value)} placeholder="Example: Belt Patti" className="h-9 min-w-0 flex-1 rounded-lg border border-border px-3 text-sm" /><button disabled={busy || !typeName.trim()} className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50">Add</button></form>
      <div className="space-y-1">{data.itemTypes.map((type) => <div key={type.id} className="flex items-center justify-between rounded-lg border border-border-soft px-2.5 py-1.5"><span className={cn("text-sm font-semibold", type.isActive ? "text-ink" : "text-ink-faint")}>{type.name}</span><button type="button" onClick={() => toggleType(type)} className="text-xs font-semibold text-primary">{type.isActive ? "Disable" : "Enable"}</button></div>)}</div>
    </section>
    <section className="rounded-lg border border-border-soft bg-white p-3">
      <div className="mb-2 flex items-start justify-between gap-2"><div><h2 className="font-semibold text-ink">Garment Consumption Rules</h2><p className="text-xs text-ink-muted">Stock automatically reduces when garment quantities are delivered.</p></div><button type="button" onClick={() => { setEditing(null); setShowRule(true); }} className="flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add Rule</button></div>
      {data.rules.length === 0 ? <EmptyState message="No consumption rules configured yet." /> : <div className="overflow-x-auto rounded-lg border border-border-soft"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border-soft bg-surface-muted"><th className="px-2 py-2">Garment</th><th className="px-2 py-2">Stock Item</th><th className="px-2 py-2">Consumption</th><th className="px-2 py-2">Status</th><th className="px-2 py-2 text-right">Actions</th></tr></thead><tbody>{data.rules.map((rule) => <tr key={rule.id} className="border-t border-border-soft"><td className="px-2 py-2 font-semibold">{rule.garmentName}</td><td className="px-2 py-2">{rule.inventoryItemName}</td><td className="px-2 py-2 text-ink-muted">{rule.calculationType === "Fixed" ? `${numberValue(rule.fixedQuantity ?? 0)} per garment` : `${rule.measurementFieldName ?? rule.measurementFieldCode} · ${rule.ranges.length} ranges`}</td><td className="px-2 py-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", rule.isActive ? "bg-chip-mint text-chip-mint-fg" : "bg-surface-muted text-ink-muted")}>{rule.isActive ? "Active" : "Inactive"}</span></td><td className="space-x-2 px-2 py-2 text-right"><button type="button" onClick={() => { setEditing(rule); setShowRule(true); }} className="text-xs font-semibold text-primary">Edit</button><button type="button" onClick={() => toggleRule(rule)} className="text-xs font-semibold text-ink-muted">{rule.isActive ? "Disable" : "Enable"}</button></td></tr>)}</tbody></table></div>}
    </section>
    {showRule && <ConsumptionRuleDrawer data={data} items={items.filter((item) => item.active)} rule={editing} onClose={() => setShowRule(false)} onSaved={() => { setShowRule(false); onSaved(); }} />}
  </div>;
}

function ConsumptionRuleDrawer({ data, items, rule, onClose, onSaved }: { data: InventoryConsumptionMasterData; items: InventoryItem[]; rule: InventoryConsumptionRule | null; onClose: () => void; onSaved: () => void }) {
  const [garmentTypeId, setGarmentTypeId] = useState(rule?.garmentTypeId ?? data.garments[0]?.id ?? "");
  const [inventoryItemId, setInventoryItemId] = useState(rule?.inventoryItemId ?? items[0]?.id ?? "");
  const [calculationType, setCalculationType] = useState<"Fixed" | "Measurement Range">(rule?.calculationType ?? "Fixed");
  const [measurementFieldCode, setMeasurementFieldCode] = useState(rule?.measurementFieldCode ?? data.measurementFields[0]?.code ?? "");
  const [fixedQuantity, setFixedQuantity] = useState(String(rule?.fixedQuantity ?? 1));
  const [ranges, setRanges] = useState<InventoryRuleRange[]>(rule?.ranges.length ? rule.ranges : [{ fromValue: 25, toValue: 30, quantity: 1.5 }]);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    const result = await saveInventoryConsumptionRuleAction({ id: rule?.id, garmentTypeId, inventoryItemId, calculationType, measurementFieldCode: calculationType === "Measurement Range" ? measurementFieldCode : undefined, fixedQuantity: calculationType === "Fixed" ? Number(fixedQuantity) : undefined, ranges: calculationType === "Measurement Range" ? ranges : [] });
    setSaving(false); if (!result.success) return window.alert(result.error); onSaved();
  }
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30"><form onSubmit={submit} className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl"><div className="flex items-center justify-between border-b border-border-soft px-5 py-4"><div><h2 className="text-lg font-semibold">{rule ? "Edit" : "Add"} Consumption Rule</h2><p className="text-xs text-ink-muted">Configure stock used per delivered garment.</p></div><button type="button" onClick={onClose}><X className="h-5 w-5" /></button></div><div className="flex-1 space-y-4 overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-2"><SelectField label="Garment" value={garmentTypeId} onChange={setGarmentTypeId} options={data.garments.map((item) => item.id)} optionLabels={Object.fromEntries(data.garments.map((item) => [item.id, item.name]))} /><SelectField label="Stock Item" value={inventoryItemId} onChange={setInventoryItemId} options={items.map((item) => item.id)} optionLabels={Object.fromEntries(items.map((item) => [item.id, `${item.name} (${item.unit})`]))} /></div><SelectField label="Calculation" value={calculationType} onChange={(value) => setCalculationType(value as "Fixed" | "Measurement Range")} options={["Fixed", "Measurement Range"]} />{calculationType === "Fixed" ? <Field label="Quantity per garment"><input type="number" min="0.001" step="0.001" value={fixedQuantity} onChange={(event) => setFixedQuantity(event.target.value)} className="h-10 w-full rounded-lg border border-border px-3" /></Field> : <><SelectField label="Customer measurement" value={measurementFieldCode} onChange={setMeasurementFieldCode} options={data.measurementFields.map((field) => field.code)} optionLabels={Object.fromEntries(data.measurementFields.map((field) => [field.code, field.name]))} /><div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Measurement ranges</span><button type="button" onClick={() => setRanges((current) => [...current, { fromValue: (current.at(-1)?.toValue ?? 24) + 1, toValue: (current.at(-1)?.toValue ?? 24) + 5, quantity: 1 }])} className="text-xs font-semibold text-primary">+ Add range</button></div><div className="space-y-2">{ranges.map((range, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input aria-label="From measurement" type="number" step="0.01" value={range.fromValue} onChange={(event) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fromValue: Number(event.target.value) } : item))} className="h-9 rounded-lg border border-border px-2" /><input aria-label="To measurement" type="number" step="0.01" value={range.toValue} onChange={(event) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, toValue: Number(event.target.value) } : item))} className="h-9 rounded-lg border border-border px-2" /><input aria-label="Consumption quantity" type="number" min="0.001" step="0.001" value={range.quantity} onChange={(event) => setRanges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} className="h-9 rounded-lg border border-border px-2" /><button type="button" aria-label="Remove range" onClick={() => setRanges((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-chip-red-fg"><X className="h-4 w-4" /></button></div>)}</div><p className="mt-1 text-[11px] text-ink-muted">From · To · stock quantity per garment</p></div></>}</div><div className="flex justify-end gap-2 border-t border-border-soft px-5 py-4"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-border px-4 text-sm font-semibold">Cancel</button><button disabled={saving} className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Rule"}</button></div></form></div>;
}

function StockItemDrawer({
  item,
  itemTypes,
  onClose,
  onSaved,
}: {
  item?: InventoryItem;
  itemTypes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itemType, setItemType] = useState<InventoryItemType>(item?.itemType ?? "Fabric");
  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [color, setColor] = useState(item?.color ?? "");
  const [unit, setUnit] = useState<InventoryUnit>(item?.unit ?? "meter");
  const [quantity, setQuantity] = useState(String(item?.quantityOnHand ?? 0));
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorderLevel ?? 0));
  const [costPerUnit, setCostPerUnit] = useState(item?.costPerUnit == null ? "" : String(item.costPerUnit));
  const [vendorName, setVendorName] = useState(item?.vendorName ?? "");
  const [purchaseDate, setPurchaseDate] = useState(item?.purchaseDate ?? "");
  const [purchaseCost, setPurchaseCost] = useState(item?.purchaseCost == null ? "" : String(item.purchaseCost));
  const [purchaseCostTouched, setPurchaseCostTouched] = useState(Boolean(item));
  const [purchasePaymentMode, setPurchasePaymentMode] = useState<PaymentMode>("Cash");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const estimatedStockValue =
    Number.isFinite(Number(quantity)) && Number.isFinite(Number(costPerUnit))
      ? Number(quantity) * Number(costPerUnit)
      : 0;

  useEffect(() => {
    if (purchaseCostTouched || estimatedStockValue <= 0) return;
    setPurchaseCost(String(estimatedStockValue));
  }, [estimatedStockValue, purchaseCostTouched]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Item name is required.");
      return;
    }
    setSaving(true);
    const input = {
      itemType,
      name,
      sku,
      color,
      unit,
      quantityOnHand: Number(quantity),
      reorderLevel: Number(reorderLevel),
      costPerUnit: costPerUnit ? Number(costPerUnit) : undefined,
      vendorName,
      purchaseDate,
      purchaseCost: purchaseCost ? Number(purchaseCost) : undefined,
      purchasePaymentMode,
      notes,
    };
    const result = item
      ? await updateInventoryItemAction(item.id, input)
      : await createInventoryItemAction(input);
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <InventoryDrawerShell title={item ? "Edit Stock Item" : "Add Stock Item"} onClose={onClose} onSubmit={handleSubmit} saving={saving}>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Type" value={itemType} onChange={(value) => setItemType(value as InventoryItemType)} options={itemTypes} />
        <SelectField label="Unit" value={unit} onChange={(value) => setUnit(value as InventoryUnit)} options={inventoryUnits} />
      </div>
      <TextField label="Item Name" value={name} onChange={setName} placeholder="Premium cotton, black buttons..." />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="SKU" value={sku} onChange={setSku} placeholder="optional" />
        <TextField label="Color" value={color} onChange={setColor} placeholder="optional" />
      </div>
      {item && <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted">Current stock: <span className="font-semibold text-ink">{numberValue(item.quantityOnHand)} {item.unit}</span>. Use Adjust Stock to change quantity.</div>}
      <div className={cn("grid gap-3", item ? "grid-cols-2" : "grid-cols-3")}>
        {!item && <TextField label="Qty" type="number" value={quantity} onChange={setQuantity} />}
        <TextField label="Reorder" type="number" value={reorderLevel} onChange={setReorderLevel} />
        <TextField label="Cost/Unit" type="number" value={costPerUnit} onChange={setCostPerUnit} />
      </div>
      <TextField label="Vendor" value={vendorName} onChange={setVendorName} placeholder="Supplier or market name" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Purchase Date" type="date" value={purchaseDate} onChange={setPurchaseDate} />
        <TextField
          label={item ? "Purchase Cost" : "Purchase Cost (Finance)"}
          type="number"
          value={purchaseCost}
          onChange={(value) => {
            setPurchaseCostTouched(true);
            setPurchaseCost(value);
          }}
        />
      </div>
      <div className="rounded-lg border border-border-soft bg-surface-muted px-3 py-2 text-xs text-ink-muted">
        {item ? (
          <span>Editing purchase details does not create or change any Finance expense.</span>
        ) : Number(purchaseCost) > 0 ? (
          <span>
            A Finance expense transaction will be recorded for{" "}
            <span className="font-semibold text-ink">{money(Number(purchaseCost))}</span>.
            Clear Purchase Cost for opening stock or stock added without a new payment.
          </span>
        ) : estimatedStockValue > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Stock value is {money(estimatedStockValue)}. No Finance expense is created unless
              Purchase Cost is entered.
            </span>
            <button
              type="button"
              onClick={() => {
                setPurchaseCostTouched(true);
                setPurchaseCost(String(estimatedStockValue));
              }}
              className="rounded-lg border border-border bg-white px-2.5 py-1 font-semibold text-primary hover:bg-primary-tint"
            >
              Use as Purchase Cost
            </button>
          </div>
        ) : (
          <span>Enter Purchase Cost only when money was paid for this stock.</span>
        )}
      </div>
      {!item && Number(purchaseCost) > 0 && (
        <SelectField
          label="Payment Mode"
          value={purchasePaymentMode}
          onChange={(value) => setPurchasePaymentMode(value as PaymentMode)}
          options={paymentModes}
        />
      )}
      <TextareaField label="Notes" value={notes} onChange={setNotes} />
      {error && <FormError error={error} />}
    </InventoryDrawerShell>
  );
}

function StockAdjustDrawer({
  item,
  todayIso,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  todayIso: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [movementType, setMovementType] = useState<InventoryMovementType>("Stock In");
  const [quantity, setQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(todayIso);
  const [reason, setReason] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchasePaymentMode, setPurchasePaymentMode] = useState<PaymentMode>("Cash");
  const [purchaseVendor, setPurchaseVendor] = useState(item.vendorName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await adjustInventoryStockAction({
      itemId: item.id,
      movementType,
      quantity: Number(quantity),
      movementDate,
      reason,
      purchaseCost:
        movementType === "Stock In" && purchaseCost ? Number(purchaseCost) : undefined,
      purchasePaymentMode,
      purchaseVendor,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <InventoryDrawerShell title={`Adjust ${item.name}`} onClose={onClose} onSubmit={handleSubmit} saving={saving}>
      <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted">
        Current stock: <span className="font-semibold text-ink">{numberValue(item.quantityOnHand)} {item.unit}</span>
      </div>
      <SelectField label="Movement" value={movementType} onChange={(value) => setMovementType(value as InventoryMovementType)} options={inventoryMovementTypes} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Quantity" type="number" value={quantity} onChange={setQuantity} />
        <TextField label="Date" type="date" value={movementDate} onChange={setMovementDate} />
      </div>
      <TextareaField label="Reason" value={reason} onChange={setReason} placeholder="Purchase, used for order, wastage..." />
      {movementType === "Stock In" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Purchase Cost"
              type="number"
              value={purchaseCost}
              onChange={setPurchaseCost}
              placeholder="optional"
            />
            <SelectField
              label="Payment Mode"
              value={purchasePaymentMode}
              onChange={(value) => setPurchasePaymentMode(value as PaymentMode)}
              options={paymentModes}
            />
          </div>
          <div className="rounded-lg border border-border-soft bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            {Number(purchaseCost) > 0 ? (
              <span>
                This stock-in will create a Finance expense for{" "}
                <span className="font-semibold text-ink">{money(Number(purchaseCost))}</span>.
              </span>
            ) : (
              <span>No Finance expense is created unless Purchase Cost is entered.</span>
            )}
          </div>
          <TextField
            label="Vendor"
            value={purchaseVendor}
            onChange={setPurchaseVendor}
            placeholder="Supplier or market name"
          />
        </>
      )}
      {error && <FormError error={error} />}
    </InventoryDrawerShell>
  );
}

function CustomerFabricDrawer({
  todayIso,
  onClose,
  onSaved,
}: {
  todayIso: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fabricDescription, setFabricDescription] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("meter");
  const [receivedDate, setReceivedDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!fabricDescription.trim()) {
      setError("Fabric description is required.");
      return;
    }
    setSaving(true);
    const result = await createCustomerFabricAction({
      customerName,
      customerPhone,
      fabricDescription,
      color,
      quantity: Number(quantity),
      unit,
      receivedDate,
      notes,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <InventoryDrawerShell title="Add Customer Fabric" onClose={onClose} onSubmit={handleSubmit} saving={saving}>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Customer" value={customerName} onChange={setCustomerName} />
        <TextField label="Phone" value={customerPhone} onChange={setCustomerPhone} />
      </div>
      <TextField label="Fabric" value={fabricDescription} onChange={setFabricDescription} placeholder="Blue silk, customer saree fabric..." />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Color" value={color} onChange={setColor} />
        <TextField label="Received" type="date" value={receivedDate} onChange={setReceivedDate} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Quantity" type="number" value={quantity} onChange={setQuantity} />
        <SelectField label="Unit" value={unit} onChange={(value) => setUnit(value as InventoryUnit)} options={inventoryUnits} />
      </div>
      <TextareaField label="Notes" value={notes} onChange={setNotes} placeholder="Order reference, storage shelf, condition..." />
      {error && <FormError error={error} />}
    </InventoryDrawerShell>
  );
}

function InventoryDrawerShell({
  title,
  children,
  onClose,
  onSubmit,
  saving,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <form onSubmit={onSubmit} className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  optionLabels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  optionLabels?: Record<string, string>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </Select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-ink-muted">{label}</span>{children}</label>;
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
      />
    </label>
  );
}

function FormError({ error }: { error: string }) {
  return (
    <div className="rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
      {error}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <RequirePermission permission="inventory.view">
      <InventoryContent />
    </RequirePermission>
  );
}
