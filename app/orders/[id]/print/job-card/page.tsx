"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createJobCardStageSlipAction,
  getJobCardStageSlipAction,
} from "@/app/(shell)/job-cards/actions";
import { getActiveWorkStagesAction } from "@/app/(shell)/catalog/actions";
import { getOrderByIdAction } from "@/app/(shell)/orders/actions";
import { getStaffAction } from "@/app/(shell)/staff/actions";
import { getPrintableBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { formatDate } from "@/components/orders/orders-table";
import { useLanguage } from "@/components/i18n/language-provider";
import { measurementFieldLabel, measurementFields } from "@/lib/catalog";
import {
  historicalGarmentValueText,
  historicalGarmentValueTextForPrint,
  resolveHistoricalGarmentDisplayFields,
  shouldPrintMeasurementsOnJobCard,
} from "@/lib/garment-form-runtime";
import { barcodeSvgDataUri, barcodeSvgMetrics, toBarcodeValue } from "@/lib/barcode-code128";
import { staffGarmentStageRate } from "@/lib/staff-rates";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";
import type { CatalogWorkStage } from "@/lib/catalog";
import type { Customer, Order, Staff, TaskType } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  measurementFields.map((field) => [field.id, field.label])
);

const TAMIL_STAGE_LABELS: Partial<Record<TaskType, string>> = {
  Measurement: "அளவீடு",
  Cutting: "வெட்டுதல்",
  Stitching: "தையல்",
  Embroidery: "எம்பிராய்டரி",
  Finishing: "முடித்தல்",
  Alteration: "திருத்தம்",
  "Ironing/Packing": "இஸ்திரி/பேக்கிங்",
  Delivery: "டெலிவரி",
};

const TAMIL_MEASUREMENT_LABELS: Record<string, string> = {
  chest: "மார்பு",
  bust: "பஸ்ட்",
  waist: "இடுப்பு",
  hip: "ஹிப்",
  shoulder: "தோள்",
  crossFront: "முன் குறுக்கு",
  crossBack: "பின் குறுக்கு",
  sleeveLength: "கை நீளம்",
  sleeveRound: "கை சுற்று",
  armhole: "ஆர்ம்ஹோல்",
  neck: "கழுத்து",
  collar: "காலர்",
  shirtLength: "சட்டை நீளம்",
  blouseLength: "பிளவுஸ் நீளம்",
  kurtaLength: "குர்தா நீளம்",
  kameezLength: "கமீஸ் நீளம்",
  salwarLength: "சல்வார் நீளம்",
  dressLength: "டிரஸ் நீளம்",
  lehengaLength: "லெஹங்கா நீளம்",
  gownLength: "கவுன் நீளம்",
  coatLength: "கோட் நீளம்",
  waistcoatLength: "வேஸ்ட்கோட் நீளம்",
  sherwaniLength: "ஷெர்வானி நீளம்",
  petticoatLength: "பெட்டிகோட் நீளம்",
  sareeFallLength: "சாரி ஃபால் நீளம்",
  pantLength: "பேண்ட் நீளம்",
  inseam: "இன்சீம்",
  thigh: "தொடை",
  knee: "முழங்கால்",
  bottom: "பாட்டம்",
  rise: "ரைஸ்",
  cuff: "கஃப்",
  neckDepthFront: "முன் கழுத்து ஆழம்",
  neckDepthBack: "பின் கழுத்து ஆழம்",
  neckWidth: "கழுத்து அகலம்",
  dartPoint: "டார்ட் பாயிண்ட்",
  princessCut: "பிரின்சஸ் கட்",
  yokeLength: "யோக் நீளம்",
  slitLength: "ஸ்லிட் நீளம்",
  flare: "ஃப்ளேர்",
  seat: "சீட்",
  calf: "கால்ஃப்",
  fitNotes: "ஃபிட் குறிப்புகள்",
  notes: "குறிப்புகள்",
};

