import type { CatalogGarmentTypeField, CatalogSection } from "@/lib/catalog";

export type GarmentTableColumnType = "text" | "number" | "select" | "calculated" | "display";

export type GarmentTableColumn = {
  key: string;
  label: string;
  type: GarmentTableColumnType;
  options?: string[];
  optionsSource?: string;
  source?: string;
  formula?: "qty*tailorAmount" | "qty*rate" | "qty*itemPrice";
  template?: string;
  readonly?: boolean;
};

export type GarmentTableRowConfig = Record<string, unknown>;

export type GarmentTableConfig = {
  rows: number;
  rowConfigs: GarmentTableRowConfig[];
  columns: GarmentTableColumn[];
};

export type GarmentTableRow = Record<string, string | number | null>;
export type GarmentTableValue = GarmentTableRow[];
export type GarmentFieldValue = number | string | string[] | boolean | GarmentTableValue | null;
export type GarmentFieldValues = Record<string, GarmentFieldValue>;

/** Request-local editable values plus historical keys not in the active schema. */
export type GarmentFieldDraft = {
  typedValues: GarmentFieldValues;
  passthroughValues: Record<string, unknown>;
};

export function createGarmentFieldDraft(
  values: Record<string, unknown>,
  knownFields: ReadonlyArray<Pick<RuntimeGarmentField, "code" | "inputType"> & Partial<Pick<RuntimeGarmentField, "options" | "tableConfig">>>
): GarmentFieldDraft {
  const fieldByCode = new Map(knownFields.map((field) => [field.code, field]));
  const typedValues: GarmentFieldValues = {};
  const passthroughValues: Record<string, unknown> = {};
  for (const [code, value] of Object.entries(values)) {
    const field = fieldByCode.get(code);
    if (!field) {
      passthroughValues[code] = value;
      continue;
    }
    const normalized = field.inputType === "table"
      ? normalizeGarmentTableValue(value, field.tableConfig ?? null, true)
      : normalizeGarmentFieldValue(value, field.inputType);
    const options = field.options ?? [];
    // Historical/customer defaults can outlive catalog option changes. Never
    // keep an invisible stale selection in a new order draft: the control
    // appears blank but the old value would otherwise fail server validation.
    if (field.inputType === "select" && typeof normalized === "string" && options.length > 0) {
      typedValues[code] = options.includes(normalized) ? normalized : null;
    } else if (field.inputType === "multiselect" && Array.isArray(normalized) && options.length > 0) {
      typedValues[code] = normalized.filter((option): option is string => typeof option === "string" && options.includes(option));
    } else {
      typedValues[code] = normalized;
    }
  }
  return { typedValues, passthroughValues };
}

export function serializeGarmentFieldDraft(
  draft: GarmentFieldDraft
): Record<string, unknown> {
  return { ...draft.passthroughValues, ...draft.typedValues };
}

/** @deprecated Use GarmentFieldDraft. Kept during the New Order rollout. */
export type NewOrderGarmentFieldDraft = GarmentFieldDraft;
/** @deprecated Use createGarmentFieldDraft. */
export const createNewOrderGarmentFieldDraft = createGarmentFieldDraft;
/** @deprecated Use serializeGarmentFieldDraft. */
export const serializeNewOrderGarmentFieldDraft = serializeGarmentFieldDraft;

export type RuntimeGarmentField = {
  code: string;
  name: string;
  fieldType: "measurement" | "style" | "instruction";
  inputType: "number" | "text" | "textarea" | "select" | "multiselect" | "checkbox" | "table";
  sectionId: string | null;
  sectionName: string;
  sectionOrder: number;
  displayOrder: number;
  required: boolean;
  unit: string | null;
  placeholder: string | null;
  options: string[];
  uiMetadata: Record<string, unknown>;
  tableConfig: GarmentTableConfig | null;
  min: number | null;
  max: number | null;
  decimalPlaces: number | null;
  defaultValue: GarmentFieldValue;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const object = asObject(value);
  const name = typeof object.name === "string" ? object.name : typeof object.label === "string" ? object.label : "";
  return name.trim();
}

