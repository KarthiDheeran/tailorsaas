"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Package, Plus, Shirt, X } from "lucide-react";
import {
  adjustInventoryStockAction,
  createCustomerFabricAction,
  createInventoryItemAction,
  getInventoryPageDataAction,
  updateCustomerFabricStatusAction,
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

type InventoryTab = "stock" | "customer-fabric";

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
  const [customerFabrics, setCustomerFabrics] = useState<CustomerFabric[] | null>([]);
  const [query, setQuery] = useState("");
  const [fabricQuery, setFabricQuery] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showItemDrawer, setShowItemDrawer] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [showCustomerFabricDrawer, setShowCustomerFabricDrawer] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    getInventoryPageDataAction()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setCustomerFabrics(result.customerFabrics);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load inventory."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filteredItems = useMemo(() => {
    const rows = items ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((item) => {
      if (lowStockOnly && item.quantityOnHand > item.reorderLevel) return false;
      if (!q) return true;
      return [item.name, item.sku, item.color, item.itemType, item.notes]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q));
    });
  }, [items, lowStockOnly, query]);

  const filteredCustomerFabrics = useMemo(() => {
    const rows = customerFabrics ?? [];
    const q = fabricQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((fabric) =>
      [
        fabric.customerName,
        fabric.customerPhone,
        fabric.fabricDescription,
        fabric.color,
        fabric.status,
        fabric.notes,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q))
    );
  }, [customerFabrics, fabricQuery]);

  const stockRows = items ?? [];
  const customerFabricRows = customerFabrics ?? [];
  const inventoryMigrationMissing = items === null || customerFabrics === null;
  const canUseInventoryMutations = canManage && !inventoryMigrationMissing;
  const lowStockCount = stockRows.filter(
    (item) => item.active && item.quantityOnHand <= item.reorderLevel
  ).length;
  const stockValue = stockRows.reduce(
    (sum, item) => sum + item.quantityOnHand * (item.costPerUnit ?? 0),
    0
  );
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
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Inventory</h1>
        <p className="text-sm text-ink-muted">
          Track shop-owned stock separately from customer-provided fabric.
        </p>
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => setRefreshKey((key) => key + 1)} />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading inventory..." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Stock Items" value={stockRows.length.toString()} icon={Package} />
            <Stat label="Low Stock" value={lowStockCount.toString()} icon={AlertTriangle} tone="warning" />
            <Stat label="Stock Value" value={money(stockValue)} icon={Shirt} />
          </div>

          {inventoryMigrationMissing && (
            <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
              Inventory is ready in the app, but the database migration has not been applied yet.
              Apply <span className="font-semibold text-ink">supabase/migrations/0011_inventory.sql</span> to start saving stock and customer fabric records.
            </div>
          )}

          <div className="mb-6 flex items-center gap-1 border-b border-border-soft">
            <TabButton label="Shop Stock" active={tab === "stock"} onClick={() => setTab("stock")} />
            <TabButton
              label={`Customer Fabric (${activeCustomerFabric})`}
              active={tab === "customer-fabric"}
              onClick={() => setTab("customer-fabric")}
            />
          </div>

          {tab === "stock" && (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2">
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
                      : "border-border bg-white text-ink-muted hover:bg-surface hover:text-ink"
                  )}
                >
                  Low stock only
                </button>
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

              <StockTable items={filteredItems} canManage={canUseInventoryMutations} onAdjust={setAdjustingItem} />
            </>
          )}

          {tab === "customer-fabric" && (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2">
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

              <CustomerFabricTable
                rows={filteredCustomerFabrics}
                canManage={canUseInventoryMutations}
                todayIso={todayIso}
                onUpdated={() => setRefreshKey((key) => key + 1)}
              />
            </>
          )}
        </>
      )}

      {showItemDrawer && (
        <StockItemDrawer
          onClose={() => setShowItemDrawer(false)}
          onSaved={() => {
            setShowItemDrawer(false);
            setRefreshKey((key) => key + 1);
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
            setRefreshKey((key) => key + 1);
          }}
        />
      )}

      {showCustomerFabricDrawer && (
        <CustomerFabricDrawer
          todayIso={todayIso}
          onClose={() => setShowCustomerFabricDrawer(false)}
          onSaved={() => {
            setShowCustomerFabricDrawer(false);
            setRefreshKey((key) => key + 1);
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
        "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
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
}: {
  items: InventoryItem[];
  canManage: boolean;
  onAdjust: (item: InventoryItem) => void;
}) {
  if (items.length === 0) {
    return <EmptyState message="No stock items match this view." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
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
              <tr key={item.id} className="border-t border-border-soft hover:bg-surface">
                <td className="whitespace-nowrap px-5 py-3">
                  <div className="font-semibold text-ink">{item.name}</div>
                  <div className="text-xs text-ink-muted">{item.sku || "No SKU"}</div>
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
                    <button
                      type="button"
                      onClick={() => onAdjust(item)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                    >
                      Adjust Stock
                    </button>
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
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
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
            <tr key={row.id} className="border-t border-border-soft hover:bg-surface">
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}

function StockItemDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itemType, setItemType] = useState<InventoryItemType>("Fabric");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [color, setColor] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("meter");
  const [quantity, setQuantity] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchaseCostTouched, setPurchaseCostTouched] = useState(false);
  const [purchasePaymentMode, setPurchasePaymentMode] = useState<PaymentMode>("Cash");
  const [notes, setNotes] = useState("");
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
    const result = await createInventoryItemAction({
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
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <InventoryDrawerShell title="Add Stock Item" onClose={onClose} onSubmit={handleSubmit} saving={saving}>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Type" value={itemType} onChange={(value) => setItemType(value as InventoryItemType)} options={inventoryItemTypes} />
        <SelectField label="Unit" value={unit} onChange={(value) => setUnit(value as InventoryUnit)} options={inventoryUnits} />
      </div>
      <TextField label="Item Name" value={name} onChange={setName} placeholder="Premium cotton, black buttons..." />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="SKU" value={sku} onChange={setSku} placeholder="optional" />
        <TextField label="Color" value={color} onChange={setColor} placeholder="optional" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <TextField label="Qty" type="number" value={quantity} onChange={setQuantity} />
        <TextField label="Reorder" type="number" value={reorderLevel} onChange={setReorderLevel} />
        <TextField label="Cost/Unit" type="number" value={costPerUnit} onChange={setCostPerUnit} />
      </div>
      <TextField label="Vendor" value={vendorName} onChange={setVendorName} placeholder="Supplier or market name" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Purchase Date" type="date" value={purchaseDate} onChange={setPurchaseDate} />
        <TextField
          label="Purchase Cost (Finance)"
          type="number"
          value={purchaseCost}
          onChange={(value) => {
            setPurchaseCostTouched(true);
            setPurchaseCost(value);
          }}
        />
      </div>
      <div className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-xs text-ink-muted">
        {Number(purchaseCost) > 0 ? (
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
      {Number(purchaseCost) > 0 && (
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
      <div className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted">
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
          <div className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-xs text-ink-muted">
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
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
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink"
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
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
            {option}
          </option>
        ))}
      </Select>
    </label>
  );
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