const SLIP_LABELS = {
  en: {
    qty: "Q",
    addOns: "Add-ons",
    assignTo: "Assign to",
    notes: "Notes",
    workerSign: "Worker sign",
    remark: "Remark",
    noMeasurements: "No measurements recorded.",
  },
  ta: {
    qty: "எண்",
    addOns: "கூடுதல்",
    assignTo: "ஒதுக்கீடு",
    notes: "குறிப்பு",
    workerSign: "தொழிலாளர் கையொப்பம்",
    remark: "குறிப்பு",
    noMeasurements: "அளவீடுகள் இல்லை.",
  },
} as const;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function measurementEntries(
  measurements?: Record<string, unknown>,
  fieldSchemaSnapshot?: Record<string, unknown>,
  locale: "en" | "ta" = "en"
) {
  if (!measurements) return [];
  if (fieldSchemaSnapshot) {
    return resolveHistoricalGarmentDisplayFields({ measurements, fieldSchemaSnapshot })
      .filter((field) => shouldPrintMeasurementsOnJobCard(fieldSchemaSnapshot) || field.fieldType !== "measurement")
      .map((field) => ({
        key: field.code,
        label: field.unit ? `${field.label} (${field.unit})` : field.label,
        value: historicalGarmentValueTextForPrint(field.value, field.uiMetadata, locale),
      }));
  }
  const keys = [
    ...measurementFields.map((field) => field.id).filter((key) => typeof measurements[key] === "string" && measurements[key].trim()),
    ...Object.keys(measurements).filter(
      (key) => !measurementFields.some((field) => field.id === key) && typeof measurements[key] === "string" && measurements[key].trim()
    ),
  ];
  return keys.map((key) => ({
    key,
    label: FIELD_LABELS[key] ?? measurementFieldLabel(key),
    value: historicalGarmentValueText(measurements[key]),
  }));
}

function localizedMeasurementLabel(key: string, fallback: string, locale: "en" | "ta") {
  if (locale === "ta") return TAMIL_MEASUREMENT_LABELS[key] ?? fallback;
  return fallback;
}

function localizedStage(stage: TaskType, locale: "en" | "ta") {
  if (locale === "ta") return TAMIL_STAGE_LABELS[stage] ?? stage;
  return stage;
}

