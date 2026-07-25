"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createJobCardStageSlipAction,
  getJobCardStageSlipAction,
} from "@/app/(shell)/job-cards/actions";
import { getOrderByIdAction } from "@/app/(shell)/orders/actions";
import { getStaffAction } from "@/app/(shell)/staff/actions";
import { getPrintableBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { RequirePermission } from "@/components/auth/require-permission";
import { formatDate } from "@/components/orders/orders-table";
import { measurementFieldLabel, measurementFields } from "@/lib/catalog";
import { barcodeSvgDataUri } from "@/lib/barcode-code128";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";
import type { Customer, Order, Staff, TaskType } from "@/lib/types";

const TASK_TYPES: TaskType[] = [
  "Measurement",
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Alteration",
  "Ironing/Packing",
  "Delivery",
];

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  measurementFields.map((field) => [field.id, field.label])
);

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function measurementEntries(measurements?: Record<string, string>) {
  if (!measurements) return [];
  const keys = [
    ...measurementFields.map((field) => field.id).filter((key) => measurements[key]?.trim()),
    ...Object.keys(measurements).filter(
      (key) => !measurementFields.some((field) => field.id === key) && measurements[key]?.trim()
    ),
  ];
  return keys.map((key) => ({
    key,
    label: FIELD_LABELS[key] ?? measurementFieldLabel(key),
    value: measurements[key],
  }));
}

function activeStaff(staff: Staff[]) {
  return staff.filter((member) => member.status === "Active");
}

function defaultRateFor(staff: Staff | undefined, stage: TaskType) {
  if (!staff || staff.paymentType !== "Per Piece") return 0;
  const rate = Number(staff.pieceRates?.[stage] ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
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
  const visibleStaff = useMemo(() => activeStaff(staff), [staff]);
  const [staffId, setStaffId] = useState(visibleStaff[0]?.id ?? "");
  const selectedStaff = visibleStaff.find((member) => member.id === staffId);
  const [rate, setRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUnitNo((current) => Math.min(Math.max(1, current), maxUnit));
  }, [maxUnit]);

  useEffect(() => {
    setRate(String(defaultRateFor(selectedStaff, stage)));
  }, [selectedStaff, stage]);

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
            {order.orderNumber} - choose the stage and worker for this printout.
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
              {TASK_TYPES.map((task) => (
                <option key={task} value={task}>
                  {task}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-ink">
            Worker
            <select
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
              className="h-11 rounded-lg border border-border px-3 font-normal"
            >
              <option value="">Select worker</option>
              {visibleStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} - {member.role}
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
            disabled={saving || !selectedItem || !staffId}
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
  const measurements = measurementEntries(slip.measurementsSnapshot);
  const barcodeValue = `TS|JOB|${slip.scanToken}`;

  return (
    <PrintPageFrame showClose>
      <section className="break-after-page bg-white p-8 text-ink print:p-6">
        <div className="border-b-2 border-black pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold">{billingSettings.shopName || "NewLook"}</h1>
              {billingSettings.tagline && (
                <p className="text-sm text-gray-600">{billingSettings.tagline}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                Stage Job Card
              </p>
              <p className="mt-1 text-2xl font-bold">{slip.stage}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <Info label="Order No" value={slip.orderNumber} />
          <Info label="Worker" value={slip.staffName} />
          <Info label="Customer" value={customer?.name ?? slip.customerSnapshot?.name ?? "-"} />
          <Info label="Mobile" value={customer?.phone ?? slip.customerSnapshot?.phone ?? "-"} />
          <Info label="Garment" value={`${slip.garmentType} - Unit ${slip.unitNo}`} />
          <Info label="Labour" value={`₹${slip.wageAmount}`} />
          <Info label="Printed" value={formatDate(slip.printedAt.slice(0, 10))} />
          <Info label="Qty" value={String(slip.quantity)} />
        </div>

        {slip.addOnsSnapshot && slip.addOnsSnapshot.length > 0 && (
          <div className="mt-4 rounded border border-gray-300 p-3 text-sm">
            <p className="font-semibold text-gray-600">Add-ons</p>
            <p className="mt-1">{slip.addOnsSnapshot.map((addOn) => addOn.label).join(", ")}</p>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Measurements
          </p>
          {measurements.length > 0 ? (
            <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-sm">
              {measurements.map((entry) => (
                <div key={entry.key} className="flex justify-between border-b border-dotted border-gray-300">
                  <span className="text-gray-600">{entry.label}</span>
                  <span className="font-semibold">{entry.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-500">No measurements recorded.</p>
          )}
        </div>

        {slip.notes && (
          <p className="mt-4 text-sm">
            <span className="font-semibold text-gray-500">Work Notes: </span>
            {slip.notes}
          </p>
        )}

        <div className="mt-8 grid grid-cols-[1fr_auto] items-end gap-6 border-t border-black pt-5">
          <div className="grid grid-cols-2 gap-8 text-sm">
            <div>
              <p className="mb-8 text-gray-500">Worker Signature:</p>
              <div className="border-t border-gray-400" />
            </div>
            <div>
              <p className="mb-8 text-gray-500">Checked By:</p>
              <div className="border-t border-gray-400" />
            </div>
          </div>
          <div className="grid justify-items-end gap-1">
            <Image
              src={barcodeSvgDataUri(barcodeValue)}
              alt=""
              width={230}
              height={44}
              unoptimized
              className="h-11 w-[230px]"
            />
            <p className="text-xs font-semibold">{slip.orderNumber}</p>
          </div>
        </div>
      </section>
    </PrintPageFrame>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
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
  return (
    <RequirePermission permission="orders.printJobCard">
      <TailorJobCardPrintPageContent params={params} searchParams={searchParams} />
    </RequirePermission>
  );
}
