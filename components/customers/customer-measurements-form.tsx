"use client";

import { MEASUREMENT_FIELD_GROUPS, measurementFieldLabel } from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";
const textareaClass =
  "rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

const FIELD_GROUPS = MEASUREMENT_FIELD_GROUPS.filter((g) => g.title !== "Notes");

// Standalone edit form for a customer's CustomerMeasurements baseline —
// grouped fields (Upper Body / Lower Body / Garment Length / Style), not the
// old gender-driven Male/Female template. All fields optional/blank-allowed.
export function CustomerMeasurementsForm({
  values,
  notes,
  onValueChange,
  onNotesChange,
}: {
  values: Record<string, string>;
  notes: string;
  onValueChange: (key: string, value: string) => void;
  onNotesChange: (notes: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      {FIELD_GROUPS.map((group) => (
        <div
          key={group.title}
          className="rounded-xl border border-border-soft bg-white p-5 shadow-soft"
        >
          <h3 className="mb-4 text-[17px] font-semibold text-ink">
            {group.title}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {group.fieldIds.map((id) => (
              <label key={id} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-muted">
                  {measurementFieldLabel(id)}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[id] ?? ""}
                  onChange={(e) => onValueChange(id, e.target.value)}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <h3 className="mb-4 text-[17px] font-semibold text-ink">{t("common.notes")}</h3>
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              {t("common.fitNotes")}
            </span>
            <textarea
              value={values.fitNotes ?? ""}
              onChange={(e) => onValueChange("fitNotes", e.target.value)}
              rows={2}
              placeholder="e.g. fit preference, comfort notes, special instructions"
              className={textareaClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              {t("customers.generalNotes")}
            </span>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={2}
              className={textareaClass}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
