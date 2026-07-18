"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { recordJobCardCustomerFabricAction } from "@/app/(shell)/job-cards/actions";
import type { JobCard } from "@/lib/job-cards";
import { inventoryUnits } from "@/lib/constants";
import type { CustomerFabric, InventoryUnit } from "@/lib/types";

export function CustomerFabricDrawer({
  card,
  existingFabrics = [],
  todayIso,
  onClose,
  onSaved,
}: {
  card: JobCard;
  existingFabrics?: CustomerFabric[];
  todayIso: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState(card.customer?.name ?? "");
  const [customerPhone, setCustomerPhone] = useState(card.customer?.phone ?? "");
  const [fabricDescription, setFabricDescription] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("meter");
  const [receivedDate, setReceivedDate] = useState(todayIso);
  const [notes, setNotes] = useState(
    `${card.jobCardNumber} - ${card.garment} - ${card.orderNumber}`
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!card.persisted) {
      setError("Save the job card before recording customer fabric.");
      return;
    }
    if (!customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!fabricDescription.trim()) {
      setError("Fabric description is required.");
      return;
    }
    if (
      card.fabricSource === "Shop provided" &&
      !window.confirm(
        "This item is marked as Shop provided. Recording customer fabric will change Fabric Source to Customer provided. Continue?"
      )
    ) {
      return;
    }

    setSaving(true);
    const result = await recordJobCardCustomerFabricAction(card.id, {
      customerId: card.customerId,
      orderId: card.orderId,
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <form onSubmit={handleSubmit} className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Record Customer Fabric</h2>
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
          {card.fabricSource === "Shop provided" && (
            <div className="rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
              This item is marked as Shop provided. Saving customer fabric will change Fabric Source to Customer provided.
            </div>
          )}
          {(!card.fabricSource || card.fabricSource === "Not specified") && (
            <div className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted">
              Fabric Source will be set to Customer provided after customer fabric is recorded.
            </div>
          )}
          {existingFabrics.length > 0 && (
            <div className="rounded-lg border border-border-soft bg-white px-3 py-2 text-sm">
              <p className="mb-1 font-semibold text-ink">Already recorded</p>
              <div className="space-y-1 text-ink-muted">
                {existingFabrics.map((fabric) => (
                  <div key={fabric.id}>
                    {fabric.fabricDescription}
                    {fabric.color ? `, ${fabric.color}` : ""} · {fabric.quantity} {fabric.unit}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted">
            Linked to <span className="font-semibold text-ink">{card.orderNumber}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="Customer" value={customerName} onChange={setCustomerName} />
            <TextField label="Phone" value={customerPhone} onChange={setCustomerPhone} />
          </div>

          <TextField
            label="Fabric"
            value={fabricDescription}
            onChange={setFabricDescription}
            placeholder="Blue silk, customer suit fabric..."
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField label="Color" value={color} onChange={setColor} />
            <TextField
              label="Received"
              type="date"
              value={receivedDate}
              onChange={setReceivedDate}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="Quantity" type="number" value={quantity} onChange={setQuantity} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">Unit</span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value as InventoryUnit)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                {inventoryUnits.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
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
            {saving ? "Saving..." : existingFabrics.length > 0 ? "Save More Fabric" : "Save Fabric"}
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
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
      />
    </label>
  );
}
