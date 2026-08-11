"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import {
  GARMENT_SECTIONS,
  MEASUREMENT_FIELD_GROUPS,
  customMeasurementFieldId,
  customMeasurementFieldLabel,
  isCustomMeasurementFieldId,
  measurementFieldLabel,
  type CatalogAddOn,
  type CatalogGarmentType,
  type GarmentSection,
  type GarmentTypeInput,
} from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

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
  const [section, setSection] = useState<GarmentSection>(garment?.section ?? "Men");
  const [shortcutCode, setShortcutCode] = useState(
    garment?.shortcutCode?.toString() ?? ""
  );
  const [basePrice, setBasePrice] = useState<number>(garment?.basePrice ?? 0);
  const [showOrderAddOns] = useState(garment?.showOrderAddOns ?? true);
  const [isActive, setIsActive] = useState(garment?.isActive ?? true);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>(
    garment?.measurementFieldIds ?? []
  );
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>(
    garment?.addOnIds ?? []
  );
  const [addOnSearch, setAddOnSearch] = useState("");
  const [customFieldName, setCustomFieldName] = useState("");
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

  const availableAddOns = useMemo(
    () => [...activeAddOns].sort((a, b) => a.name.localeCompare(b.name)),
    [activeAddOns]
  );
  const filteredAddOns = useMemo(() => {
    const query = addOnSearch.trim().toLowerCase();
    if (!query) return availableAddOns;
    return availableAddOns.filter((addOn) =>
      addOn.name.toLowerCase().includes(query)
    );
  }, [addOnSearch, availableAddOns]);
  const selectedAddOns = useMemo(
    () => availableAddOns.filter((addOn) => selectedAddOnIds.includes(addOn.id)),
    [availableAddOns, selectedAddOnIds]
  );

  function addCustomField() {
    const trimmed = customFieldName.trim().replace(/\s+/g, " ");
    if (!trimmed) return;
    const id = customMeasurementFieldId(trimmed);
    setSelectedFieldIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCustomFieldName("");
  }

  function removeCustomField(id: string) {
    setSelectedFieldIds((prev) => prev.filter((fieldId) => fieldId !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("catalog.garmentNameRequired"));
      return;
    }
    const trimmedCode = shortcutCode.trim();
    const parsedShortcutCode: number | null =
      trimmedCode === "" ? null : Number(trimmedCode);
    if (
      trimmedCode &&
      (!/^\d+$/.test(trimmedCode) ||
        parsedShortcutCode === null ||
        parsedShortcutCode <= 0)
    ) {
      setError("Numeric code must be a positive whole number.");
      return;
    }
    if (isActive && parsedShortcutCode === null) {
      setError("Numeric code is required for active garment types.");
      return;
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      setError(t("catalog.basePriceRequired"));
      return;
    }

    setSubmitting(true);
    const result = await onSaved({
      name: trimmedName,
      section,
      shortcutCode: parsedShortcutCode,
      basePrice,
      measurementFieldIds: selectedFieldIds,
      addOnIds: selectedAddOnIds,
      showOrderAddOns,
      isActive,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Could not save garment type.");
      return;
    }
    onCancel();
  }

  const customFieldIds = selectedFieldIds.filter(isCustomMeasurementFieldId);

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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
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
                    Order Section
                  </span>
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value as GarmentSection)}
                    className={inputClass}
                  >
                    {GARMENT_SECTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Numeric Code
                  </span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={shortcutCode}
                    onChange={(e) => setShortcutCode(e.target.value)}
                    placeholder="e.g. 10"
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
              <div className="mt-5 border-t border-border-soft pt-4">
                <p className="mb-2 text-[13px] font-semibold text-ink-muted">
                  Custom Fields
                </p>
                <div className="flex gap-2">
                  <input
                    value={customFieldName}
                    onChange={(e) => setCustomFieldName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomField();
                      }
                    }}
                    placeholder="e.g. Left shoulder drop"
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-ink transition-colors hover:bg-surface-muted"
                    aria-label="Add custom field"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {customFieldIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {customFieldIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border-soft bg-surface-muted px-3 py-1.5 text-sm text-ink"
                      >
                        <span className="min-w-0 truncate">
                          {customMeasurementFieldLabel(id)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCustomField(id)}
                          className="text-ink-faint transition-colors hover:text-chip-red-fg"
                          aria-label={`Remove ${measurementFieldLabel(id)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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
              {availableAddOns.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No add-ons available yet — add some from the Add-ons /
                  Extras tab.
                </p>
              ) : (
                <div className="space-y-3">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                    <input
                      type="text"
                      value={addOnSearch}
                      onChange={(event) => setAddOnSearch(event.target.value)}
                      placeholder="Search or select add-ons"
                      className={`${inputClass} w-full pl-10`}
                    />
                  </label>
                  {selectedAddOns.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedAddOns.map((addOn) => (
                        <span
                          key={addOn.id}
                          className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-primary-tint px-3 py-1 text-sm font-medium text-primary"
                        >
                          {addOn.name}
                          <span className="text-primary/70">
                            {formatCurrency(addOn.defaultPrice)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-border-soft">
                    {filteredAddOns.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-ink-muted">No add-ons found</p>
                    ) : (
                      filteredAddOns.map((addOn) => {
                        const selected = selectedAddOnIds.includes(addOn.id);
                        return (
                          <button
                            key={addOn.id}
                            type="button"
                            onClick={() => toggleAddOn(addOn.id)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                              selected ? "bg-primary-tint text-primary-strong" : "text-ink hover:bg-surface-muted"
                            }`}
                          >
                            <span className="min-w-0 truncate font-medium">{addOn.name}</span>
                            <span className="shrink-0 text-ink-muted">
                              {selected ? "Selected" : `+${formatCurrency(addOn.defaultPrice)}`}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
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
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
