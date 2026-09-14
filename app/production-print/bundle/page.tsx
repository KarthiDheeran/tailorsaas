"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { getProductionPrintBundleAction } from "@/app/(shell)/job-cards/actions";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { barcodeSvgDataUri, barcodeSvgMetrics, toBarcodeValue } from "@/lib/barcode-code128";
import {
  type HistoricalGarmentDisplayField,
  historicalGarmentValueTextForPrint,
  resolveHistoricalGarmentDisplayFields,
  shouldPrintMeasurementsOnJobCard,
} from "@/lib/garment-form-runtime";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";
import type { OrderItemAddOn } from "@/lib/types";
import { parseProductionPrintWorkDetailRowCode, productionPrintWorkDetailRows, PRODUCTION_PRINT_BLANK_SPACE_CODE, PRODUCTION_PRINT_EMPTY_BOX_CODE, type ProductionPrintLayoutCell, type ProductionPrintLayoutDefinition } from "@/lib/production-print-layout";

const PRODUCTION_BARCODE_OPTIONS = {
  height: 30,
  moduleWidth: 1.25,
  quietZoneModules: 10,
};

function formatSlipDate(value: string | undefined) {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function orderHeading(slip: JobCardStageSlip) {
  const number = slip.orderNumber.replace(/^ord(?:er)?[\s-]*/i, "");
  const stage = slip.stage === "Cutting" ? "Cutting" : "Stitching";
  return `${stage} - Ord ${number}`;
}

function tableWorkDetailLines(value: unknown): string[] {
  return productionPrintWorkDetailRows(value).filter(Boolean);
}

function productionFieldText(value: unknown, uiMetadata?: Record<string, unknown>) {
  const tableLines = tableWorkDetailLines(value);
  if (tableLines.length > 0) return tableLines.join("\n");
  return historicalGarmentValueTextForPrint(value, uiMetadata, "ta");
}

type ProductionValueCell =
  | { kind: "field"; field: HistoricalGarmentDisplayField }
  | { kind: "text"; key: string; label: string; value: string };

type RenderedProductionCell = {
  key: string;
  label: string;
  text: string;
  columnSpan: number;
  height: "normal" | "tall";
  textSize: "normal" | "small";
  style: NonNullable<ProductionPrintLayoutCell["style"]>;
  blankSpace: boolean;
  contentColumns: 1 | 2 | 3;
  items: string[];
  collection: boolean;
};

function normalizedProductionKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function productionFieldKeys(field: HistoricalGarmentDisplayField) {
  const metadata = field.uiMetadata ?? {};
  const shortCode = typeof metadata.shortCode === "string" ? metadata.shortCode : "";
  const legacyCode = typeof metadata.legacyCode === "string" ? metadata.legacyCode : "";

  return [
    field.code,
    field.label,
    shortCode,
    legacyCode,
  ]
    .filter((value) => value.trim())
    .map(normalizedProductionKey);
}

function takeFieldByKey(
  fields: HistoricalGarmentDisplayField[],
  acceptedKeys: string[],
) {
  const matchIndex = fields.findIndex((field) => {
    const keys = productionFieldKeys(field);
    return acceptedKeys.some((key) => keys.includes(normalizedProductionKey(key)));
  });
  if (matchIndex === -1) return null;
  const [field] = fields.splice(matchIndex, 1);
  return field;
}

function productionAddOnCells(addOns: OrderItemAddOn[] | undefined): ProductionValueCell[] {
  return (addOns ?? []).flatMap((addOn) => {
    const label = (addOn.labelTa ?? addOn.label ?? "").trim();
    if (!label) return [];
    const qty = Number(addOn.qty ?? 1);
    const value = Number.isFinite(qty) && qty > 1 ? `${label} ${qty}` : label;
    return [{
      kind: "text" as const,
      key: `addon:${addOn.key}`,
      label,
      value,
    }];
  });
}

function fieldCell(field: HistoricalGarmentDisplayField | null): ProductionValueCell | null {
  return field ? { kind: "field", field } : null;
}

function buildProductionValueCells(
  fields: HistoricalGarmentDisplayField[],
  addOns: OrderItemAddOn[] | undefined,
) {
  const bodyFields = fields.filter((field) => field.fieldType === "measurement");
  const bodyFieldSet = new Set(bodyFields);
  const nonBodyFields = fields.filter((field) => !bodyFieldSet.has(field));
  const measurements = bodyFields.map(fieldCell);

  const r1 = fieldCell(takeFieldByKey(nonBodyFields, ["r1", "shirtr1"]));
  const r2 = fieldCell(takeFieldByKey(nonBodyFields, ["r2", "shirtr2"]));
  const r3 = fieldCell(takeFieldByKey(nonBodyFields, ["r3", "shirtr3"]));
  const r4 = fieldCell(takeFieldByKey(nonBodyFields, ["r4", "shirtr4"]));
  const extras = [
    ...productionAddOnCells(addOns),
    ...nonBodyFields.map(fieldCell),
  ].filter((cell): cell is ProductionValueCell => cell !== null);

  const rows: Array<Array<ProductionValueCell | null>> = [
    [...measurements.slice(0, 5), r1],
    [...measurements.slice(5, 10), r2],
    [r3, r4, ...extras.slice(0, 4)],
  ];
  const remainder = [
    ...measurements.slice(10),
    ...extras.slice(4),
  ].filter((cell): cell is ProductionValueCell => cell !== null);

  for (let index = 0; index < remainder.length; index += 6) {
    rows.push(remainder.slice(index, index + 6));
  }

  return rows.flatMap((row) => {
    const padded = [...row];
    while (padded.length < 6) padded.push(null);
    return padded.slice(0, 6);
  });
}

function productionValueCellText(cell: ProductionValueCell) {
  if (cell.kind === "text") return cell.value;
  return productionFieldText(cell.field.value, cell.field.uiMetadata);
}

function configuredProductionCells(
  layout: ProductionPrintLayoutDefinition,
  fields: HistoricalGarmentDisplayField[],
  addOns: OrderItemAddOn[] | undefined,
): RenderedProductionCell[] {
  const fieldsByCode = new Map(fields.map((field) => [normalizedProductionKey(field.code), field]));
  const addOnCells = productionAddOnCells(addOns).filter(
    (cell): cell is Extract<ProductionValueCell, { kind: "text" }> => cell.kind === "text",
  );
  return layout.cells.flatMap((cell: ProductionPrintLayoutCell) => {
    const values = cell.fieldCodes.flatMap((code) => {
      if (code === PRODUCTION_PRINT_EMPTY_BOX_CODE) return [{ label: "Empty box", text: "" }];
      if (code === PRODUCTION_PRINT_BLANK_SPACE_CODE) return [{ label: "Blank space", text: "" }];
      if (code === "__addons__") return addOnCells.map((addOn) => ({ label: addOn.label, text: addOn.value }));
      const workDetailRow = parseProductionPrintWorkDetailRowCode(code);
      const fieldCode = workDetailRow?.fieldCode ?? code;
      const field = fieldsByCode.get(normalizedProductionKey(fieldCode));
      if (!field) return [];
      if (workDetailRow) {
        const text = productionPrintWorkDetailRows(field.value)[workDetailRow.rowNumber - 1];
        return text ? [{ label: `${field.label} ${workDetailRow.rowNumber}`, text }] : [];
      }
      const detailLines = tableWorkDetailLines(field.value);
      return detailLines.length > 0
        ? detailLines.map((text) => ({ label: field.label, text }))
        : [{ label: field.label, text: productionFieldText(field.value, field.uiMetadata) }];
    });
    if (values.length === 0 && cell.fieldCodes.some((code) => parseProductionPrintWorkDetailRowCode(code))) return [];
    const collection = values.length > cell.fieldCodes.length;
    const legacyCollection = collection && cell.contentColumns === undefined;
    return [{
      key: cell.id,
      label: collection ? (values[0]?.label ?? cell.fieldCodes.join(" / ")) : values.map((value) => value.label).join(" / ") || cell.fieldCodes.join(" / "),
      text: values.map((value) => value.text).join(cell.separator === "slash" ? " / " : "\n"),
      columnSpan: legacyCollection ? layout.columnsPerRow : cell.columnSpan,
      height: cell.height,
      textSize: cell.textSize,
      style: cell.style ?? "normal",
      blankSpace: cell.fieldCodes.length === 1 && cell.fieldCodes[0] === PRODUCTION_PRINT_BLANK_SPACE_CODE,
      contentColumns: cell.contentColumns ?? (collection ? 3 : 1),
      items: values.map((value) => value.text),
      collection,
    }];
  });
}

function SlipBarcode({ slip }: { slip: JobCardStageSlip }) {
  const value = toBarcodeValue(slip.slipCode);
  const metrics = barcodeSvgMetrics(value, PRODUCTION_BARCODE_OPTIONS);

  return (
    <div className="production-barcode">
      <Image
        src={barcodeSvgDataUri(value, PRODUCTION_BARCODE_OPTIONS)}
        alt={`Barcode for ${slip.stage} ${slip.slipCode}`}
        width={metrics.width}
        height={metrics.height}
        unoptimized
      />
      <span title={slip.slipCode}>{value}</span>
    </div>
  );
}

function CuttingTicket({ slip }: { slip: JobCardStageSlip }) {
  return (
    <section className="production-ticket production-cutting">
      <div className="production-grid">
        <strong className="production-order-heading">{orderHeading(slip)}</strong>
        <strong>{slip.customerSnapshot?.name ?? "Customer"}</strong>
        <span>{slip.customerSnapshot?.phone ?? ""}</span>
        <span>Delivery: {formatSlipDate(slip.deliveryDate)}</span>
        <strong>{slip.garmentType} - {slip.quantity}</strong>
      </div>

      <SlipBarcode slip={slip} />

    </section>
  );
}

function StitchingTicket({ slip }: { slip: JobCardStageSlip }) {
  const fields = resolveHistoricalGarmentDisplayFields({
    measurements: slip.measurementsSnapshot ?? {},
    fieldSchemaSnapshot: slip.fieldSchemaSnapshot,
  });

  const visible = fields.filter(
    (field) =>
      (shouldPrintMeasurementsOnJobCard(slip.fieldSchemaSnapshot) || field.fieldType !== "measurement") &&
      field.value !== null &&
      field.value !== "" &&
      (!Array.isArray(field.value) || field.value.length > 0),
  );
  const configuredLayout = slip.productionLayoutSnapshot;
  const configuredCells = configuredLayout
    ? configuredProductionCells(configuredLayout, visible, slip.addOnsSnapshot)
    : null;
  return (
    <section className="production-ticket production-stitching">
      <div className="production-grid">
        <strong className="production-order-heading">{orderHeading(slip)}</strong>
        <strong>{slip.customerSnapshot?.name ?? "Customer"}</strong>
        <span>{slip.customerSnapshot?.phone ?? ""}</span>
        <span>Delivery: {formatSlipDate(slip.deliveryDate)}</span>
        <strong>{slip.garmentType} - {slip.quantity}</strong>
      </div>

      <div
        className={`production-fields ${configuredLayout ? "production-configured-value-grid" : "production-fixed-value-grid"}`}
        style={configuredLayout ? { gridTemplateColumns: `repeat(${configuredLayout.columnsPerRow}, minmax(0, 1fr))` } : undefined}
      >
        {configuredLayout ? configuredCells!.map((cell) => (
          <div
            key={cell.key}
            title={cell.label}
            aria-label={cell.label}
            className={`${cell.height === "tall" ? "production-cell-tall" : ""} ${cell.textSize === "small" ? "production-cell-small" : ""} ${cell.collection ? "production-cell-collection" : ""} ${cell.blankSpace ? "production-cell-blank-space" : `production-cell-style-${cell.style}`}`}
            style={{ gridColumn: `span ${cell.columnSpan} / span ${cell.columnSpan}` }}
          >
            {cell.collection && <small className="production-cell-heading">{cell.label}</small>}
            <strong
              className={cell.collection ? "production-cell-items" : undefined}
              style={cell.collection ? { gridTemplateColumns: `repeat(${cell.contentColumns}, minmax(0, 1fr))` } : undefined}
            >
              {cell.collection ? cell.items.map((item, index) => <span key={`${cell.key}-${index}`}>{item}</span>) : cell.text}
            </strong>
          </div>
        )) : visible.length ? (
          buildProductionValueCells(visible, slip.addOnsSnapshot).map((cell, index) => (
            <div
              key={cell ? `${cell.kind}-${cell.kind === "field" ? cell.field.code : cell.key}-${index}` : `empty-${index}`}
              title={cell ? (cell.kind === "field" ? cell.field.label : cell.label) : ""}
              aria-label={cell ? (cell.kind === "field" ? cell.field.label : cell.label) : "Empty production value position"}
            >
              {cell && <strong>{productionValueCellText(cell)}</strong>}
            </div>
          ))
        ) : (
          <p>No measurements recorded.</p>
        )}
      </div>

      <SlipBarcode slip={slip} />

    </section>
  );
}

function ProductionPrintBundleContent() {
  const searchParams = useSearchParams();

  const ids = useMemo(
    () =>
      (searchParams.get("slipIds") ?? "")
        .split(",")
        .filter(Boolean),
    [searchParams],
  );

  const [slips, setSlips] = useState<JobCardStageSlip[] | null>(null);

  const printSets = useMemo(() => {
    const sets = new Map<string, JobCardStageSlip[]>();
    for (const slip of slips ?? []) {
      const key = `${slip.orderId}:${slip.orderItemSerialNo}:${slip.unitNo}:${slip.quantity}`;
      const current = sets.get(key) ?? [];
      current.push(slip);
      sets.set(key, current);
    }
    return Array.from(sets.values());
  }, [slips]);

  useEffect(() => {
    let cancelled = false;

    getProductionPrintBundleAction(ids).then((result) => {
      if (!cancelled) {
        setSlips(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ids]);

  return (
    <PrintPageFrame
      showClose
      printOnEnter
      contentClassName="production-print-preview"
    >
      {slips === null ? (
        <p>Loading production bundle…</p>
      ) : (
        <div className="production-bundle">
          {printSets.map((set) => (
            <div className="production-set" key={set.map((slip) => slip.id).join(":")}>
              {set.map((slip) =>
                slip.stage === "Cutting" ? (
                  <CuttingTicket key={slip.id} slip={slip} />
                ) : (
                  <StitchingTicket key={slip.id} slip={slip} />
                ),
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        .production-print-preview {
          max-width: 210mm;
          padding: 10mm;
        }

        .production-bundle {
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
        }

        .production-set {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .production-set + .production-set {
          margin-top: 8px;
        }

        .production-ticket {
          position: relative;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 6px 10px;
          border: 1px solid #111;
          border-bottom: 2px dashed #555;
          padding: 8px 10px 10px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .production-set .production-ticket + .production-ticket {
          margin-top: 7px;
        }

        .production-order-heading {
          font-size: 17px;
          font-weight: 900;
        }

        .production-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 10px;
          font-size: 14px;
          line-height: 1.25;
          align-content: start;
        }

        .production-fields {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 3px 4px;
          grid-column: 1 / -1;
          border-top: 1px solid #aaa;
          padding-top: 4px;
          font-size: 16px;
        }

        .production-fixed-value-grid {
          grid-template-rows: repeat(3, minmax(36px, auto));
        }

        .production-fields div {
          border: 1px solid #777;
          display: flex;
          min-height: 36px;
          align-items: center;
          justify-content: center;
          padding: 5px 6px;
          text-align: center;
          min-width: 0;
          overflow: hidden;
        }

        .production-fields strong {
          font-size: 17px;
          line-height: 1.25;
          white-space: pre-line;
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .production-fields .production-cell-heading {
          display: block;
          width: 100%;
          margin-bottom: 3px;
          border-bottom: 1px solid #999;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .production-fields .production-cell-collection {
          flex-direction: column;
          align-items: stretch;
        }

        .production-fields .production-cell-items {
          display: grid;
          width: 100%;
          align-items: stretch;
          white-space: normal;
        }

        .production-fields .production-cell-items span {
          display: flex;
          min-width: 0;
          align-items: center;
          justify-content: center;
          padding: 3px 4px;
          border-bottom: 1px dotted #aaa;
          overflow-wrap: anywhere;
        }

        .production-fields .production-cell-tall {
          min-height: 54px;
        }

        .production-fields .production-cell-small strong {
          font-size: 14px;
        }

        .production-fields .production-cell-style-emphasis {
          border: 3px solid #111;
        }

        .production-fields .production-cell-style-emphasis strong,
        .production-fields .production-cell-style-shaded strong {
          font-weight: 900;
        }

        .production-fields .production-cell-style-double-border {
          border: 4px double #111;
        }

        .production-fields .production-cell-style-shaded {
          background: #e5e7eb;
          border-color: #111;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .production-fields .production-cell-style-dashed {
          border: 2px dashed #111;
        }

        .production-fields .production-cell-blank-space {
          border-color: transparent;
          background: transparent;
        }

        .production-barcode {
          grid-column: 2;
          grid-row: 1;
          text-align: center;
          align-self: center;
          justify-self: end;
          padding: 0 1.5mm;
          background: #fff;
          overflow: visible;
          flex-shrink: 0;
        }

        .production-barcode img {
          display: block;
          margin: 0 auto;
          width: auto;
          height: auto;
          max-width: none;
          object-fit: contain;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .production-barcode span {
          display: block;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.1;
          margin-top: 1px;
        }

        .production-hint {
          grid-column: 1 / -1;
          margin: 0;
          font-size: 9px;
          font-weight: 700;
        }

        @media print {
          .production-print-preview {
            width: auto !important;
            margin: 0 !important;
            padding: 4mm !important;
          }

          .production-ticket {
            break-after: auto;
            page-break-after: auto;
          }

          .production-set {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </PrintPageFrame>
  );
}

export default function ProductionPrintBundlePage() {
  return (
    <Suspense fallback={<p>Loading production bundle…</p>}>
      <ProductionPrintBundleContent />
    </Suspense>
  );
}
