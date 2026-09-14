import type { GarmentSection } from "@/lib/catalog";

export const PRODUCTION_PRINT_COLUMN_OPTIONS = [4, 5, 6, 7, 8] as const;
export const PRODUCTION_PRINT_EMPTY_BOX_CODE = "__empty_box__";
export const PRODUCTION_PRINT_BLANK_SPACE_CODE = "__blank_space__";
export const PRODUCTION_PRINT_WORK_DETAIL_ROW_PREFIX = "__work_detail_row__:";
export const PRODUCTION_PRINT_SPACER_CODES = [PRODUCTION_PRINT_EMPTY_BOX_CODE, PRODUCTION_PRINT_BLANK_SPACE_CODE] as const;
export type ProductionPrintColumns = (typeof PRODUCTION_PRINT_COLUMN_OPTIONS)[number];
export type ProductionPrintCellHeight = "normal" | "tall";
export type ProductionPrintCellTextSize = "normal" | "small";
export type ProductionPrintCellSeparator = "new-line" | "slash";
export type ProductionPrintCellStyle = "normal" | "emphasis" | "double-border" | "shaded" | "dashed";
export type ProductionPrintCellContentColumns = 1 | 2 | 3;

export interface ProductionPrintLayoutCell {
  id: string;
  fieldCodes: string[];
  columnSpan: number;
  height: ProductionPrintCellHeight;
  textSize: ProductionPrintCellTextSize;
  separator: ProductionPrintCellSeparator;
  style?: ProductionPrintCellStyle;
  contentColumns?: ProductionPrintCellContentColumns;
}

export interface ProductionPrintLayoutDefinition {
  columnsPerRow: ProductionPrintColumns;
  cells: ProductionPrintLayoutCell[];
}

export interface ProductionPrintLayoutRecord extends ProductionPrintLayoutDefinition {
  id: string;
  orderSection: GarmentSection;
  garmentTypeId?: string;
  isActive: boolean;
  updatedAt: string;
}

export interface ProductionPrintLayoutFieldOption {
  code: string;
  name: string;
}

export interface ProductionPrintLayoutGarmentOption {
  id: string;
  name: string;
  section: GarmentSection;
  fields: ProductionPrintLayoutFieldOption[];
}

export const DEFAULT_PRODUCTION_PRINT_COLUMNS: ProductionPrintColumns = 6;

export function isProductionPrintSpacerCode(code: string) {
  return PRODUCTION_PRINT_SPACER_CODES.some((value) => value === code);
}

export function productionPrintWorkDetailRowCode(fieldCode: string, rowNumber: number) {
  return `${PRODUCTION_PRINT_WORK_DETAIL_ROW_PREFIX}${fieldCode}:${rowNumber}`;
}

export function parseProductionPrintWorkDetailRowCode(code: string) {
  if (!code.startsWith(PRODUCTION_PRINT_WORK_DETAIL_ROW_PREFIX)) return null;
  const value = code.slice(PRODUCTION_PRINT_WORK_DETAIL_ROW_PREFIX.length);
  const separator = value.lastIndexOf(":");
  if (separator <= 0) return null;
  const fieldCode = value.slice(0, separator);
  const rowNumber = Number(value.slice(separator + 1));
  if (!fieldCode || !Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 50) return null;
  return { fieldCode, rowNumber };
}

export function productionPrintWorkDetailRows(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return "";
    const record = row as Record<string, unknown>;
    const itemTa = typeof record.itemTa === "string" ? record.itemTa.trim() : "";
    const item = itemTa || (typeof record.item === "string" ? record.item.trim() : "");
    if (!item) return "";
    const qty = typeof record.qty === "number" ? record.qty : Number(record.qty);
    return Number.isFinite(qty) && qty > 0 ? `${item} - ${qty}` : item;
  });
}

export function isProductionPrintLayout(value: unknown): value is ProductionPrintLayoutDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const layout = value as Partial<ProductionPrintLayoutDefinition>;
  if (!PRODUCTION_PRINT_COLUMN_OPTIONS.includes(layout.columnsPerRow as ProductionPrintColumns) || !Array.isArray(layout.cells)) return false;
  return layout.cells.length <= 60 && layout.cells.every((cell) => {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) return false;
    const candidate = cell as Partial<ProductionPrintLayoutCell>;
    return typeof candidate.id === "string" && candidate.id.length > 0 &&
      Array.isArray(candidate.fieldCodes) && candidate.fieldCodes.length >= 1 && candidate.fieldCodes.length <= 2 &&
      candidate.fieldCodes.every((code) => typeof code === "string" && code.trim().length > 0) &&
      (candidate.fieldCodes.length === 1 || !candidate.fieldCodes.some((code) => isProductionPrintSpacerCode(code))) &&
      Number.isInteger(candidate.columnSpan) && Number(candidate.columnSpan) >= 1 && Number(candidate.columnSpan) <= layout.columnsPerRow! &&
      (candidate.height === "normal" || candidate.height === "tall") &&
      (candidate.textSize === "normal" || candidate.textSize === "small") &&
      (candidate.style === undefined || candidate.style === "normal" || candidate.style === "emphasis" || candidate.style === "double-border" || candidate.style === "shaded" || candidate.style === "dashed") &&
      (candidate.contentColumns === undefined || candidate.contentColumns === 1 || candidate.contentColumns === 2 || candidate.contentColumns === 3) &&
      (candidate.separator === "new-line" || candidate.separator === "slash");
  });
}

export function normalizeProductionPrintLayout(layout: ProductionPrintLayoutDefinition): ProductionPrintLayoutDefinition {
  return {
    columnsPerRow: layout.columnsPerRow,
    cells: layout.cells.map((cell, index) => ({
      ...cell,
      id: cell.id || `cell-${index + 1}`,
      fieldCodes: Array.from(new Set(cell.fieldCodes.map((code) => code.trim()).filter(Boolean))).slice(0, 2),
      columnSpan: Math.max(1, Math.min(layout.columnsPerRow, Math.trunc(cell.columnSpan))),
      style: cell.style ?? "normal",
      contentColumns: cell.contentColumns,
    })).filter((cell) => cell.fieldCodes.length > 0),
  };
}