export function garmentTableOptionMetadata(
  value: unknown
): { defaults: Record<string, number>; workerStage?: string; labelTa?: string } {
  const object = asObject(value);
  const defaults = Object.fromEntries(
    ["tailorAmount", "itemPrice", "rate", "qty"].flatMap((key) => {
      const parsed = numberOrNull(object[key]);
      return parsed === null ? [] : [[key, parsed]];
    })
  );
  const workerStage = typeof object.workerStage === "string" && object.workerStage.trim()
    ? object.workerStage.trim()
    : undefined;
  const labelTa =
    typeof object.labelTa === "string" && object.labelTa.trim()
      ? object.labelTa.trim()
      : typeof object.nameTa === "string" && object.nameTa.trim()
        ? object.nameTa.trim()
        : typeof object.tamil === "string" && object.tamil.trim()
          ? object.tamil.trim()
          : undefined;
  return { defaults, workerStage, labelTa };
}

function optionList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function resolveGarmentTableConfig(
  metadata: Record<string, unknown> | null | undefined
): GarmentTableConfig | null {
  const root = asObject(metadata);
  const table = asObject(root.table ?? root);
  const rawColumns = Array.isArray(table.columns) ? table.columns : [];
  const columns = rawColumns.flatMap((rawColumn): GarmentTableColumn[] => {
    const column = asObject(rawColumn);
    const key = typeof column.key === "string" ? column.key.trim() : "";
    const label = typeof column.label === "string" ? column.label.trim() : key;
    const type = typeof column.type === "string" ? column.type : "text";
    if (!key || !label) return [];
    if (!["text", "number", "select", "calculated", "display"].includes(type)) return [];
    return [{
      key,
      label,
      type: type as GarmentTableColumnType,
      options: stringList(column.options),
      optionsSource: typeof column.optionsSource === "string" ? column.optionsSource.trim() : undefined,
      source: typeof column.source === "string" ? column.source.trim() : undefined,
      formula:
        column.formula === "qty*tailorAmount" || column.formula === "qty*rate" || column.formula === "qty*itemPrice"
          ? column.formula
          : undefined,
      template: typeof column.template === "string" ? column.template : undefined,
      readonly: column.readonly === true,
    }];
  });
  if (columns.length === 0) return null;
  const rawRows = Array.isArray(table.rows) ? table.rows : [];
  const rowConfigs = rawRows.map(asObject);
  const rows = rowConfigs.length > 0
    ? Math.min(rowConfigs.length, 50)
    : typeof table.rows === "number" && Number.isInteger(table.rows)
      ? Math.max(1, Math.min(table.rows, 50))
      : 11;
  return { rows, rowConfigs, columns };
}

function numberFromCell(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSourceValue(row: GarmentTableRow, source: string | undefined): string {
  if (!source) return "";
  const value = row[source];
  return value === null || value === undefined ? "" : String(value);
}

export function garmentTableColumnOptions(
  column: GarmentTableColumn,
  rowConfig?: GarmentTableRowConfig
): string[] {
  if (column.optionsSource && rowConfig) {
    const sourceKey = column.optionsSource.replace(/^row\./, "");
    const rowOptions = optionList(rowConfig[sourceKey]).map(optionName).filter(Boolean);
    if (rowOptions.length > 0) return rowOptions;
  }
  return column.options ?? [];
}

export function garmentTableOptionDefaults(
  column: GarmentTableColumn,
  rowConfig: GarmentTableRowConfig | undefined,
  selectedValue: string
): Record<string, number> {
  if (!column.optionsSource || !rowConfig || !selectedValue) return {};
  const sourceKey = column.optionsSource.replace(/^row\./, "");
  const option = optionList(rowConfig[sourceKey]).find((candidate) => optionName(candidate) === selectedValue);
  return option ? garmentTableOptionMetadata(option).defaults : {};
}

export function garmentTableSelectedOptionMetadata(
  column: GarmentTableColumn,
  rowConfig: GarmentTableRowConfig | undefined,
  selectedValue: string
): { defaults: Record<string, number>; workerStage?: string; labelTa?: string } {
  if (!column.optionsSource || !rowConfig || !selectedValue) return { defaults: {} };
  const sourceKey = column.optionsSource.replace(/^row\./, "");
  const option = optionList(rowConfig[sourceKey]).find((candidate) => optionName(candidate) === selectedValue);
  return option ? garmentTableOptionMetadata(option) : { defaults: {} };
}

export function computeGarmentTableCell(
  row: GarmentTableRow,
  column: GarmentTableColumn
): string | number {
  if (column.type === "display") {
    if (column.template) {
      return column.template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
        const value = row[key];
        return value === null || value === undefined ? "" : String(value);
      }).replace(/\s+/g, " ").trim();
    }
    return resolveSourceValue(row, column.source);
  }
  if (column.type === "calculated") {
    if (column.formula === "qty*rate") return numberFromCell(row.qty) * numberFromCell(row.rate);
    if (column.formula === "qty*itemPrice") return numberFromCell(row.qty) * numberFromCell(row.itemPrice);
    return numberFromCell(row.qty) * numberFromCell(row.tailorAmount);
  }
  return "";
}

