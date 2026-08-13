"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { getProductionPrintBundleAction } from "@/app/(shell)/job-cards/actions";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { barcodeSvgDataUri, barcodeSvgMetrics, toBarcodeValue } from "@/lib/barcode-code128";
import {
  historicalGarmentValueText,
  resolveHistoricalGarmentDisplayFields,
  shouldPrintMeasurementsOnJobCard,
} from "@/lib/garment-form-runtime";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";

const MEASUREMENT_NOTES_KEY = "__measurementNotes";
const PRODUCTION_BARCODE_OPTIONS = {
  height: 30,
  moduleWidth: 1.25,
  quietZoneModules: 10,
};

function formatSlipDate(value: string | undefined) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function tableWorkDetailLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const item = typeof record.item === "string" ? record.item.trim() : "";
    if (!item) return [];
    const qty = typeof record.qty === "number" ? record.qty : Number(record.qty);
    if (!Number.isFinite(qty) || qty <= 0) return [item];
    return [`${item} - ${qty}`];
  });
}

function productionFieldText(value: unknown) {
  const tableLines = tableWorkDetailLines(value);
  if (tableLines.length > 0) return tableLines.join("\n");
  return historicalGarmentValueText(value);
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
      <div className="production-stage">CUTTING</div>

      <div className="production-grid">
        <strong>{slip.orderNumber}</strong>
        <strong>{slip.customerSnapshot?.name ?? "Customer"}</strong>
        <span>{slip.customerSnapshot?.phone ?? ""}</span>
        <span>Delivery: {formatSlipDate(slip.deliveryDate)}</span>
        <span>
          {slip.garmentType} · Qty {slip.quantity}
        </span>
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
  const measurementNotesValue = slip.measurementsSnapshot?.[MEASUREMENT_NOTES_KEY];
  const measurementNotes =
    typeof measurementNotesValue === "string" ? measurementNotesValue.trim() : "";

  return (
    <section className="production-ticket production-stitching">
      <div className="production-stage">STITCHING</div>

      <div className="production-grid">
        <strong>{slip.orderNumber}</strong>
        <strong>{slip.customerSnapshot?.name ?? "Customer"}</strong>
        <span>{slip.customerSnapshot?.phone ?? ""}</span>
        <span>Delivery: {formatSlipDate(slip.deliveryDate)}</span>
        <span>
          {slip.garmentType} · Qty {slip.quantity}
        </span>
      </div>

      <div className="production-fields">
        {visible.length ? (
          visible.map((field) => (
            <div key={field.code} title={field.label} aria-label={field.label}>
              <strong>{productionFieldText(field.value)}</strong>
            </div>
          ))
        ) : (
          <p>No measurements recorded.</p>
        )}
      </div>

      {measurementNotes && (
        <p className="production-measurement-notes">Note: {measurementNotes}</p>
      )}

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
      contentClassName="production-print-preview"
    >
      {slips === null ? (
        <p>Loading production bundle…</p>
      ) : (
        <div className="production-bundle">
          {slips.map((slip) =>
            slip.stage === "Cutting" ? (
              <CuttingTicket key={slip.id} slip={slip} />
            ) : (
              <StitchingTicket key={slip.id} slip={slip} />
            ),
          )}
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

        .production-ticket {
          position: relative;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 4px 8px;
          border: 1px solid #111;
          border-bottom: 2px dashed #555;
          padding: 5px 7px 7px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .production-ticket + .production-ticket {
          margin-top: 5px;
        }

        .production-stage {
          grid-column: 1 / -1;
          font-weight: 800;
          font-size: 12px;
          letter-spacing: 0.14em;
          border-bottom: 1px solid #111;
          padding-bottom: 2px;
        }

        .production-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2px 8px;
          font-size: 10px;
          align-content: start;
        }

        .production-fields {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 3px 4px;
          grid-column: 1 / -1;
          border-top: 1px solid #aaa;
          padding-top: 4px;
          font-size: 10px;
        }

        .production-fields div {
          border: 1px solid #777;
          display: flex;
          min-height: 23px;
          align-items: center;
          justify-content: center;
          padding: 2px 4px;
          text-align: center;
        }

        .production-fields strong {
          font-size: 11px;
          line-height: 1.18;
          white-space: pre-line;
        }

        .production-measurement-notes {
          grid-column: 1 / -1;
          margin: 0;
          border: 1px solid #777;
          padding: 3px 5px;
          font-size: 10px;
          font-weight: 700;
          white-space: pre-wrap;
        }

        .production-barcode {
          grid-column: 2;
          grid-row: 2;
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
          font-size: 11px;
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
