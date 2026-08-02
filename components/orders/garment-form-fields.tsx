"use client";

import { useCallback, type MutableRefObject, type Ref } from "react";
import { ChevronDown } from "lucide-react";

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
  controlRef,
}: {
  field: RuntimeGarmentField;
  value: GarmentFieldValue;
  error?: string;
  disabled: boolean;
  onChange: (code: string, value: GarmentFieldValue) => void;
  controlRef?: Ref<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
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
          ref={controlRef as Ref<HTMLTextAreaElement>}
          disabled={disabled}
          required={field.required}
          value={(value as string | null) ?? ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(field.code, event.target.value)}
          className="min-h-16 rounded-md border border-border bg-white p-2 text-sm text-ink"
        />
      ) : field.inputType === "select" ? (
        <span className="relative block">
          <select
            ref={controlRef as Ref<HTMLSelectElement>}
            disabled={disabled}
            required={field.required}
            value={(value as string | null) ?? ""}
            onChange={(event) => onChange(field.code, event.target.value)}
            className="h-10 w-full appearance-none rounded-md border border-border bg-white pl-3 pr-9 text-sm text-ink"
          >
            <option value="">Select...</option>
            {field.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
        </span>
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
        <span className="block">
          <input
            ref={controlRef as Ref<HTMLInputElement>}
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
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-white px-2 text-sm text-ink"
          />
        </span>
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
  firstControlRef,
}: {
  fields: RuntimeGarmentField[];
  values: GarmentFieldValues;
  errors?: Record<string, string>;
  disabled?: boolean;
  showSectionHeadings?: boolean;
  layout?: "stack" | "columns" | "instructions";
  onChange: (code: string, value: GarmentFieldValue) => void;
  firstControlRef?: Ref<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
}) {
  const setFirstControlRef = useCallback(
    (node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => {
      if (typeof firstControlRef === "function") {
        firstControlRef(node);
      } else if (firstControlRef && "current" in firstControlRef) {
        (firstControlRef as MutableRefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>).current = node;
      }
    },
    [firstControlRef]
  );

  const groups = fields.reduce<Record<string, RuntimeGarmentField[]>>((all, field) => {
    (all[field.sectionName] ??= []).push(field);
    return all;
  }, {});

  let controlIndex = 0;
  const content = Object.entries(groups).map(([section, group]) => (
    <section
      key={section}
      className={
        layout === "columns"
          ? "min-w-0 rounded-lg border border-border-soft bg-white p-4"
          : "mb-4"
      }
    >
      {showSectionHeadings && (
        <h4 className="mb-3 text-[15px] font-semibold text-ink">{section}</h4>
      )}
      <div className={layout === "columns" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" : layout === "instructions" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-2 gap-3 md:grid-cols-3"}>
        {group.map((field) => {
          const isFirst = controlIndex++ === 0;
          return <FieldControl
            key={field.code}
            field={field}
            value={values[field.code]}
            error={errors[field.code]}
            disabled={disabled}
            onChange={onChange}
            controlRef={isFirst ? setFirstControlRef : undefined}
          />;
        })}
      </div>
    </section>
  ));

  if (layout === "columns") {
    return <div className="grid min-w-0 gap-4">{content}</div>;
  }

  return <>{content}</>;
}
