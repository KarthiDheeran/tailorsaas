import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CatalogField,
  CatalogFieldInput,
  CatalogFieldInputType,
  CatalogGarmentTypeField,
  CatalogFieldType,
  CatalogSection,
  CatalogSectionInput,
  GarmentTypeConfiguration,
  GarmentTypeFieldAssignmentInput,
  GarmentTypeInput,
} from "@/lib/catalog";
import {
  defaultGarmentSectionForName,
  initialShortcutCodeForGarmentName,
  type CatalogGarmentType,
  type GarmentSection,
} from "@/lib/catalog";

const SECTION_COLUMNS = "id, name, display_order, icon, is_active";
const FIELD_COLUMNS = [
  "id",
  "code",
  "name",
  "field_type",
  "default_section_id",
  "input_type",
  "unit",
  "placeholder",
  "options_json",
  "ui_metadata",
  "min_value",
  "max_value",
  "decimal_places",
  "is_required_default",
  "display_order",
  "is_active",
  "is_system",
].join(", ");

type SectionRow = {
  id: string;
  name: string;
  display_order: number;
  icon: string | null;
  is_active: boolean;
};

type FieldRow = {
  id: string;
  code: string;
  name: string;
  field_type: CatalogFieldType;
  default_section_id: string | null;
  input_type: CatalogFieldInputType;
  unit: string | null;
  placeholder: string | null;
  options_json: unknown;
  ui_metadata: unknown;
  min_value: number | null;
  max_value: number | null;
  decimal_places: number | null;
  is_required_default: boolean;
  display_order: number;
  is_active: boolean;
  is_system: boolean;
};

function stringOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((option): option is string => typeof option === "string");
}

function objectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapSection(row: SectionRow): CatalogSection {
  return {
    id: row.id,
    name: row.name,
    displayOrder: Number(row.display_order),
    icon: row.icon,
    isActive: row.is_active,
  };
}

function mapField(row: FieldRow): CatalogField {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    fieldType: row.field_type,
    defaultSectionId: row.default_section_id,
    inputType: row.input_type,
    unit: row.unit,
    placeholder: row.placeholder,
    options: stringOptions(row.options_json),
    uiMetadata: objectMetadata(row.ui_metadata),
    minValue: row.min_value === null ? null : Number(row.min_value),
    maxValue: row.max_value === null ? null : Number(row.max_value),
    decimalPlaces: row.decimal_places === null ? null : Number(row.decimal_places),
    isRequiredDefault: row.is_required_default,
    displayOrder: Number(row.display_order),
    isActive: row.is_active,
    isSystem: row.is_system,
  };
}

function toSectionRow(data: CatalogSectionInput) {
  return {
    name: data.name.trim(),
    display_order: data.displayOrder,
    icon: data.icon?.trim() || null,
    is_active: data.isActive,
  };
}

function toFieldRow(data: CatalogFieldInput) {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    field_type: data.fieldType,
    default_section_id: data.defaultSectionId,
    input_type: data.inputType,
    unit: data.unit?.trim() || null,
    placeholder: data.placeholder?.trim() || null,
    options_json: data.options,
    ui_metadata: data.uiMetadata ?? {},
    min_value: data.minValue,
    max_value: data.maxValue,
    decimal_places: data.decimalPlaces,
    is_required_default: data.isRequiredDefault,
    display_order: data.displayOrder,
    is_active: data.isActive,
  };
}

type GarmentFieldRow = {
  id: string;
  garment_type_id: string;
  field_id: string;
  section_id: string | null;
  display_order: number;
  is_required: boolean;
  default_value: unknown;
  field: FieldRow | null;
  section: SectionRow | null;
};

function mapGarmentField(row: GarmentFieldRow): CatalogGarmentTypeField {
  return {
    id: row.id,
    garmentTypeId: row.garment_type_id,
    fieldId: row.field_id,
    sectionId: row.section_id,
    displayOrder: Number(row.display_order),
    isRequired: row.is_required,
    defaultValue: row.default_value,
    field: row.field ? mapField(row.field) : undefined,
    section: row.section ? mapSection(row.section) : null,
  };
}

const GARMENT_FIELD_SELECT = `
  id, garment_type_id, field_id, section_id, display_order, is_required, default_value,
  field:catalog_fields(${FIELD_COLUMNS}),
  section:catalog_sections(${SECTION_COLUMNS})
`;

const GARMENT_CONFIGURATION_SELECT = `
  id, name, order_section, shortcut_code, base_price, measurement_field_ids, addon_ids, show_order_addons, is_active,
  garment_type_fields(${GARMENT_FIELD_SELECT})
`;

type GarmentConfigurationRow = {
  id: string;
  name: string;
  order_section: GarmentSection | null;
  shortcut_code: number | null;
  base_price: number;
  measurement_field_ids: string[] | null;
  addon_ids: string[] | null;
  show_order_addons?: boolean | null;
  is_active: boolean;
  garment_type_fields: GarmentFieldRow[] | null;
};

