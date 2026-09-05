"use client";

import { useCallback, useState, type MutableRefObject, type Ref } from "react";
import { ChevronDown } from "lucide-react";

import type {
  GarmentFieldValue,
  GarmentFieldValues,
  GarmentTableRow,
  RuntimeGarmentField,
} from "@/lib/garment-form-runtime";
import {
  computeGarmentTableCell,
  garmentTableColumnOptions,
  garmentTableSelectedOptionMetadata,
} from "@/lib/garment-form-runtime";
import { cn } from "@/lib/utils";

function multiselectValues(value: GarmentFieldValue): string[] {
  return Array.isArray(value)
    ? value.filter((option): option is string => typeof option === "string")
    : [];
}

function tableRows(value: GarmentFieldValue, field: RuntimeGarmentField): GarmentTableRow[] {
  const existing = Array.isArray(value)
    ? value.filter((row): row is GarmentTableRow => row !== null && typeof row === "object" && !Array.isArray(row))
    : [];
  const count = Math.max(field.tableConfig?.rows ?? 11, existing.length);
  return Array.from({ length: count }, (_, index) => existing[index] ?? {});
}

function TableFieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: RuntimeGarmentField;
  value: GarmentFieldValue;
  disabled: boolean;
  onChange: (code: string, value: GarmentFieldValue) => void;
}) {
  const [activeCell, setActiveCell] = useState<{ rowIndex: number; columnKey: string } | null>(null);
  const config = field.tableConfig;
  if (!config) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-sm text-ink-muted">
        Table columns are not configured for {field.name}.
      </p>
    );
  }
  const rows = tableRows(value, field);
  const columnClass = (key: string, type: string) => {
    if (key === "qty") return "w-[72px] min-w-[72px]";
    if (key === "total") return "w-[76px] min-w-[76px]";
    if (key === "tailorAmount" || key === "itemPrice") return "w-[112px] min-w-[112px]";
    if (type === "display") return "w-[130px] min-w-[130px]";
    return "w-[150px] min-w-[150px]";
  };
  const updateCell = (
    rowIndex: number,
    key: string,
    nextValue: string | number | null,
    defaults: Record<string, string | number> = {}
  ) => {
    const nextRows = rows.map((row, index) => index === rowIndex ? { ...row, [key]: nextValue, ...defaults } : row);
    const normalized = nextRows.map((row) => {
      const next = { ...row };
      for (const column of config.columns) {
        if (column.type === "calculated" || column.type === "display") {
          const computed = computeGarmentTableCell(next, column);
          next[column.key] = computed === "" ? null : computed;
        }
      }
      return next;
    });
    onChange(field.code, normalized);
  };
  const isActiveColumn = (key: string) => activeCell?.columnKey === key;
  const isActiveRow = (rowIndex: number) => activeCell?.rowIndex === rowIndex;
  const markActive = (rowIndex: number, columnKey: string) => {
    setActiveCell({ rowIndex, columnKey });
  };
  const clearActive = (rowIndex: number, columnKey: string) => {
    setActiveCell((current) =>
      current?.rowIndex === rowIndex && current.columnKey === columnKey ? null : current
    );
  };
  const handleWorkEntryEnter = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    role: "item" | "qty"
  ) => {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    const nextRow = role === "item" ? rowIndex : rowIndex + 1;
    const nextRole = role === "item" ? "qty" : "item";
    const next = event.currentTarget
      .closest("table")
      ?.querySelector<HTMLElement>(
        `[data-work-entry-row="${nextRow}"][data-work-entry-role="${nextRole}"]`
      );
    next?.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement) next.select();
  };
  const focusableCellClass = (rowIndex: number, key: string) =>
    `h-8 w-full min-w-0 rounded border px-2 text-xs text-ink outline-none transition-colors ${
      activeCell?.rowIndex === rowIndex && activeCell.columnKey === key
        ? "border-primary bg-primary-tint ring-2 ring-primary/25"
        : isActiveColumn(key)
          ? "border-primary/40 bg-primary-tint/50"
          : "border-border bg-white focus:border-primary focus:ring-2 focus:ring-primary/25"
    }`;
  const readOnlyCellClass = (rowIndex: number, key: string) =>
    `min-h-8 truncate rounded border px-2 py-1.5 text-xs font-medium text-ink transition-colors ${
      isActiveColumn(key)
        ? "border-primary/30 bg-primary-tint/50"
        : isActiveRow(rowIndex)
          ? "border-border-soft bg-surface-muted/80"
          : "border-border-soft bg-surface-muted"
    }`;

  return (
    <div className="col-span-full overflow-x-auto rounded-lg border border-border-soft bg-white">
      <table className="w-full min-w-0 table-fixed text-left text-xs">
        <thead className="bg-surface-muted text-ink-muted">
          <tr>
            {config.columns.map((column) => (
              <th key={column.key} className={`${columnClass(column.key, column.type)} px-2 py-2 font-semibold transition-colors ${isActiveColumn(column.key) ? "bg-primary-tint text-primary-strong" : ""}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={`border-t border-border-soft transition-colors ${isActiveRow(rowIndex) ? "bg-primary-tint/20" : ""}`}>
              {config.columns.map((column) => {
                const rowConfig = config.rowConfigs[rowIndex];
                const computed = computeGarmentTableCell(row, column);
                const cellValue = column.type === "calculated" || column.type === "display"
                  ? computed
                  : row[column.key] ?? "";
                return (
                  <td key={column.key} className={`${columnClass(column.key, column.type)} px-1.5 py-1.5 transition-colors ${isActiveColumn(column.key) ? "bg-primary-tint/30" : ""}`}>
                    {column.type === "select" ? (
                      <select
                        disabled={disabled}
                        value={String(cellValue ?? "")}
                        onFocus={() => markActive(rowIndex, column.key)}
                        onBlur={() => clearActive(rowIndex, column.key)}
                        data-enter-next-skip={column.key === "item" ? "true" : undefined}
                        data-work-entry-row={column.key === "item" ? rowIndex : undefined}
                        data-work-entry-role={column.key === "item" ? "item" : undefined}
                        onKeyDown={column.key === "item" ? (event) => handleWorkEntryEnter(event, rowIndex, "item") : undefined}
                        onChange={(event) => {
                          const nextValue = event.target.value || null;
                          const metadata = nextValue
                            ? garmentTableSelectedOptionMetadata(column, rowConfig, nextValue)
                            : { defaults: {} };
                          updateCell(rowIndex, column.key, nextValue, {
                            ...metadata.defaults,
                            ...(metadata.workerStage ? { workerStage: metadata.workerStage } : {}),
                            ...(metadata.labelTa && column.key === "item" ? { itemTa: metadata.labelTa } : {}),
                          });
                        }}
                        className={focusableCellClass(rowIndex, column.key)}
                      >
                        <option value="">Select...</option>
                        {garmentTableColumnOptions(column, rowConfig).map((option) => {
                          const optionMetadata = garmentTableSelectedOptionMetadata(column, rowConfig, option);
                          return (
                            <option key={option} value={option}>
                              {optionMetadata.labelTa || option}
                            </option>
                          );
                        })}
                      </select>
                    ) : column.readonly ? (
                      <div className={readOnlyCellClass(rowIndex, column.key)}>
                        {cellValue === null || cellValue === undefined || cellValue === "" ? "—" : String(cellValue)}
                      </div>
                    ) : column.type === "number" ? (
                      <input
                        disabled={disabled}
                        type="number"
                        value={cellValue === null ? "" : String(cellValue)}
                        onFocus={() => markActive(rowIndex, column.key)}
                        onBlur={() => clearActive(rowIndex, column.key)}
                        data-enter-next-skip={column.key === "qty" ? "true" : undefined}
                        data-work-entry-row={column.key === "qty" ? rowIndex : undefined}
                        data-work-entry-role={column.key === "qty" ? "qty" : undefined}
                        onKeyDown={column.key === "qty" ? (event) => handleWorkEntryEnter(event, rowIndex, "qty") : undefined}
                        onChange={(event) =>
                          updateCell(
                            rowIndex,
                            column.key,
                            event.target.value === "" ? null : Number(event.target.value)
                          )
                        }
                        className={focusableCellClass(rowIndex, column.key)}
                      />
                    ) : column.type === "calculated" || column.type === "display" ? (
                      <div className={readOnlyCellClass(rowIndex, column.key)}>
                        {cellValue === null || cellValue === undefined || cellValue === "" ? "—" : String(cellValue)}
                      </div>
                    ) : (
                      <input
                        disabled={disabled}
                        value={cellValue === null ? "" : String(cellValue)}
                        onFocus={() => markActive(rowIndex, column.key)}
                        onBlur={() => clearActive(rowIndex, column.key)}
                        onChange={(event) => updateCell(rowIndex, column.key, event.target.value || null)}
                        className={focusableCellClass(rowIndex, column.key)}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
    <label className="flex min-w-0 flex-col gap-1 text-[13px] font-medium text-ink-muted">
      <span>
        {field.name}
        {field.required && <b className="ml-1 text-chip-red-fg">*</b>}
        {field.unit && ` (${field.unit})`}
      </span>
      {field.inputType === "table" ? (
        <TableFieldControl
          field={field}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      ) : field.inputType === "textarea" ? (
        <textarea
          ref={controlRef as Ref<HTMLTextAreaElement>}
          disabled={disabled}
          required={field.required}
          value={(value as string | null) ?? ""}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(field.code, event.target.value)}
          className="min-h-16 w-full min-w-0 rounded-md border border-border bg-white p-2 text-sm text-ink"
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
        <span className="block min-w-0">
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
            className="h-10 w-full min-w-0 rounded-md border border-border bg-white px-2 text-sm text-ink"
          />
        </span>
      )}
      {error && <span className="text-xs text-chip-red-fg">{error}</span>}
    </label>
  );
}

function shortMeasurementCode(field: RuntimeGarmentField) {
  const explicit = String(field.uiMetadata?.shortCode ?? field.uiMetadata?.legacyCode ?? "").trim();
  if (explicit) return explicit;
  const words = field.name.match(/[A-Za-z0-9]+/g) ?? [];
  const generated = words.length <= 1
    ? field.name.slice(0, 3)
    : words.map((word) => word[0]).join("");
  return `${generated.toLowerCase()}:`;
}

function CompactLegacyFieldControl({
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
  if (
    field.inputType === "table" ||
    field.inputType === "textarea" ||
    field.inputType === "multiselect" ||
    field.inputType === "checkbox"
  ) {
    return <FieldControl field={field} value={value} error={error} disabled={disabled} onChange={onChange} controlRef={controlRef} />;
  }

  const label = (
    <span className="truncate border-r border-border-soft bg-surface-muted px-2 py-1.5 text-xs font-semibold text-ink-muted" title={field.name}>
      {field.name}
      {field.required && <b className="ml-1 text-chip-red-fg">*</b>}
    </span>
  );
  const code = <span className="px-1.5 text-[11px] font-medium text-ink-faint">{shortMeasurementCode(field)}</span>;
  const inputClass = "h-7 min-w-0 border-0 bg-white px-2 text-xs text-ink outline-none focus:bg-primary-tint/40";

  return (
    <label className="grid min-w-0 grid-cols-[minmax(96px,1fr)_70px_34px] items-stretch overflow-hidden rounded border border-border bg-white">
      {label}
      {field.inputType === "select" ? (
        <select
          ref={controlRef as Ref<HTMLSelectElement>}
          disabled={disabled}
          required={field.required}
          value={(value as string | null) ?? ""}
          onChange={(event) => onChange(field.code, event.target.value)}
          className={inputClass}
        >
          <option value=""></option>
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
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
          className={inputClass}
        />
      )}
      {code}
      {error && <span className="col-span-3 border-t border-chip-red/30 px-2 py-1 text-[11px] text-chip-red-fg">{error}</span>}
    </label>
  );
}

function PaperRowsFieldControl({
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
  if (
    field.inputType === "table" ||
    field.inputType === "textarea" ||
    field.inputType === "multiselect" ||
    field.inputType === "checkbox"
  ) {
    return <FieldControl field={field} value={value} error={error} disabled={disabled} onChange={onChange} controlRef={controlRef} />;
  }

  const isInstructionField = field.fieldType === "instruction";
  const inputClass = "h-10 w-full min-w-0 rounded-r-md border-0 border-l border-border-soft bg-white px-3 text-lg text-ink outline-none focus:bg-primary-tint/40";
  const rowClass = isInstructionField
    ? "grid w-full min-w-0 grid-cols-[140px_minmax(520px,1fr)] items-stretch overflow-hidden rounded-md border border-border bg-white"
    : "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_150px] items-stretch overflow-hidden rounded-md border border-border bg-white";

  return (
    <label className={rowClass}>
      <span className="truncate bg-surface-muted px-3 py-2.5 text-base font-semibold text-ink-muted" title={field.name}>
        {field.name}
        {field.required && <b className="ml-1 text-chip-red-fg">*</b>}
      </span>
      {field.inputType === "select" ? (
        <select
          ref={controlRef as Ref<HTMLSelectElement>}
          disabled={disabled}
          required={field.required}
          value={(value as string | null) ?? ""}
          onChange={(event) => onChange(field.code, event.target.value)}
          className={inputClass}
        >
          <option value="">Select...</option>
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
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
          className={inputClass}
        />
      )}
      {error && <span className="col-span-2 border-t border-chip-red/30 px-2 py-1 text-xs text-chip-red-fg">{error}</span>}
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
  layout?: "stack" | "columns" | "instructions" | "compactLegacyBody" | "paperRowsBody";
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
  const content = Object.entries(groups).map(([section, group]) => {
    const hasTable = group.some((field) => field.inputType === "table");
    const useTwoColumnVertical =
      layout === "compactLegacyBody" &&
      !hasTable &&
      section.trim().toLowerCase() === "body measurements";
    const usePaperRows =
      layout === "paperRowsBody" &&
      !hasTable;
    const firstColumnFields = useTwoColumnVertical
      ? group.slice(0, Math.ceil(group.length / 2))
      : group;
    const secondColumnFields = useTwoColumnVertical
      ? group.slice(Math.ceil(group.length / 2))
      : [];
    const paperRowColumns = usePaperRows
      ? Array.from({ length: Math.ceil(group.length / 10) }, (_, index) =>
          group.slice(index * 10, index * 10 + 10)
        )
      : [];
    const isPaperInstructionGroup = usePaperRows && group[0]?.fieldType === "instruction";
    const paperRowsGridClass =
      paperRowColumns.length >= 3
        ? "grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3"
        : paperRowColumns.length === 2
          ? "grid grid-cols-1 gap-3 lg:grid-cols-2"
          : "grid grid-cols-1 gap-3";
    const renderControl = (field: RuntimeGarmentField) => {
      const isFirst = controlIndex++ === 0;
      const Control = usePaperRows
        ? PaperRowsFieldControl
        : useTwoColumnVertical
          ? CompactLegacyFieldControl
          : FieldControl;
      return <Control
        key={field.code}
        field={field}
        value={values[field.code]}
        error={errors[field.code]}
        disabled={disabled}
        onChange={onChange}
        controlRef={isFirst ? setFirstControlRef : undefined}
      />;
    };
    return (
    <section
      key={section}
      className={
        layout === "paperRowsBody"
          ? cn(
              "max-w-full min-w-0 rounded-lg border border-border-soft bg-white p-4",
              isPaperInstructionGroup ? "w-full" : "w-fit"
            )
          : layout === "columns" || layout === "compactLegacyBody"
          ? "min-w-0 rounded-lg border border-border-soft bg-white p-4"
          : "mb-4"
      }
    >
      {showSectionHeadings && (
        <h4 className="mb-3 text-[15px] font-semibold text-ink">{section}</h4>
      )}
      <div className={
        hasTable
          ? "grid grid-cols-1 gap-3"
          : useTwoColumnVertical
            ? "grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2"
            : usePaperRows
              ? paperRowsGridClass
            : layout === "columns" || layout === "compactLegacyBody" || layout === "paperRowsBody"
              ? "grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3"
              : layout === "instructions"
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "grid grid-cols-2 gap-3 md:grid-cols-3"
      }>
        {usePaperRows ? (
          paperRowColumns.map((column, index) => (
            <div className={cn("grid max-w-full grid-cols-1 content-start gap-2", isPaperInstructionGroup ? "w-full" : "w-[390px]")} key={index}>
              {column.map(renderControl)}
            </div>
          ))
        ) : useTwoColumnVertical ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              {firstColumnFields.map(renderControl)}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {secondColumnFields.map(renderControl)}
            </div>
          </>
        ) : (
          group.map(renderControl)
        )}
      </div>
    </section>
    );
  });

  if (layout === "columns" || layout === "compactLegacyBody" || layout === "paperRowsBody") {
    const groupEntries = Object.entries(groups);
    const columnsClass =
      layout === "paperRowsBody" && groupEntries.length >= 3
        ? "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0px,1.05fr)_minmax(0px,1fr)_minmax(360px,0.8fr)]"
        : groupEntries.length >= 3
        ? "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0px,1fr)_minmax(0px,1fr)_minmax(430px,1.15fr)]"
        : layout === "paperRowsBody" && groupEntries.length === 2
          ? "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0px,1.05fr)_minmax(0px,1fr)]"
        : groupEntries.length === 2
          ? "grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0px,0.95fr)_minmax(0px,1.1fr)]"
          : "grid min-w-0 items-start gap-4 xl:grid-cols-1";
    return (
      <div className={columnsClass}>
        {content}
      </div>
    );
  }

  return <>{content}</>;
}
