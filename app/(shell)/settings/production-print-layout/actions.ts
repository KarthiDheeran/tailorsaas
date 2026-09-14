"use server";

import { getServerCallerContext } from "@/lib/auth/require-server-permission";
import { getAllGarmentTypes } from "@/lib/data/catalog-db";
import { getGarmentTypeConfigurations } from "@/lib/data/catalog-fields-db";
import { deleteProductionPrintLayout, getProductionPrintLayouts, saveProductionPrintLayout, setProductionPrintLayoutActive } from "@/lib/data/production-print-layouts-db";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { GARMENT_SECTIONS, isGarmentSection, type CatalogField, type GarmentSection } from "@/lib/catalog";
import { resolveGarmentTableConfig } from "@/lib/garment-form-runtime";
import { isProductionPrintLayout, productionPrintWorkDetailRowCode, PRODUCTION_PRINT_BLANK_SPACE_CODE, PRODUCTION_PRINT_EMPTY_BOX_CODE, type ProductionPrintLayoutDefinition, type ProductionPrintLayoutFieldOption, type ProductionPrintLayoutGarmentOption, type ProductionPrintLayoutRecord } from "@/lib/production-print-layout";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };
export interface ProductionPrintLayoutBootstrap { sections: GarmentSection[]; garments: ProductionPrintLayoutGarmentOption[]; layouts: ProductionPrintLayoutRecord[]; }

const manageError = "Only an Admin or Shop Owner can manage the tenant-wide production print setup.";

async function canManageProductionLayouts(supabase: ReturnType<typeof createServerClient>) {
  const caller = await getServerCallerContext(supabase);
  return !!caller && caller.permissions.includes("settings.manageShop") && caller.permissions.includes("shops.viewAll");
}

function productionLayoutFieldOptions(field: CatalogField): ProductionPrintLayoutFieldOption[] {
  const isWorkDetails = /work[\s_-]*details/i.test(`${field.code} ${field.name}`);
  const table = isWorkDetails && field.inputType === "table" ? resolveGarmentTableConfig(field.uiMetadata) : null;
  if (!table) return [{ code: field.code, name: field.name }];
  return [
    { code: field.code, name: `${field.name} - All` },
    ...Array.from({ length: table.rows }, (_, index) => ({
      code: productionPrintWorkDetailRowCode(field.code, index + 1),
      name: `${field.name} - ${index + 1}`,
    })),
  ];
}

export async function getProductionPrintLayoutBootstrapAction(): Promise<ActionResult<ProductionPrintLayoutBootstrap>> {
  const supabase = createServerClient();
  const caller = await getServerCallerContext(supabase);
  if (!caller || !caller.permissions.includes("settings.view")) return { success: false, error: "You don't have permission to view these settings." };
  const sections = caller.allowedOrderSections.length ? GARMENT_SECTIONS.filter((value) => caller.allowedOrderSections.includes(value)) : [...GARMENT_SECTIONS];
  const visibleGarments = (await getAllGarmentTypes(supabase)).filter((garment) => sections.includes(garment.section));
  const configurations = await getGarmentTypeConfigurations(supabase, visibleGarments.map((garment) => garment.id));
  const byGarment = new Map(configurations.map((configuration) => [configuration.garment.id, configuration]));
  const garments = visibleGarments.map((garment) => ({ id: garment.id, name: garment.name, section: garment.section, fields: (byGarment.get(garment.id)?.fields ?? []).flatMap((item) => item.field?.isActive ? productionLayoutFieldOptions(item.field) : []) }));
  try { return { success: true, data: { sections, garments, layouts: await getProductionPrintLayouts(supabase) } }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not load production print layouts." }; }
}

export async function saveProductionPrintLayoutAction(input: { orderSection: string; garmentTypeId?: string; layout: ProductionPrintLayoutDefinition }): Promise<ActionResult<null>> {
  if (!isGarmentSection(input.orderSection) || !isProductionPrintLayout(input.layout)) return { success: false, error: "Invalid production print layout." };
  const supabase = createServerClient();
  if (!await canManageProductionLayouts(supabase)) return { success: false, error: manageError };
  const garments = await getAllGarmentTypes(supabase);
  const targets = input.garmentTypeId ? garments.filter((garment) => garment.id === input.garmentTypeId && garment.section === input.orderSection) : garments.filter((garment) => garment.section === input.orderSection);
  if (input.garmentTypeId && targets.length !== 1) return { success: false, error: "Selected garment does not belong to this Order Details category." };
  const configurations = await getGarmentTypeConfigurations(supabase, targets.map((garment) => garment.id));
  const validCodes = new Set([PRODUCTION_PRINT_EMPTY_BOX_CODE, PRODUCTION_PRINT_BLANK_SPACE_CODE, "__addons__", ...configurations.flatMap((configuration) => configuration.fields.flatMap((item) => item.field?.isActive ? productionLayoutFieldOptions(item.field).map((field) => field.code) : []))]);
  const unknown = input.layout.cells.flatMap((cell) => cell.fieldCodes).find((code) => !validCodes.has(code));
  if (unknown) return { success: false, error: `Unknown or unavailable field: ${unknown}` };
  const combinedSpacer = input.layout.cells.find((cell) => cell.fieldCodes.length > 1 && cell.fieldCodes.some((code) => code === PRODUCTION_PRINT_EMPTY_BOX_CODE || code === PRODUCTION_PRINT_BLANK_SPACE_CODE));
  if (combinedSpacer) return { success: false, error: "Empty boxes and blank spaces cannot be combined with another value." };
  try { await saveProductionPrintLayout(supabase, input.orderSection, input.garmentTypeId, input.layout); return { success: true, data: null }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not save production print layout." }; }
}

export async function resetProductionPrintLayoutAction(input: { orderSection: string; garmentTypeId?: string }): Promise<ActionResult<null>> {
  if (!isGarmentSection(input.orderSection)) return { success: false, error: "Invalid Order Details category." };
  const supabase = createServerClient();
  if (!await canManageProductionLayouts(supabase)) return { success: false, error: manageError };
  try { await deleteProductionPrintLayout(supabase, input.orderSection, input.garmentTypeId); return { success: true, data: null }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not restore the default layout." }; }
}

export async function setProductionPrintLayoutActiveAction(input: { orderSection: string; garmentTypeId?: string; isActive: boolean }): Promise<ActionResult<null>> {
  if (!isGarmentSection(input.orderSection) || typeof input.isActive !== "boolean") return { success: false, error: "Invalid production print layout status." };
  const supabase = createServerClient();
  if (!await canManageProductionLayouts(supabase)) return { success: false, error: manageError };
  try { await setProductionPrintLayoutActive(supabase, input.orderSection, input.garmentTypeId, input.isActive); return { success: true, data: null }; }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not update the production print layout status." }; }
}
