"use client";

import { useMemo, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { adjustInventoryStockAction } from "@/app/(shell)/inventory/actions";
import type { JobCard } from "@/lib/job-cards";
import type { InventoryItem } from "@/lib/types";

function numberValue(value: number) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function StockConsumptionDrawer({
  card,
  items,
  todayIso,
  onClose,
  onSaved,
}: {
  card: JobCard;
  items: InventoryItem[];
  todayIso: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const stockOptions = useMemo(
    () => items.filter((item) => item.active && item.quantityOnHand > 0),
    [items]
  );
  const [itemId, setItemId] = useState(stockOptions[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(todayIso);
  const [reason, setReason] = useState(
    `Used for ${card.jobCardNumber} - ${card.garment} - ${card.orderNumber}`
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedItem = stockOptions.find((item) => item.id === itemId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!itemId) {
      setError("Select a stock item.");
      return;
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    setSaving(true);
    const result = await adjustInventoryStockAction({
      itemId,
      movementType: "Stock Out",
      quantity: Number(quantity),
      movementDate,
      reason,
      orderId: card.orderId,
      jobCardId: card.persisted ? card.id : undefined,
    });
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <form onSubmit={handleSubmit} className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Use Shop Stock</h2>
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
          {stockOptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-soft bg-surface px-3 py-4 text-sm text-ink-muted">
              No active stock with available quantity.
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-muted">Stock Item</span>
                <select
                  value={itemId}
                  onChange={(event) => setItemId(event.target.value)}
                  className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  {stockOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.color ? ` - ${item.color}` : ""} ({numberValue(item.quantityOnHand)} {item.unit})
                    </option>
                  ))}
                </select>
              </label>

              {selectedItem && (
                <div className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted">
                  On hand:{" "}
                  <span className="font-semibold text-ink">
                    {numberValue(selectedItem.quantityOnHand)} {selectedItem.unit}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <TextField label="Quantity Used" type="number" value={quantity} onChange={setQuantity} />
                <TextField label="Date" type="date" value={movementDate} onChange={setMovementDate} />
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-muted">Reason</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
              </label>
            </>
          )}

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
            disabled={saving || stockOptions.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Record Stock Out"}
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
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
      />
    </label>
  );
}