function normalizeGarmentTableValue(
  value: unknown,
  config: GarmentTableConfig | null,
  clearRowsWithInvalidSelections = false
): GarmentTableValue {
  if (!Array.isArray(value)) return [];
  const columns = config?.columns ?? [];
  return value.flatMap((rawRow): GarmentTableRow[] => {
    const row = asObject(rawRow);
    const rowIndex = Array.isArray(value) ? value.indexOf(rawRow) : -1;
    if (clearRowsWithInvalidSelections && config) {
      const rowConfig = rowIndex >= 0 ? config.rowConfigs[rowIndex] : undefined;
      const hasInvalidSelection = config.columns.some((column) => {
        if (column.type !== "select") return false;
        const cell = row[column.key];
        if (cell === null || cell === undefined || cell === "") return false;
        const options = garmentTableColumnOptions(column, rowConfig);
        return options.length > 0 && !options.includes(String(cell));
      });
      if (hasInvalidSelection) return [{}];
    }
    const normalized: GarmentTableRow = {};
    let hasAnyValue = false;
    const metadataKeys = ["workerStage", "itemTa", "labelTa", "nameTa"].filter((key) => key in row);
    const entries = columns.length > 0
      ? Array.from(new Set([...columns.map((column) => column.key), ...metadataKeys]))
      : Object.keys(row);
    for (const key of entries) {
      const column = columns.find((item) => item.key === key);
      const rawCell = row[key];
      let cell: string | number | null;
      if (rawCell === null || rawCell === undefined || rawCell === "") {
        cell = null;
      } else if (column?.type === "number" || column?.type === "calculated") {
        const parsed = typeof rawCell === "number" ? rawCell : Number(rawCell);
        cell = Number.isFinite(parsed) ? parsed : null;
      } else {
        cell = String(rawCell);
      }
      if (cell !== null && cell !== "") hasAnyValue = true;
      normalized[key] = cell;
    }
    // Row-specific dropdown options depend on the original paper row number.
    // Keep blank placeholders whenever a table config exists so row 7 cannot
    // accidentally be validated against row 5 after blank rows are removed.
    return hasAnyValue || config ? [normalized] : [];
  });
}

