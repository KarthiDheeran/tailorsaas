"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  MEASUREMENT_FIELD_GROUPS,
  measurementFieldLabel,
  type CatalogAddOn,
  type CatalogGarmentType,
  type GarmentTypeInput,
} from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

// Garment types that adjust an existing item rather than measuring a body —
// the "at least one field recommended" nudge is skipped for these, per spec.
const NO_FIELDS_EXPECTED = ["alteration", "custom"];

export function GarmentTypeDrawer({
  garment,
  activeAddOns,
  onCancel,
  onSaved,
}: {
  garment: CatalogGarmentType | null;
  // Phase 5B: fetched by the parent page via a Server Action, rather than
  // this drawer calling lib/catalog.ts's getActiveAddOns() itself.
  activeAddOns: CatalogAddOn[];
  onCancel: () => void;
  onSaved: (data: GarmentTypeInput) => Promise<{ success: boolean; error?: string }>;
}) {
  const { t } = useLanguage();
  const isEdit = garment !== null;
  const [name, setName] = useState(garment?.name ?? "");
  const [basePrice, setBasePrice] = useState<number>(garment?.basePrice ?? 0);
  const [isActive, setIsActive] = useState(garment?.isActive ?? true);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>(
    garment?.measurementFieldIds ?? []
  );
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>(
    garment?.addOnIds ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const noFieldsExpected = NO_FIELDS_EXPECTED.includes(
    name.trim().toLowerCase()
  );

  function toggleField(id: string) {
    setSelectedFieldIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  }

  function toggleAddOn(id: string) {
    setSelectedAddOnIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("catalog.garmentNameRequired"));
      return;
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      setError(t("catalog.basePriceRequired"));
      return;
    }

    setSubmitting(true);
    const result = await onSaved({
      name: trimmedName,
      basePrice,
      measurementFieldIds: selectedFieldIds,
      addOnIds: selectedAddOnIds,
      isActive,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Could not save garment type.");
      return;
    }
    onCancel();
  }

  return (
    <>
      <div
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft sm:w-[520px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">
              {isEdit
                ? t("catalog.editGarmentType")
                : t("catalog.addGarmentTypeTitle")}
            </p>
            <p className="text-sm text-ink-muted">
              {t("catalog.garmentDrawerSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("common.close")}
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
              <h3 className="mb-4 text-[17px] font-semibold text-ink">
                Basic Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Garment Name
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Pant"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Base Price (₹)
                  </span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
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

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-1 text-[17px] font-semibold text-ink">
                Required Measurements
              </h3>
              <p className="mb-4 text-sm text-ink-muted">
                Select measurements needed for this garment.
              </p>
              <div className="space-y-4">
                {MEASUREMENT_FIELD_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-[13px] font-semibold text-ink-muted">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                      {group.fieldIds.map((id) => (
                        <label
                          key={id}
                          className="flex items-center gap-2 text-sm text-ink"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFieldIds.includes(id)}
                            onChange={() => toggleField(id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary-tint"
                          />
                          {measurementFieldLabel(id)}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {selectedFieldIds.length === 0 && !noFieldsExpected && (
                <p className="mt-4 text-xs text-ink-faint">
                  No fields selected — most garment types need at least one.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-1 text-[17px] font-semibold text-ink">
                Add-ons / Extras
              </h3>
              <p className="mb-4 text-sm text-ink-muted">
                Select which add-ons apply to this garment. These can be
                selected while creating an order and will add to the item
                price.
              </p>
              {activeAddOns.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No add-ons available yet — add some from the Add-ons /
                  Extras tab.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {activeAddOns.map((addOn) => (
                    <label
                      key={addOn.id}
                      className="flex items-center gap-2 text-sm text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAddOnIds.includes(addOn.id)}
                        onChange={() => toggleAddOn(addOn.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary-tint"
                      />
                      {addOn.name}{" "}
                      <span className="text-ink-muted">
                        ₹{addOn.defaultPrice.toLocaleString("en-IN")}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Garment Type"}
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
