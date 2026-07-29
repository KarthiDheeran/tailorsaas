"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { getProductionPrintBundleAction } from "@/app/(shell)/job-cards/actions";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { barcodeSvgDataUri } from "@/lib/barcode-code128";
import { historicalGarmentValueText, resolveHistoricalGarmentDisplayFields } from "@/lib/garment-form-runtime";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";

function SlipBarcode({ slip }: { slip: JobCardStageSlip }) {
  const value = `TS|JOB|${slip.scanToken}`;
  return <div className="production-barcode"><Image src={barcodeSvgDataUri(value, 34)} alt={`Barcode for ${slip.stage} ${slip.slipCode}`} width={230} height={34} unoptimized /><span>{slip.slipCode}</span></div>;
}

function CuttingTicket({ slip }: { slip: JobCardStageSlip }) {
  return <section className="production-ticket production-cutting"><div className="production-stage">CUTTING</div><div className="production-grid"><strong>{slip.orderNumber}</strong><strong>{slip.customerSnapshot?.name ?? "Customer"}</strong><span>{slip.customerSnapshot?.phone ?? ""}</span><span>{slip.garmentType} · Unit {slip.unitNo} · Qty {slip.quantity}</span></div><SlipBarcode slip={slip} /><p className="production-hint">Scan this barcode only after Cutting is completed.</p></section>;
}

function StitchingTicket({ slip }: { slip: JobCardStageSlip }) {
  const fields = resolveHistoricalGarmentDisplayFields({ measurements: slip.measurementsSnapshot ?? {}, fieldSchemaSnapshot: slip.fieldSchemaSnapshot });
  const visible = fields.filter((field) => field.value !== null && field.value !== "" && (!Array.isArray(field.value) || field.value.length > 0));
  return <section className="production-ticket production-stitching"><div className="production-stage">STITCHING</div><div className="production-grid"><strong>{slip.orderNumber}</strong><strong>{slip.customerSnapshot?.name ?? "Customer"}</strong><span>{slip.customerSnapshot?.phone ?? ""}</span><span>{slip.garmentType} · Unit {slip.unitNo} · Qty {slip.quantity}</span></div><div className="production-fields">{visible.length ? visible.map((field) => <div key={field.code}><span>{field.label}{field.unit ? ` (${field.unit})` : ""}</span><strong>{historicalGarmentValueText(field.value)}</strong></div>) : <p>No measurements recorded.</p>}</div><SlipBarcode slip={slip} /><p className="production-hint">Scan this barcode only after Stitching is completed.</p></section>;
}

export default function ProductionPrintBundlePage() {
  const searchParams = useSearchParams();
  const ids = useMemo(() => (searchParams.get("slipIds") ?? "").split(",").filter(Boolean), [searchParams]);
  const [slips, setSlips] = useState<JobCardStageSlip[] | null>(null);
  useEffect(() => { let cancelled = false; getProductionPrintBundleAction(ids).then((result) => !cancelled && setSlips(result)); return () => { cancelled = true; }; }, [ids]);
  return <PrintPageFrame showClose contentClassName="production-print-preview">{slips === null ? <p>Loading production bundle…</p> : <div className="production-bundle">{slips.map((slip) => slip.stage === "Cutting" ? <CuttingTicket key={slip.id} slip={slip} /> : <StitchingTicket key={slip.id} slip={slip} />)}</div>}<style jsx global>{`
    .production-print-preview { max-width: 210mm; padding: 10mm; }
    .production-bundle { font-family: Arial, Helvetica, sans-serif; color: #000; }
    .production-ticket { position: relative; display: grid; grid-template-columns: 1fr 250px; gap: 8px 14px; border: 1px solid #111; border-bottom: 2px dashed #555; padding: 9px 10px 16px; break-inside: avoid; page-break-inside: avoid; }
    .production-ticket + .production-ticket { margin-top: 10px; }
    .production-stage { grid-column: 1 / -1; font-weight: 800; font-size: 13px; letter-spacing: .14em; border-bottom: 1px solid #111; padding-bottom: 4px; }
    .production-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 12px; align-content: start; }
    .production-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px 8px; grid-column: 1 / -1; border-top: 1px solid #aaa; padding-top: 6px; font-size: 11px; }
    .production-fields div { border: 1px solid #777; padding: 3px 5px; min-height: 34px; } .production-fields span { display: block; font-size: 9px; color: #444; } .production-fields strong { font-size: 12px; }
    .production-barcode { grid-column: 2; grid-row: 2; text-align: center; align-self: center; } .production-barcode img { display:block; margin:0 auto; } .production-barcode span { display:block; font-size:10px; font-weight:700; margin-top:2px; }
    .production-hint { grid-column: 1 / -1; margin: 0; font-size: 9px; font-weight: 700; }
    @media print { .production-print-preview { width: auto !important; margin: 0 !important; padding: 4mm !important; } .production-ticket { break-after: auto; page-break-after: auto; } }
  `}</style></PrintPageFrame>;
}
