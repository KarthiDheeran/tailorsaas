import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the read-only metadata audit."
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supportedInputTypes = new Set([
  "number",
  "text",
  "textarea",
  "select",
  "multiselect",
  "checkbox",
]);

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function describeIssue(issue) {
  return `- **${issue.severity.toUpperCase()}** \`${issue.code}\` — ${issue.message}`;
}

async function selectAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

const [garments, mappings, fields, sections] = await Promise.all([
  selectAll("catalog_garment_types", "id, name, is_active, measurement_field_ids"),
  selectAll(
    "garment_type_fields",
    "id, garment_type_id, field_id, section_id, display_order, is_required, default_value"
  ),
  selectAll(
    "catalog_fields",
    "id, code, name, field_type, input_type, options_json, min_value, max_value, decimal_places, is_active"
  ),
  selectAll("catalog_sections", "id, name, display_order, is_active"),
]);

const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
const fieldById = new Map(fields.map((field) => [field.id, field]));
const sectionById = new Map(sections.map((section) => [section.id, section]));
const mappingsByGarment = new Map();
for (const mapping of mappings) {
  const group = mappingsByGarment.get(mapping.garment_type_id) ?? [];
  group.push(mapping);
  mappingsByGarment.set(mapping.garment_type_id, group);
}

const orphanMappings = mappings
  .filter(
    (mapping) =>
      !garmentById.has(mapping.garment_type_id) ||
      !fieldById.has(mapping.field_id) ||
      (mapping.section_id && !sectionById.has(mapping.section_id))
  )
  .map((mapping) => ({
    mappingId: mapping.id,
    garmentTypeId: mapping.garment_type_id,
    fieldId: mapping.field_id,
    sectionId: mapping.section_id,
    reason: !garmentById.has(mapping.garment_type_id)
      ? "orphaned garment reference"
      : !fieldById.has(mapping.field_id)
        ? "orphaned field reference"
        : "orphaned section reference",
  }));

const activeGarments = garments.filter((garment) => garment.is_active);
const garmentReports = activeGarments
  .map((garment) => {
    const garmentMappings = mappingsByGarment.get(garment.id) ?? [];
    const legacyCodes = asArray(garment.measurement_field_ids).filter(isNonBlankString);
    const issues = [];
    const duplicateMapKeys = new Set();
    const duplicateFieldCodes = new Set();
    const duplicateSortKeys = new Set();
    const activeCodes = new Set();

    for (const mapping of garmentMappings) {
      const mapKey = mapping.field_id;
      if (duplicateMapKeys.has(mapKey)) {
        issues.push({ severity: "error", code: "duplicate_field_mapping", message: `Field ${mapping.field_id} is mapped more than once.` });
      }
      duplicateMapKeys.add(mapKey);

      const field = fieldById.get(mapping.field_id);
      const section = mapping.section_id ? sectionById.get(mapping.section_id) : null;
      const sortKey = `${mapping.section_id ?? "none"}:${mapping.display_order}`;
      if (duplicateSortKeys.has(sortKey)) {
        issues.push({ severity: "warning", code: "duplicate_sort_order", message: `Duplicate display order ${mapping.display_order} in section ${mapping.section_id ?? "none"}.` });
      }
      duplicateSortKeys.add(sortKey);

      if (!field) {
        issues.push({ severity: "error", code: "orphaned_field", message: `Mapped field ${mapping.field_id} does not exist.` });
        continue;
      }
      if (!isNonBlankString(field.code)) {
        issues.push({ severity: "error", code: "missing_field_code", message: `Mapped field ${field.id} has no usable code.` });
      } else {
        const normalizedCode = field.code.trim().toLowerCase();
        if (duplicateFieldCodes.has(normalizedCode)) {
          issues.push({ severity: "error", code: "duplicate_field_code", message: `Field code ${field.code} is mapped more than once.` });
        }
        duplicateFieldCodes.add(normalizedCode);
      }
      if (!field.is_active) {
        issues.push({ severity: "error", code: "inactive_mapped_field", message: `${field.code || field.id} is inactive.` });
      }
      if (!supportedInputTypes.has(field.input_type)) {
        issues.push({ severity: "error", code: "unsupported_input_type", message: `${field.code || field.id} uses unsupported input type ${field.input_type}.` });
      }
      const options = asArray(field.options_json);
      const validOptions = options.length > 0 && options.every(isNonBlankString);
      if (["select", "multiselect"].includes(field.input_type) && !validOptions) {
        issues.push({ severity: "error", code: "missing_select_options", message: `${field.code || field.id} requires non-empty selectable options.` });
      }
      const min = field.min_value === null ? null : Number(field.min_value);
      const max = field.max_value === null ? null : Number(field.max_value);
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)) || (min !== null && max !== null && min > max)) {
        issues.push({ severity: "error", code: "invalid_number_range", message: `${field.code || field.id} has an invalid numeric range.` });
      }
      const precision = field.decimal_places === null ? null : Number(field.decimal_places);
      if (precision !== null && (!Number.isInteger(precision) || precision < 0 || precision > 6)) {
        issues.push({ severity: "error", code: "invalid_precision", message: `${field.code || field.id} has invalid decimal precision.` });
      }
      if (!mapping.section_id) {
        issues.push({ severity: "warning", code: "missing_section", message: `${field.code || field.id} has no assigned section.` });
      } else if (!section) {
        issues.push({ severity: "error", code: "orphaned_section", message: `${field.code || field.id} references missing section ${mapping.section_id}.` });
      } else if (!section.is_active) {
        issues.push({ severity: "warning", code: "inactive_section", message: `${field.code || field.id} is assigned to inactive section ${section.name}.` });
      }
      if (mapping.is_required && (!field.is_active || !supportedInputTypes.has(field.input_type) || (["select", "multiselect"].includes(field.input_type) && !validOptions))) {
        issues.push({ severity: "error", code: "required_field_unusable", message: `Required field ${field.code || field.id} cannot render safely.` });
      }
      if (field.is_active && isNonBlankString(field.code)) activeCodes.add(field.code);
    }

    if (garmentMappings.length === 0) {
      issues.push({ severity: "warning", code: "no_mapped_fields", message: "No metadata fields are mapped." });
    }
    const validMetadataCount = [...activeCodes].length;
    const runtimeSource = validMetadataCount > 0 ? "metadata" : legacyCodes.length > 0 ? "legacy_fallback" : "empty";
    const legacyNotMapped = legacyCodes.filter((code) => !activeCodes.has(code));
    if (runtimeSource === "metadata" && legacyNotMapped.length > 0) {
      issues.push({ severity: "warning", code: "legacy_coverage_gap", message: `Metadata does not cover legacy codes: ${legacyNotMapped.join(", ")}.` });
    }

    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    const safeToRemoveLegacyFallback = runtimeSource === "metadata" && errors.length === 0 && warnings.length === 0;
    const readiness = errors.length > 0 || runtimeSource !== "metadata"
      ? "blocked"
      : warnings.length > 0
        ? "warning"
        : "ready";

    return {
      garmentTypeId: garment.id,
      garmentTypeName: garment.name,
      isActive: garment.is_active,
      mappedMetadataFields: garmentMappings.length,
      activeMappedFields: validMetadataCount,
      legacyMeasurementFieldIds: legacyCodes.length,
      runtimeSource,
      migrationReadiness: readiness,
      safeToRemoveLegacyFallback,
      issues,
    };
  })
  .sort((left, right) => left.garmentTypeName.localeCompare(right.garmentTypeName));

