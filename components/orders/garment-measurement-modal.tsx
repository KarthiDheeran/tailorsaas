"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { MeasurementFieldDef } from "@/lib/garment-catalog";
import { useLanguage } from "@/components/i18n/language-provider";

export interface GarmentMeasurementDraft {
  garmentType: string;
  values: Record<string, string>;
  fitNotes: string;
  notes: string;
}

export function blankGarmentDraft(garmentType: string): GarmentMeasurementDraft {
  return { garmentType, values: {}, fitNotes: "", notes: "" };
}

// Count of non-blank entries, used for the Measurements summary section's
// "N fields saved" line — a simple fill-rate signal, not tied to any fixed
// denominator since fields are all optional.
export function countFilledFields(draft: GarmentMeasurementDraft): number {
  const filledValues = Object.values(draft.values).filter(
    (v) => v.trim() !== ""
  ).length;
  return (
    filledValues +
    (draft.fitNotes.trim() ? 1 : 0) +
    (draft.notes.trim() ? 1 : 0)
  );
}

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export function GarmentMeasurementModal({
  initial,
  fields,
  onCancel,
  onSave,
}: {
  initial: GarmentMeasurementDraft;
  // The measurement fields to render, specific to the garment type being
  // measured (see getMeasurementFields in lib/garment-catalog.ts).
  fields: MeasurementFieldDef[];
  onCancel: () => void;
  onSave: (draft: GarmentMeasurementDraft) => void;
}) {
  const { t } = useLanguage();
  const [values, setValues] = useState<Record<string, string>>(initial.values);
  const [fitNotes, setFitNotes] = useState(initial.fitNotes);
  const [notes, setNotes] = useState(initial.notes);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ garmentType: initial.garmentType, values, fitNotes, notes });
  }

  return (
    <>
      <div
        onClick={onCancel}
        className="fixed inset-0 z-[60] bg-black/30"
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-[13px] font-medium text-ink-muted">
                {t("orders.measurementBtnTitle")}
              </p>
              <h3 className="text-[17px] font-semibold text-ink">
                {initial.garmentType || "Untitled Garment"}
              </h3>
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

          <form onSubmit={handleSubmit}>
            {fields.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {fields.map(({ key, label }) => (
                  <label key={key} className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">
                      {label}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={values[key] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                No standard measurement fields for this garment type — use Fit
                Notes/Notes below.
              </p>
            )}

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-muted">
                {t("common.fitNotes")}
              </span>
              <textarea
                value={fitNotes}
                onChange={(e) => setFitNotes(e.target.value)}
                rows={2}
                placeholder="e.g. fit preference, comfort notes, special instructions"
                className="rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </label>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-muted">
                {t("common.notes")}
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </label>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
              >
                {t("customers.saveMeasurements")}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