export function normalizeGarmentFieldValue(value: unknown, inputType: RuntimeGarmentField["inputType"]): GarmentFieldValue {
  if (value === undefined || value === null || value === "") return null;
  if (inputType === "checkbox") return value === true || value === "true";
  if (inputType === "multiselect") return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  if (inputType === "table") return normalizeGarmentTableValue(value, null);
  if (inputType === "number") {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return typeof value === "string" ? value : String(value);
}

export function resolveRuntimeGarmentFields(
  assignments: CatalogGarmentTypeField[] | null,
  sections: CatalogSection[]
): RuntimeGarmentField[] | null {
  if (!assignments || assignments.length === 0) return null;
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  return assignments.flatMap((assignment) => {
    if (!assignment.field || !assignment.field.isActive) return [];
    const section = assignment.section ?? (assignment.sectionId ? sectionsById.get(assignment.sectionId) : null);
    return [{
      code: assignment.field.code,
      name: assignment.field.name,
      fieldType: assignment.field.fieldType,
      inputType: assignment.field.inputType,
      sectionId: section?.id ?? null,
      sectionName: section?.name ?? "Other",
      sectionOrder: section?.displayOrder ?? Number.MAX_SAFE_INTEGER,
      displayOrder: assignment.displayOrder,
      required: assignment.isRequired,
      unit: assignment.field.unit,
      placeholder: assignment.field.placeholder,
      options: assignment.field.options,
      uiMetadata: assignment.field.uiMetadata,
      tableConfig: resolveGarmentTableConfig(assignment.field.uiMetadata),
      min: assignment.field.minValue,
      max: assignment.field.maxValue,
      decimalPlaces: assignment.field.decimalPlaces,
      defaultValue: normalizeGarmentFieldValue(assignment.defaultValue, assignment.field.inputType),
    }];
  }).sort((left, right) => left.sectionOrder - right.sectionOrder || left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
}

export function mergeQuickAddons(values: GarmentFieldValues): GarmentFieldValues {
  const quick = Array.isArray(values.quick_addon)
    ? values.quick_addon.filter((item): item is string => typeof item === "string")
    : [];
  const existing = typeof values.final_instructions === "string" ? values.final_instructions : "";
  const seen = new Set(existing.split("\n").map((line) => line.trim().replace(/\s+/g, " ").toLocaleLowerCase()).filter(Boolean));
  const additions = quick.filter((item) => {
    const normalized = item.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  return additions.length ? { ...values, final_instructions: [existing.trim(), ...additions].filter(Boolean).join("\n") } : values;
}

export type FieldSchemaSnapshot = {
  version: 1;
  /** Defaults to true when absent so historical orders keep their old output. */
  printMeasurementsOnJobCard?: boolean;
  fields: Array<{
    code: string;
    name: string;
    fieldType: RuntimeGarmentField["fieldType"];
    inputType: RuntimeGarmentField["inputType"];
    sectionId: string | null;
    sectionName: string;
    sectionDisplayOrder: number;
    fieldDisplayOrder: number;
    unit: string | null;
    options: string[];
    uiMetadata?: Record<string, unknown>;
    value: GarmentFieldValue;
  }>;
};

function isBlankFieldValue(value: GarmentFieldValue | undefined): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function validateGarmentFieldValues(
  fields: RuntimeGarmentField[],
  submittedValues: Record<string, unknown>,
  allowedLegacyCodes: ReadonlySet<string> = new Set()
): {
  values: GarmentFieldValues;
  error?: string;
  fieldErrors?: Record<string, string>;
} {
  const fieldByCode = new Map(fields.map((field) => [field.code, field]));
  const values: GarmentFieldValues = {};
  const invalid = (code: string, message: string) => ({
    values,
    error: message,
    fieldErrors: { [code]: message },
  });

  for (const [code, rawValue] of Object.entries(submittedValues)) {
    if (code === "__measurementNotes" || allowedLegacyCodes.has(code)) continue;
    const field = fieldByCode.get(code);
    if (!field) return invalid(code, `Unknown field: ${code}`);

    if (
      field.inputType === "number" &&
      rawValue !== null &&
      rawValue !== undefined &&
      rawValue !== "" &&
      (typeof rawValue !== "number" || !Number.isFinite(rawValue)) &&
      (typeof rawValue !== "string" || rawValue.trim() === "" || !Number.isFinite(Number(rawValue)))
    ) {
      return invalid(code, `Invalid number for ${field.name}`);
    }
    if (field.inputType === "checkbox" && typeof rawValue !== "boolean" && rawValue !== null && rawValue !== undefined) {
      return invalid(code, `Invalid checkbox value for ${field.name}`);
    }
    if (field.inputType === "multiselect" && !Array.isArray(rawValue) && rawValue !== null && rawValue !== undefined) {
      return invalid(code, `Invalid multiselect value for ${field.name}`);
    }
    if (field.inputType === "table" && !Array.isArray(rawValue) && rawValue !== null && rawValue !== undefined) {
      return invalid(code, `Invalid table value for ${field.name}`);
    }

    const value = field.inputType === "table"
      ? normalizeGarmentTableValue(rawValue, field.tableConfig)
      : normalizeGarmentFieldValue(rawValue, field.inputType);
    if (field.inputType === "select" && value !== null && typeof value === "string" && !field.options.includes(value)) {
      return invalid(code, `Invalid value for ${field.name}`);
    }
    if (field.inputType === "multiselect" && Array.isArray(value) && value.some((option) => typeof option !== "string" || !field.options.includes(option))) {
      return invalid(code, `Invalid value for ${field.name}`);
    }
    if (field.inputType === "number" && value !== null) {
      if (typeof value !== "number") return invalid(code, `Invalid number for ${field.name}`);
      if ((field.min !== null && value < field.min) || (field.max !== null && value > field.max)) {
        return invalid(code, `Value for ${field.name} is outside the allowed range`);
      }
      if (field.decimalPlaces !== null && Number(value.toFixed(field.decimalPlaces)) !== value) {
        return invalid(code, `Value for ${field.name} has too many decimal places`);
      }
    }
    if (field.inputType === "table" && Array.isArray(value) && field.tableConfig) {
      for (let rowIndex = 0; rowIndex < value.length; rowIndex += 1) {
        const row = value[rowIndex];
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        for (const column of field.tableConfig.columns) {
          const cell = row[column.key];
          const options = garmentTableColumnOptions(column, field.tableConfig.rowConfigs[rowIndex]);
          if (column.type === "select" && cell !== null && cell !== undefined && cell !== "" && options.length > 0 && !options.includes(String(cell))) {
            return invalid(code, `Invalid ${column.label} in ${field.name} row ${rowIndex + 1}`);
          }
          if ((column.type === "number" || column.type === "calculated") && cell !== null && cell !== undefined && typeof cell !== "number") {
            return invalid(code, `Invalid number in ${field.name} row ${rowIndex + 1}`);
          }
        }
      }
    }
    values[code] = value;
  }

  for (const field of fields) {
    const value = values[field.code];
    if (field.required && isBlankFieldValue(value)) {
      return invalid(field.code, `${field.name} is required`);
    }
  }
  return { values };
}

export function buildFieldSchemaSnapshot(
  fields: RuntimeGarmentField[],
  submittedValues: Record<string, unknown>,
  printMeasurementsOnJobCard = true
): FieldSchemaSnapshot {
  return {
    version: 1,
    printMeasurementsOnJobCard,
    fields: fields.map((field) => ({
      code: field.code,
      name: field.name,
      fieldType: field.fieldType,
      inputType: field.inputType,
      sectionId: field.sectionId,
      sectionName: field.sectionName,
      sectionDisplayOrder: field.sectionOrder,
      fieldDisplayOrder: field.displayOrder,
      unit: field.unit,
      options: field.options,
      uiMetadata: field.uiMetadata,
      value: field.inputType === "table"
        ? normalizeGarmentTableValue(submittedValues[field.code], field.tableConfig)
        : normalizeGarmentFieldValue(submittedValues[field.code], field.inputType),
    })),
  };
}

export function shouldPrintMeasurementsOnJobCard(
  snapshot: Record<string, unknown> | null | undefined
): boolean {
  return snapshot?.printMeasurementsOnJobCard !== false;
}

export type HistoricalGarmentDisplayField = {
  code: string;
  label: string;
  value: unknown;
  fieldType: RuntimeGarmentField["fieldType"];
  sectionLabel: string | null;
  sectionOrder: number;
  fieldOrder: number;
  unit: string | null;
  options: unknown;
  uiMetadata?: Record<string, unknown>;
};

function hasHistoricalValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  return !Array.isArray(value) || value.length > 0;
}

export function historicalGarmentValueText(value: unknown): string {
  if (Array.isArray(value) && value.some((item) => item && typeof item === "object" && !Array.isArray(item))) {
    return value
      .map((item) => {
        const row = item as Record<string, unknown>;
        return Object.values(row)
          .filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
          .join(" | ");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return value === null || value === undefined ? "" : String(value);
}

function optionTamilLabelsFromMetadata(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const labels = (metadata as { optionLabelsTa?: unknown; optionLabels?: unknown }).optionLabelsTa ??
    (metadata as { optionLabelsTa?: unknown; optionLabels?: unknown }).optionLabels;
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return {};
  return Object.fromEntries(
    Object.entries(labels as Record<string, unknown>).flatMap(([key, value]) => {
      if (typeof value !== "string" || !value.trim()) return [];
      return [[key, value.trim()]];
    })
  );
}

export function historicalGarmentValueTextForPrint(
  value: unknown,
  uiMetadata: unknown,
  language: "en" | "ta"
): string {
  if (language !== "ta") return historicalGarmentValueText(value);
  const labels = optionTamilLabelsFromMetadata(uiMetadata);
  if (Object.keys(labels).length === 0) return historicalGarmentValueText(value);
  if (typeof value === "string") return labels[value] ?? value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => labels[item] ?? item).join(", ");
  }
  return historicalGarmentValueText(value);
}

export function resolveHistoricalGarmentDisplayFields(args: {
  measurements: Record<string, unknown>;
  fieldSchemaSnapshot?: FieldSchemaSnapshot | Record<string, unknown> | null;
  runtimeFields?: RuntimeGarmentField[] | null;
}): HistoricalGarmentDisplayField[] {
  const snapshotFields = args.fieldSchemaSnapshot && typeof args.fieldSchemaSnapshot === "object"
    ? (args.fieldSchemaSnapshot as { fields?: unknown }).fields
    : undefined;
  if (Array.isArray(snapshotFields)) {
    let hasValidSnapshotField = false;
    const validSnapshotFields = snapshotFields.flatMap((rawField) => {
      if (!rawField || typeof rawField !== "object") return [];
      const field = rawField as Partial<FieldSchemaSnapshot["fields"][number]>;
      if (!field.code || !field.name || !field.inputType || !field.fieldType) return [];
      hasValidSnapshotField = true;
      const value = field.value;
      return hasHistoricalValue(value) ? [{
        code: field.code,
        label: field.name,
        value,
        fieldType: field.fieldType,
        sectionLabel: field.sectionName ?? null,
        sectionOrder: field.sectionDisplayOrder ?? Number.MAX_SAFE_INTEGER,
        fieldOrder: field.fieldDisplayOrder ?? Number.MAX_SAFE_INTEGER,
        unit: field.unit ?? null,
        options: field.options ?? [],
        uiMetadata: field.uiMetadata,
      }] : [];
    });
    if (hasValidSnapshotField) {
      return validSnapshotFields.sort((left, right) => left.sectionOrder - right.sectionOrder || left.fieldOrder - right.fieldOrder || left.label.localeCompare(right.label));
    }
  }

  if (args.runtimeFields && args.runtimeFields.length > 0) {
    return args.runtimeFields.flatMap((field) => {
      const value = args.measurements[field.code];
      return hasHistoricalValue(value) ? [{
        code: field.code,
        label: field.name,
        value,
        fieldType: field.fieldType,
        sectionLabel: field.sectionName,
        sectionOrder: field.sectionOrder,
        fieldOrder: field.displayOrder,
        unit: field.unit,
        options: field.options,
        uiMetadata: field.uiMetadata,
      }] : [];
    });
  }

  return Object.entries(args.measurements)
    .filter(([code, value]) => code !== "__measurementNotes" && hasHistoricalValue(value))
    .map(([code, value], index) => ({
      code,
      label: code,
      value,
      fieldType: "measurement" as const,
      sectionLabel: null,
      sectionOrder: 0,
      fieldOrder: index,
      unit: null,
      options: [],
    }));
}