const summary = {
  generatedAt: new Date().toISOString(),
  activeGarmentTypes: garmentReports.length,
  ready: garmentReports.filter((report) => report.migrationReadiness === "ready").length,
  warnings: garmentReports.filter((report) => report.migrationReadiness === "warning").length,
  blocked: garmentReports.filter((report) => report.migrationReadiness === "blocked").length,
  manualCleanupRecords: garmentReports.flatMap((report) =>
    report.issues.map((issue) => ({ garmentTypeId: report.garmentTypeId, garmentTypeName: report.garmentTypeName, ...issue }))
  ),
  orphanMappings,
};

const output = { summary, garments: garmentReports };
const reportDirectory = resolve(process.cwd(), "performance-reports");
await mkdir(reportDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(reportDirectory, "garment-metadata-audit.json"), `${JSON.stringify(output, null, 2)}\n`),
  writeFile(
    resolve(reportDirectory, "garment-metadata-audit.csv"),
    [
      ["GarmentTypeId", "GarmentTypeName", "Active", "MappedMetadataFields", "ActiveMappedFields", "LegacyMeasurementFieldIds", "RuntimeSource", "MigrationReadiness", "SafeToRemoveLegacyFallback", "Issues"],
      ...garmentReports.map((report) => [
        report.garmentTypeId,
        report.garmentTypeName,
        report.isActive,
        report.mappedMetadataFields,
        report.activeMappedFields,
        report.legacyMeasurementFieldIds,
        report.runtimeSource,
        report.migrationReadiness,
        report.safeToRemoveLegacyFallback,
        report.issues.map((issue) => `${issue.severity}:${issue.code}`).join("; "),
      ]),
    ].map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
  ),
  writeFile(
    resolve(reportDirectory, "garment-metadata-audit.md"),
    [
      "# Garment Metadata Migration Audit",
      "",
      `Generated: ${summary.generatedAt}`,
      "",
      `Active garment types: **${summary.activeGarmentTypes}** · Ready: **${summary.ready}** · Warning: **${summary.warnings}** · Blocked: **${summary.blocked}**`,
      "",
      "## Garment Types",
      "",
      "| Garment | Mapped | Active mapped | Legacy IDs | Runtime source | Readiness | Legacy fallback removal |",
      "| --- | ---: | ---: | ---: | --- | --- | --- |",
      ...garmentReports.map((report) => `| ${report.garmentTypeName} | ${report.mappedMetadataFields} | ${report.activeMappedFields} | ${report.legacyMeasurementFieldIds} | ${report.runtimeSource} | ${report.migrationReadiness} | ${report.safeToRemoveLegacyFallback ? "safe" : "not safe"} |`),
      "",
      "## Manual Cleanup Required",
      "",
      ...(summary.manualCleanupRecords.length === 0
        ? ["No active garment configuration issues were found."]
        : summary.manualCleanupRecords.map((issue) => `### ${issue.garmentTypeName}\n${describeIssue(issue)}`)),
      "",
      "## Orphaned Mapping Rows",
      "",
      ...(orphanMappings.length === 0
        ? ["No orphaned mapping rows were found."]
        : orphanMappings.map((mapping) => `- \`${mapping.mappingId}\`: ${mapping.reason}`)),
      "",
      "## Deprecation Rule",
      "",
      "Remove legacy fallback only after every active garment type is marked **ready** and its report says legacy fallback removal is **safe**. This audit is read-only and does not modify catalog data.",
      "",
    ].join("\n")
  ),
]);

console.log(
  `Garment metadata audit complete: ${summary.ready} ready, ${summary.warnings} warning, ${summary.blocked} blocked. Reports written to performance-reports/.`
);