function formatSlipDate(value: string, locale: "en" | "ta") {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat(locale === "ta" ? "ta-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function chunkEntries<T>(entries: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
}

function activeStaff(staff: Staff[]) {
  return staff.filter((member) => member.status === "Active");
}

function defaultRateFor(staff: Staff | undefined, garmentTypeId: string | undefined, stage: TaskType) {
  return staffGarmentStageRate(staff, garmentTypeId, stage);
}

function PrintSetup({
  order,
  staff,
  initialSerialNo,
  initialUnitNo,
}: {
  order: Order;
  staff: Staff[];
  initialSerialNo?: number;
  initialUnitNo?: number;
}) {
  const firstItem = order.items[0];
  const [serialNo, setSerialNo] = useState(
    initialSerialNo && order.items.some((item) => item.serialNo === initialSerialNo)
      ? initialSerialNo
      : firstItem?.serialNo ?? 1
  );
  const selectedItem = order.items.find((item) => item.serialNo === serialNo) ?? firstItem;
  const maxUnit = Math.max(1, selectedItem?.qty ?? 1);
  const [unitNo, setUnitNo] = useState(
    initialUnitNo && initialUnitNo >= 1 && initialUnitNo <= maxUnit ? initialUnitNo : 1
  );
  const [stage, setStage] = useState<TaskType>("Cutting");
  const [workStages, setWorkStages] = useState<CatalogWorkStage[]>([]);
  const visibleStaff = useMemo(() => activeStaff(staff), [staff]);
  const [staffId, setStaffId] = useState("");
  const selectedStaff = visibleStaff.find((member) => member.id === staffId);
  const [rate, setRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUnitNo((current) => Math.min(Math.max(1, current), maxUnit));
  }, [maxUnit]);

  useEffect(() => {
    setRate(String(defaultRateFor(selectedStaff, selectedItem?.garmentTypeId, stage)));
  }, [selectedItem?.garmentTypeId, selectedStaff, stage]);

  useEffect(() => {
    let cancelled = false;
    getActiveWorkStagesAction().then((stages) => {
      if (cancelled) return;
      setWorkStages(stages);
      setStage((current) =>
        stages.length > 0 && !stages.some((candidate) => candidate.stageKey === current)
          ? (stages[0].stageKey as TaskType)
          : current
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    if (!selectedItem) return;
    setError("");
    setSaving(true);
    const result = await createJobCardStageSlipAction({
      orderId: order.id,
      orderItemSerialNo: selectedItem.serialNo,
      unitNo,
      stage,
      staffId,
      wageRate: Number(rate),
      notes,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    window.location.href = `/orders/${order.id}/print/job-card?slipId=${result.data.id}`;
  }

  return (
    <PrintPageFrame showClose>
      <div className="w-full max-w-3xl rounded-xl border border-border-soft bg-white p-5 shadow-soft print:hidden">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-ink">Print Stage Job Card</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {order.orderNumber} - choose the stage for this printout.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Garment
            <select
              value={serialNo}
              onChange={(event) => setSerialNo(Number(event.target.value))}
              className="h-11 rounded-lg border border-border px-3 font-normal"
            >
              {order.items.map((item) => (
                <option key={item.serialNo} value={item.serialNo}>
                  {item.serialNo} - {item.particular}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Unit
            <select
              value={unitNo}
              onChange={(event) => setUnitNo(Number(event.target.value))}
              className="h-11 rounded-lg border border-border px-3 font-normal"
            >
              {Array.from({ length: maxUnit }, (_, index) => index + 1).map((unit) => (
                <option key={unit} value={unit}>
                  Unit {unit} of {maxUnit}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Stage
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value as TaskType)}
              className="h-11 rounded-lg border border-border px-3 font-normal"
            >
              {workStages.map((task) => (
                <option key={task.id} value={task.stageKey}>
                  {task.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            <span>Assign to <span className="font-normal text-ink-muted">(optional)</span></span>
            <select
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
              className="h-11 rounded-lg border border-border px-3 font-normal"
            >
              <option value="">Select worker</option>
              {visibleStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.staffNumber} — {member.name} — {member.role}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Labour Rate
            <input
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              inputMode="decimal"
              className="h-11 rounded-lg border border-border px-3 font-normal"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Work Notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-11 rounded-lg border border-border px-3 font-normal"
              placeholder="Optional"
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving || !selectedItem}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Printout
          </button>
        </div>
      </div>
    </PrintPageFrame>
  );
}

function StageSlipPrint({
  slip,
  customer,
  billingSettings,
}: {
  slip: JobCardStageSlip;
  customer: Customer | undefined;
  billingSettings: ShopBillingSettings;
}) {
  return (
    <StageSlipPrintV2
      slip={slip}
      customer={customer}
      billingSettings={billingSettings}
    />
  );
}


function StageSlipPrintV2({
  slip,
  customer,
  billingSettings,
}: {
  slip: JobCardStageSlip;
  customer: Customer | undefined;
  billingSettings: ShopBillingSettings;
}) {
  const { locale } = useLanguage();
  const labels = SLIP_LABELS[locale];
  const measurements = measurementEntries(slip.measurementsSnapshot, slip.fieldSchemaSnapshot, locale);
  const measurementRows = chunkEntries(measurements, 4);
  const barcodeValue = toBarcodeValue(slip.slipCode);
  const barcodeMetrics = barcodeSvgMetrics(barcodeValue);
  const customerName = customer?.name ?? slip.customerSnapshot?.name ?? "-";
  const customerPhone = customer?.phone ?? slip.customerSnapshot?.phone ?? "-";
  const assignedWorker = slip.staffId ? slip.staffName : "";
  const addOns =
    slip.labourAddOnsSnapshot?.map((addOn) => addOn.labelTa || addOn.label).filter(Boolean) ??
    slip.addOnsSnapshot?.map((addOn) => addOn.labelTa || addOn.label).filter(Boolean) ??
    [];

  return (
    <PrintPageFrame showClose contentClassName="stage-slip-preview">
      <style jsx global>{`
        @media print {
          @page {
            size: 8in 3in;
            margin: 0;
          }

          .stage-slip-preview {
            width: 8in !important;
            height: 3in !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
      <section className="stage-slip-paper bg-white text-black">
        <table className="stage-slip-table">
          <tbody>
            <tr>
              <td className="stage-slip-shop">
                {billingSettings.shopName || "NewLook"}
              </td>
              <td className="stage-slip-name" colSpan={2}>
                {customerName}
              </td>
              <td className="stage-slip-strong" colSpan={2}>
                {customerPhone}
              </td>
              <td className="stage-slip-strong" colSpan={2}>
                {formatSlipDate(slip.printedAt.slice(0, 10), locale)} | {slip.garmentType}:{slip.unitNo} | {localizedStage(slip.stage, locale)} | {labels.qty}:{slip.quantity}
              </td>
            </tr>
            {measurementRows.length > 0 ? (
              measurementRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: 4 }, (_, columnIndex) => {
                    const entry = row[columnIndex];
                    return (
                      <td
                        key={entry?.key ?? columnIndex}
                        className="stage-slip-measure"
                        colSpan={columnIndex === 3 ? 1 : 2}
                      >
                        {entry ? (
                          <>
                            <span>{localizedMeasurementLabel(entry.key, entry.label, locale)}</span>
                            <strong>{entry.value}</strong>
                          </>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td className="stage-slip-empty" colSpan={7}>
                  {labels.noMeasurements}
                </td>
              </tr>
            )}
            <tr>
              <td className="stage-slip-note" colSpan={3}>
                {labels.addOns}: {addOns.length ? addOns.join(", ") : "-"}
              </td>
              <td className="stage-slip-note" colSpan={2}>
                {labels.assignTo}: {assignedWorker}
              </td>
              <td className="stage-slip-note" colSpan={2}>
                {labels.notes}: {slip.notes || "-"}
              </td>
            </tr>
            <tr>
              <td className="stage-slip-footer" colSpan={3}>
                {labels.workerSign}:
              </td>
              <td className="stage-slip-remark" colSpan={4}>
                {labels.remark}:
              </td>
            </tr>
            <tr>
              <td className="stage-slip-barcode" colSpan={7}>
                <Image
                  src={barcodeSvgDataUri(barcodeValue)}
                  alt=""
                  width={barcodeMetrics.width}
                  height={barcodeMetrics.height}
                  unoptimized
                />
                <span title={slip.slipCode}>{barcodeValue}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <style jsx global>{`
        .stage-slip-paper {
          width: 8in;
          height: 3in;
          box-sizing: border-box;
          overflow: hidden;
          padding: 0.08in;
          font-family: Arial, Helvetica, sans-serif;
        }

        .stage-slip-preview {
          width: min(8in, calc(100vw - 32px));
          max-width: none;
          margin: 24px auto;
          padding: 0;
          background: transparent;
          box-shadow: none;
        }

        .stage-slip-table {
          width: 100%;
          height: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          font-size: 10.5px;
          line-height: 1.15;
        }

        .stage-slip-table td {
          border: 1px solid #222;
          padding: 4px 6px;
          vertical-align: middle;
        }

        .stage-slip-remark {
          color: #444;
        }

        .stage-slip-shop,
        .stage-slip-name {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0;
        }

        .stage-slip-strong {
          font-weight: 800;
        }

        .stage-slip-measure {
          height: 0.34in;
        }

        .stage-slip-measure span {
          display: block;
          color: #444;
          font-size: 8.5px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .stage-slip-measure strong {
          display: block;
          margin-top: 2px;
          font-size: 14px;
          font-weight: 800;
        }

        .stage-slip-empty,
        .stage-slip-note,
        .stage-slip-footer {
          font-size: 10px;
          font-weight: 700;
        }

        .stage-slip-barcode {
          text-align: center;
          background: #fff;
          overflow: visible;
          padding: 3px 8px !important;
        }

        .stage-slip-barcode img {
          display: block;
          width: auto;
          height: auto;
          max-width: none;
          margin: 0 auto 2px;
          object-fit: contain;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .stage-slip-barcode span {
          display: block;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          line-height: 1.1;
          font-weight: 800;
        }

        .stage-slip-barcode .stage-slip-code {
          font-size: 8px;
          letter-spacing: 0;
        }

        @media screen {
          .stage-slip-paper {
            margin: 0 auto;
            box-shadow: 0 12px 28px rgb(0 0 0 / 0.18);
          }
        }

        @media print {
          .stage-slip-paper {
            box-shadow: none;
            break-after: page;
          }
        }
      `}</style>
    </PrintPageFrame>
  );
}

function TailorJobCardPrintPageContent({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [slip, setSlip] = useState<JobCardStageSlip | null | undefined>(undefined);
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings>(
    DEFAULT_SHOP_BILLING_SETTINGS
  );
  const slipId = firstValue(searchParams?.slipId);
  const initialSerialNo = Number(firstValue(searchParams?.orderItemSerialNo));
  const initialUnitNo = Number(firstValue(searchParams?.unitNo));

  useEffect(() => {
    let cancelled = false;
    getPrintableBillingSettingsAction().then((settings) => {
      if (!cancelled) setBillingSettings(settings);
    });
    getOrderByIdAction(params.id).then((result) => {
      if (cancelled) return;
      setOrder(result ?? null);
      if (result) {
        getCustomerByIdAction(result.customerId).then((found) => {
          if (!cancelled) setCustomer(found);
        });
      }
    });
    getStaffAction().then((result) => {
      if (!cancelled) setStaff(result);
    });
    if (slipId) {
      getJobCardStageSlipAction(slipId).then((result) => {
        if (!cancelled) setSlip(result ?? null);
      });
    } else {
      setSlip(undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [params.id, slipId]);

  if (order === undefined || (slipId && slip === undefined)) return null;
  if (order === null) notFound();
  if (slipId && slip === null) notFound();

  if (slip) {
    return (
      <StageSlipPrint
        slip={slip}
        customer={customer}
        billingSettings={billingSettings}
      />
    );
  }

  return (
    <PrintSetup
      order={order}
      staff={staff}
      initialSerialNo={Number.isFinite(initialSerialNo) ? initialSerialNo : undefined}
      initialUnitNo={Number.isFinite(initialUnitNo) ? initialUnitNo : undefined}
    />
  );
}

export default function TailorJobCardPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return <TailorJobCardPrintPageContent params={params} searchParams={searchParams} />;
}