function mapConfigurationGarment(row: GarmentConfigurationRow): CatalogGarmentType {
  return {
    id: row.id,
    name: row.name,
    section: row.order_section ?? defaultGarmentSectionForName(row.name),
    shortcutCode: row.shortcut_code ?? initialShortcutCodeForGarmentName(row.name),
    basePrice: Number(row.base_price),
    measurementFieldIds: row.measurement_field_ids ?? [],
    addOnIds: row.addon_ids ?? [],
    showOrderAddOns: row.show_order_addons !== false,
    isActive: row.is_active,
  };
}

export async function getCatalogSections(supabase: SupabaseClient): Promise<CatalogSection[]> {
  const { data, error } = await supabase
    .from("catalog_sections")
    .select(SECTION_COLUMNS)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data as SectionRow[]) ?? []).map(mapSection);
}

export async function getCatalogFields(supabase: SupabaseClient): Promise<CatalogField[]> {
  const { data, error } = await supabase
    .from("catalog_fields")
    .select(FIELD_COLUMNS)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data as unknown as FieldRow[]) ?? []).map(mapField);
}

export async function getCatalogFieldById(
  supabase: SupabaseClient,
  id: string
): Promise<CatalogField | null> {
  const { data, error } = await supabase
    .from("catalog_fields")
    .select(FIELD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapField(data as unknown as FieldRow) : null;
}

export async function createCatalogSection(
  supabase: SupabaseClient,
  input: CatalogSectionInput
): Promise<CatalogSection> {
  const { data, error } = await supabase
    .from("catalog_sections")
    .insert(toSectionRow(input))
    .select(SECTION_COLUMNS)
    .single();
  if (error) throw error;
  return mapSection(data as SectionRow);
}

export async function updateCatalogSection(
  supabase: SupabaseClient,
  id: string,
  input: CatalogSectionInput
): Promise<CatalogSection | null> {
  const { data, error } = await supabase
    .from("catalog_sections")
    .update(toSectionRow(input))
    .eq("id", id)
    .select(SECTION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSection(data as SectionRow) : null;
}

export async function createCatalogField(
  supabase: SupabaseClient,
  input: CatalogFieldInput
): Promise<CatalogField> {
  const { data, error } = await supabase
    .from("catalog_fields")
    .insert({ ...toFieldRow(input), is_system: false })
    .select(FIELD_COLUMNS)
    .single();
  if (error) throw error;
  return mapField(data as unknown as FieldRow);
}

export async function updateCatalogField(
  supabase: SupabaseClient,
  id: string,
  input: CatalogFieldInput
): Promise<CatalogField | null> {
  const { data, error } = await supabase
    .from("catalog_fields")
    .update(toFieldRow(input))
    .eq("id", id)
    .select(FIELD_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapField(data as unknown as FieldRow) : null;
}

export async function setCatalogFieldActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<CatalogField | null> {
  const { data, error } = await supabase
    .from("catalog_fields")
    .update({ is_active: isActive })
    .eq("id", id)
    .select(FIELD_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapField(data as unknown as FieldRow) : null;
}

/** One joined query for a garment's field configuration; never query per field. */
export async function getGarmentTypeConfiguration(
  supabase: SupabaseClient,
  garmentTypeId: string
): Promise<GarmentTypeConfiguration | null> {
  const { data, error } = await supabase
    .from("catalog_garment_types")
    .select(GARMENT_CONFIGURATION_SELECT)
    .eq("id", garmentTypeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as GarmentConfigurationRow;

  return {
    garment: mapConfigurationGarment(row),
    fields: (row.garment_type_fields ?? []).map(mapGarmentField).sort(
      (left, right) => left.displayOrder - right.displayOrder
    ),
  };
}

export async function getGarmentTypeConfigurations(
  supabase: SupabaseClient,
  garmentTypeIds: string[]
): Promise<GarmentTypeConfiguration[]> {
  const ids = Array.from(new Set(garmentTypeIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("catalog_garment_types")
    .select(GARMENT_CONFIGURATION_SELECT)
    .in("id", ids);
  if (error) throw error;
  return ((data as unknown as GarmentConfigurationRow[]) ?? []).map((row) => ({
    garment: mapConfigurationGarment(row),
    fields: (row.garment_type_fields ?? []).map(mapGarmentField),
  }));
}

export async function saveGarmentTypeConfiguration(
  supabase: SupabaseClient,
  garmentId: string | null,
  garment: GarmentTypeInput,
  assignments: GarmentTypeFieldAssignmentInput[],
  legacyMeasurementFieldIds: string[]
): Promise<string> {
  const { data, error } = await supabase.rpc("save_garment_type_configuration", {
    p_garment_type_id: garmentId,
    p_name: garment.name.trim(),
    p_order_section: garment.section,
    p_shortcut_code: garment.shortcutCode,
    p_base_price: garment.basePrice,
    p_addon_ids: garment.addOnIds,
    p_show_order_addons: garment.showOrderAddOns,
    p_is_active: garment.isActive,
    p_legacy_measurement_field_ids: legacyMeasurementFieldIds,
    p_field_assignments: assignments.map((assignment) => ({
      fieldId: assignment.fieldId,
      sectionId: assignment.sectionId,
      displayOrder: assignment.displayOrder,
      isRequired: assignment.isRequired,
      defaultValue: assignment.defaultValue ?? null,
    })),
  });
  if (error) throw error;
  return data as string;
}
