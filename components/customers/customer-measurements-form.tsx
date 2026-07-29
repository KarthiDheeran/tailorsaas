"use client";

import { GarmentFormFields } from "@/components/orders/garment-form-fields";
import type {
  GarmentFieldValue,
  GarmentFieldValues,
  RuntimeGarmentField,
} from "@/lib/garment-form-runtime";

const textareaClass =
  "rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

function formatGarmentName(name: string) {
  return name
    .trim()
    .split(/(\s+|\/|-)/)
    .map((part) =>
      /^[a-z]/i.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part
    )
    .join("");
}

export function CustomerMeasurementsForm({
  garmentName,
  fields,
  values,
  notes,
  onValueChange,
  onNotesChange,
}: {
  garmentName: string;
  fields: RuntimeGarmentField[];
  values: GarmentFieldValues;
  notes: string;
  onValueChange: (key: string, value: GarmentFieldValue) => void;
  onNotesChange: (notes: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <h3 className="mb-4 text-[17px] font-semibold text-ink">
          {garmentName ? `${formatGarmentName(garmentName)} Measurements` : "Measurements"}
        </h3>
        {fields.length > 0 ? (
          <GarmentFormFields fields={fields} values={values} onChange={onValueChange} />
        ) : (
          <p className="text-sm text-ink-muted">
            No measurement fields configured for this garment type.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <label className="flex flex-col gap-1.5">
          <span className="text-[17px] font-semibold text-ink">
            Measurement Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={4}
            placeholder="Fit preference, special instructions, comfort notes, old measurement reference..."
            className={textareaClass}
          />
        </label>
      </div>
    </div>
  );
}
