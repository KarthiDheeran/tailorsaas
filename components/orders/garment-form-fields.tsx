"use client";

import type {
  GarmentFieldValue,
  GarmentFieldValues,
  RuntimeGarmentField,
} from "@/lib/garment-form-runtime";

function multiselectValues(value: GarmentFieldValue): string[] {
  return Array.isArray(value)
    ? value.filter((option): option is string => typeof option === "string")
    : [];
}

function FieldControl({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: RuntimeGarmentField;
  value: GarmentFieldValue;
  error?: string;
  disabled: boolean;
  onChange: (code: string, value: GarmentFieldValue) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium text-ink-muted">
      <span>
        {field.name}
        {field.required && <b className="ml-1 text-chip-red-fg">*</b>}
        {field.unit && ` (${field.unit})`}
      </span>
      {field.inputType === "textarea" ? (
        <textarea
          disabled={disabled}
          required={field.required}
          value={(value as string | null) ?? ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(field.code, event.target.value)}
          className="min-h-16 rounded-md border border-border bg-white p-2 text-sm text-ink"
        />
      ) : field.inputType === "select" ? (
        <select
          disabled={disabled}
          required={field.required}
          value={(value as string | null) ?? ""}
          onChange={(event) => onChange(field.code, event.target.value)}
          className="h-10 rounded-md border border-border bg-white px-2 text-sm text-ink"
        >
          <option value="">Select...</option>
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : field.inputType === "multiselect" ? (
        <div className="space-y-1 rounded-md border border-border bg-white p-2">
          {field.options.map((option) => {
            const current = multiselectValues(value);
            const selected = current.includes(option);
            return (
              <label className="flex items-center gap-2 text-sm text-ink" key={option}>
                <input
                  disabled={disabled}
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    onChange(
                      field.code,
                      selected
                        ? current.filter((item) => item !== option)
                        : [...current, option]
                    )
                  }
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : field.inputType === "checkbox" ? (
        <span className="flex h-10 items-center gap-2">
          <input
            disabled={disabled}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(field.code, event.target.checked)}
          />
          <span className="text-sm text-ink">Yes</span>
        </span>
      ) : (
        <input
          disabled={disabled}
          required={field.required}
          type={field.inputType === "number" ? "number" : "text"}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          step={field.decimalPlaces === null ? undefined : 1 / 10 ** field.decimalPlaces}
          value={(value as string | number | null) ?? ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) =>
            onChange(
              field.code,
              field.inputType === "number"
                ? event.target.value === ""
                  ? null
                  : Number(event.target.value)
                : event.target.value
            )
          }
          className="h-10 rounded-md border border-border bg-white px-2 text-sm text-ink"
        />
      )}
      {error && <span className="text-xs text-chip-red-fg">{error}</span>}
    </label>
  );
}

export function GarmentFormFields({
  fields,
  values,
  errors = {},
  disabled = false,
  showSectionHeadings = true,
  layout = "stack",
  onChange,
}: {
  fields: RuntimeGarmentField[];
  values: GarmentFieldValues;
  errors?: Record<string, string>;
  disabled?: boolean;
  showSectionHeadings?: boolean;
  layout?: "stack" | "columns";
  onChange: (code: string, value: GarmentFieldValue) => void;
}) {
  const groups = fields.reduce<Record<string, RuntimeGarmentField[]>>((all, field) => {
    (all[field.sectionName] ??= []).push(field);
    return all;
  }, {});

  const content = Object.entries(groups).map(([section, group]) => (
    <section
      key={section}
      className={
        layout === "columns"
          ? "h-full min-w-[430px] max-w-[560px] flex-1 overflow-y-auto rounded-lg border border-border-soft bg-white p-4"
          : "mb-4"
      }
    >
      {showSectionHeadings && (
        <h4 className="mb-3 text-[15px] font-semibold text-ink">{section}</h4>
      )}
      <div className={layout === "columns" ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 md:grid-cols-3"}>
        {group.map((field) => (
          <FieldControl
            key={field.code}
            field={field}
            value={values[field.code]}
            error={errors[field.code]}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  ));

  if (layout === "columns") {
    return <div className="flex min-w-max gap-4">{content}</div>;
  }

  return <>{content}</>;
}
