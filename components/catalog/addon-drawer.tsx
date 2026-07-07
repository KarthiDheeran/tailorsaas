"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { AddOnInput, CatalogAddOn } from "@/lib/catalog";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export function AddOnDrawer({
  addOn,
  onCancel,
  onSaved,
}: {
  addOn: CatalogAddOn | null;
  onCancel: () => void;
  onSaved: (data: AddOnInput) => void;
}) {
  const isEdit = addOn !== null;
  const [name, setName] = useState(addOn?.name ?? "");
  const [defaultPrice, setDefaultPrice] = useState<number>(
    addOn?.defaultPrice ?? 0
  );
  const [isActive, setIsActive] = useState(addOn?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Add-on name is required.");
      return;
    }
    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      setError("Default price is required and must be 0 or more.");
      return;
    }

    onSaved({ name: trimmedName, defaultPrice, isActive });
  }

  return (
    <>
      <div
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft sm:w-[420px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">
              {isEdit ? "Edit Add-on" : "Add Add-on"}
            </p>
            <p className="text-sm text-ink-muted">
              Reusable extras garment types can link to.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col justify-between"
        >
          <div className="space-y-5 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
                {error}
              </div>
            )}

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Add-on Name
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Extra Pocket"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Default Price (₹)
                  </span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Status
                  </span>
                  <select
                    value={isActive ? "Active" : "Inactive"}
                    onChange={(e) => setIsActive(e.target.value === "Active")}
                    className={inputClass}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              {isEdit ? "Save Changes" : "Add Add-on"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
