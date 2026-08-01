import type { CatalogGarmentTypeField, CatalogSection } from "@/lib/catalog";

export type GarmentFieldValue = number | string | string[] | boolean | null;
export type GarmentFieldValues = Record<string, GarmentFieldValue>;

/** Request-local editable values plus historical keys not in the active schema. */
export type GarmentFieldDraft = {
  typedValues: GarmentFieldValues;
  passthroughValues: Record<string, unknown>;
};

export function createGarmentFieldDraft(
  values: Record<string, unknown>,
  knownFields: ReadonlyArray<Pick<RuntimeGarmentField, "code" | "inputType">>
): GarmentFieldDraft {
  const fieldByCode = new Map(knownFields.map((field) => [field.code, field]));
  const typedValues: GarmentFieldValues = {};
  const passthroughValues: Record<string, unknown> = {};
  for (const [code, value] of Object.entries(values)) {
    const field = fieldByCode.get(code);
    if (field) typedValues[code] = normalizeGarmentFieldValue(value, field.inputType);
    else passthroughValues[code] = value;
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
  inputType: "number" | "text" | "textarea" | "select" | "multiselect" | "checkbox";
  sectionId: string | null;
  sectionName: string;
  sectionOrder: number;
  displayOrder: number;
  required: boolean;
  unit: string | null;
  placeholder: string | null;
  options: string[];
  min: number | null;
  max: number | null;
  decimalPlaces: number | null;
  defaultValue: GarmentFieldValue;
};

export function normalizeGarmentFieldValue(value: unknown, inputType: RuntimeGarmentField["inputType"]): GarmentFieldValue {
  if (value === undefined || value === null || value === "") return null;
  if (inputType === "checkbox") return value === true || value === "true";
  if (inputType === "multiselect") return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
      min: assignment.field.minValue,
      max: assignment.field.maxValue,
      decimalPlaces: assignment.field.decimalPlaces,
      defaultValue: normalizeGarmentFieldValue(assignment.defaultValue, assignment.field.inputType),
    }];
  }).sort((left, right) => left.sectionOrder - right.sectionOrder || left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
}

export function mergeQuickAddons(values: GarmentFieldValues): GarmentFieldValues {
  const quick = Array.isArray(values.quick_addon) ? values.quick_addon : [];
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

    const value = normalizeGarmentFieldValue(rawValue, field.inputType);
    if (field.inputType === "select" && value !== null && typeof value === "string" && !field.options.includes(value)) {
      return invalid(code, `Invalid value for ${field.name}`);
    }
    if (field.inputType === "multiselect" && Array.isArray(value) && value.some((option) => !field.options.includes(option))) {
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
      value: normalizeGarmentFieldValue(submittedValues[field.code], field.inputType),
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
};

function hasHistoricalValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  return !Array.isArray(value) || value.length > 0;
}

export function historicalGarmentValueText(value: unknown): string {
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
