"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { getJobCardsAction } from "@/app/(shell)/job-cards/actions";
import { getOrderByIdAction } from "@/app/(shell)/orders/actions";
import { getPrintableBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import {
  getCustomerByIdAction,
  getGarmentMeasurementDraftSeedAction,
} from "@/app/(shell)/customers/actions";
import { measurementFieldLabel, measurementFields } from "@/lib/catalog";
import {
  formatDate,
  formatOptionalDate,
  ORDER_STATUS_LABEL_KEYS,
} from "@/components/orders/orders-table";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import { buildJobCards, type JobCard } from "@/lib/job-cards";
import type { Customer, Order, OrderItem } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  measurementFields.map((field) => [field.id, field.label])
);

const MEASUREMENT_NOTES_KEY = "__measurementNotes";
const MEASUREMENT_NOTE_KEYS = new Set([
  MEASUREMENT_NOTES_KEY,
  "measurementNotes",
  "measurement_notes",
  "notes",
]);

type MeasurementDraftSeed = {
  values: Record<string, string>;
  fitNotes: string;
  notes: string;
};

function safeMeasurementValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "bigint") return String(value);
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[object Object]" || trimmed.toLowerCase() === "nan") {
    return "";
  }
  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function measurementSnapshotRecord(item: OrderItem) {
  const root = asRecord(item.measurements as unknown);
  if (!root) return null;

  for (const key of ["values", "measurements", "measurement_values"]) {
    const nested = asRecord(root[key]);
    if (nested) {
      return {
        valuesRecord: nested,
        notesRecord: root,
      };
    }
  }

  return {
    valuesRecord: root,
    notesRecord: root,
  };
}

function measurementSeedRecord(fallbackSeed?: MeasurementDraftSeed) {
  if (!fallbackSeed) return null;
  return {
    valuesRecord: fallbackSeed.values as Record<string, unknown>,
    notesRecord: fallbackSeed.notes
      ? ({ [MEASUREMENT_NOTES_KEY]: fallbackSeed.notes } as Record<string, unknown>)
      : {},
  };
}

function measurementNotesFromRecord(record: Record<string, unknown>) {
  const parts: string[] = [];
  for (const key of Array.from(MEASUREMENT_NOTE_KEYS)) {
    const value = safeMeasurementValue(record[key]);
    if (value && !parts.some((part) => part.toLowerCase() === value.toLowerCase())) {
      parts.push(value);
    }
  }
  return parts.join("\n");
}

function resolveMeasurements(item: OrderItem, fallbackSeed?: MeasurementDraftSeed) {
  let snapshot = measurementSnapshotRecord(item) ?? measurementSeedRecord(fallbackSeed);
  if (!snapshot) return { values: [], measurementNotes: "" };

  const readValues = (record: Record<string, unknown>) => {
    const valuesByKey = new Map<string, string>();
    for (const [key, value] of Object.entries(record)) {
      if (MEASUREMENT_NOTE_KEYS.has(key)) continue;
      if (asRecord(value)) continue;
      const displayValue = safeMeasurementValue(value);
      if (displayValue) valuesByKey.set(key, displayValue);
    }
    return valuesByKey;
  };

  let valuesByKey = readValues(snapshot.valuesRecord);
  let measurementNotes = measurementNotesFromRecord(snapshot.notesRecord);
  if (valuesByKey.size === 0 && !measurementNotes) {
    const fallbackSnapshot = measurementSeedRecord(fallbackSeed);
    if (fallbackSnapshot && fallbackSnapshot !== snapshot) {
      snapshot = fallbackSnapshot;
      valuesByKey = readValues(snapshot.valuesRecord);
      measurementNotes = measurementNotesFromRecord(snapshot.notesRecord);
    }
  }

  const knownOrder = measurementFields.map((field) => field.id);
  const orderedKeys = [
    ...knownOrder.filter((key) => valuesByKey.has(key)),
    ...Array.from(valuesByKey.keys()).filter((key) => !knownOrder.includes(key)),
  ];

  return {
    values: orderedKeys.map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? measurementFieldLabel(key),
      value: valuesByKey.get(key) ?? "",
    })),
    measurementNotes,
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filteredJobCards(
  cards: JobCard[],
  searchParams?: Record<string, string | string[] | undefined>
) {
  const jobCardId = firstValue(searchParams?.jobCardId);
  const serialNo = Number(firstValue(searchParams?.orderItemSerialNo));
  const unitNo = Number(firstValue(searchParams?.unitNo));

  if (jobCardId) return cards.filter((card) => card.id === jobCardId);
  if (Number.isFinite(serialNo) && Number.isFinite(unitNo)) {
    return cards.filter(
      (card) => card.item.serialNo === serialNo && card.unitNo === unitNo
    );
  }
  return cards;
}

function orderItemForCard(order: Order, card: JobCard) {
  return order.items.find((item) => item.serialNo === card.item.serialNo) ?? card.item;
}

function TailorJobCardSheet({
  card,
  order,
  customer,
  billingSettings,
  measurementSeeds,
}: {
  card: JobCard;
  order: Order;
  customer: Customer | undefined;
  billingSettings: ShopBillingSettings;
  measurementSeeds: Record<string, MeasurementDraftSeed>;
}) {
  const { t } = useLanguage();
  const item = orderItemForCard(order, card);
  const { values, measurementNotes } = resolveMeasurements(
    item,
    measurementSeeds[item.particular.trim().toLowerCase()]
  );
  const formattedTrialDate = formatOptionalDate(order.trialDate);
  const hasMeaningfulFabricSource =
    item.fabricSource && item.fabricSource !== "Not specified";
  const hasItemNotes = hasMeaningfulFabricSource || item.fabricNotes || item.designNotes;

  return (
    <section className="break-inside-avoid break-after-page pb-4 last:break-after-auto">
      <div className="border-b-2 border-black pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold">{billingSettings.shopName}</h1>
            {billingSettings.tagline && (
              <p className="text-sm text-gray-600">{billingSettings.tagline}</p>
            )}
            {(billingSettings.phone || billingSettings.email) && (
              <p className="text-xs text-gray-600">
                {[billingSettings.phone, billingSettings.email].filter(Boolean).join(" | ")}
              </p>
            )}
            {billingSettings.address && (
              <p className="mt-1 max-w-md whitespace-pre-line text-xs text-gray-600">
                {billingSettings.address}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              {t("print.tailorJobCard")}
            </p>
            <p className="mt-1 text-xs text-gray-500">Job Card No</p>
            <p className="font-semibold">{card.jobCardNumber}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">{t("print.orderNo")}</p>
          <p className="font-semibold">{order.orderNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.orderStatus")}</p>
          <p className="font-semibold">{t(ORDER_STATUS_LABEL_KEYS[order.status])}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.customerName")}</p>
          <p className="font-semibold">{customer?.name ?? order.customerSnapshot?.name ?? "-"}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.customerPhone")}</p>
          <p className="font-semibold">{customer?.phone ?? order.customerSnapshot?.phone ?? "-"}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.orderDate")}</p>
          <p className="font-semibold">{formatDate(order.orderDate)}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.deliveryDate")}</p>
          <p className="font-semibold">{formatDate(order.deliveryDate)}</p>
        </div>
        {formattedTrialDate && (
          <div>
            <p className="text-gray-500">{t("orders.trialDate")}</p>
            <p className="font-semibold">{formattedTrialDate}</p>
          </div>
        )}
        {order.deliveryPromiseNote && (
          <div className="col-span-2">
            <p className="text-gray-500">Delivery Promise Note</p>
            <p className="whitespace-pre-line font-semibold">{order.deliveryPromiseNote}</p>
          </div>
        )}
      </div>

      <div className="mt-6 border border-gray-400 p-4">
        <div className="flex items-center justify-between border-b border-gray-300 pb-2">
          <p className="text-base font-bold">
            Item {item.serialNo} - {item.particular}
          </p>
          <p className="text-sm font-semibold">
            Unit {card.unitNo} of {card.totalUnits}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500">Assigned Worker</p>
            <p className="font-semibold">{card.assignedTo || "Unassigned"}</p>
          </div>
          <div>
            <p className="text-gray-500">Production Stage</p>
            <p className="font-semibold">{card.stage}</p>
          </div>
        </div>

        {item.addOns && item.addOns.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-gray-500">{t("print.addOns")}: </span>
            {item.addOns.map((addOn) => addOn.label).join(", ")}
          </p>
        )}

        {hasItemNotes && (
          <div className="mt-3 border border-gray-300 p-2 text-sm">
            {hasMeaningfulFabricSource && (
              <p>
                <span className="font-semibold text-gray-500">Fabric Source: </span>
                {item.fabricSource}
              </p>
            )}
            {item.fabricNotes && (
              <p>
                <span className="font-semibold text-gray-500">Fabric Notes: </span>
                {item.fabricNotes}
              </p>
            )}
            {item.designNotes && (
              <p>
                <span className="font-semibold text-gray-500">Design Notes: </span>
                {item.designNotes}
              </p>
            )}
          </div>
        )}

        {card.notes && (
          <p className="mt-3 whitespace-pre-line text-sm">
            <span className="font-semibold text-gray-500">Work Notes: </span>
            {card.notes}
          </p>
        )}

        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("print.measurements")}
          </p>
          {values.length > 0 ? (
            <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-sm">
              {values.map((entry) => (
                <div
                  key={entry.key}
                  className="flex justify-between border-b border-dotted border-gray-300 pb-0.5"
                >
                  <span className="text-gray-600">{entry.label}</span>
                  <span className="font-semibold">{entry.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-500">
              {t("print.noMeasurementsRecorded")}
            </p>
          )}
        </div>

        {measurementNotes && (
          <p className="mt-4 whitespace-pre-line text-sm">
            <span className="font-semibold text-gray-500">Measurement Notes: </span>
            {measurementNotes}
          </p>
        )}

        <div className="mt-10 grid grid-cols-3 gap-8 border-t border-black pt-6 text-sm">
          <div>
            <p className="mb-8 text-gray-500">{t("print.cutting")}:</p>
            <div className="border-t border-gray-400" />
          </div>
          <div>
            <p className="mb-8 text-gray-500">{t("print.stitching")}:</p>
            <div className="border-t border-gray-400" />
          </div>
          <div>
            <p className="mb-8 text-gray-500">{t("print.checkedBy")}:</p>
            <div className="border-t border-gray-400" />
          </div>
        </div>
      </div>
    </section>
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
  const [jobCards, setJobCards] = useState<JobCard[] | undefined>(undefined);
  const [measurementSeeds, setMeasurementSeeds] = useState<Record<string, MeasurementDraftSeed>>(
    {}
  );
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings>(
    DEFAULT_SHOP_BILLING_SETTINGS
  );

  useEffect(() => {
    let cancelled = false;
    getPrintableBillingSettingsAction().then((settings) => {
      if (!cancelled) setBillingSettings(settings);
    });

    getOrderByIdAction(params.id).then((result) => {
      if (cancelled) return;
      setOrder(result ?? null);
      if (!result) return;

      getCustomerByIdAction(result.customerId).then((foundCustomer) => {
        if (!cancelled) setCustomer(foundCustomer);
      });

      Promise.all(
        Array.from(new Set(result.items.map((item) => item.particular))).map(
          async (garmentType) =>
            [
              garmentType.trim().toLowerCase(),
              await getGarmentMeasurementDraftSeedAction(result.customerId, garmentType),
            ] as const
        )
      )
        .then((entries) => {
          if (!cancelled) setMeasurementSeeds(Object.fromEntries(entries));
        })
        .catch(() => {
          if (!cancelled) setMeasurementSeeds({});
        });

      const todayIso = new Date().toISOString().slice(0, 10);
      getJobCardsAction(todayIso)
        .then((cardsResult) => {
          if (!cancelled) {
            setJobCards((cardsResult ?? []).filter((card) => card.orderId === result.id));
          }
        })
        .catch(() => {
          if (!cancelled) setJobCards([]);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (order === undefined) return null;
  if (order === null) notFound();

  const todayIso = new Date().toISOString().slice(0, 10);
  const requestedJobCardId = firstValue(searchParams?.jobCardId);
  if (requestedJobCardId && jobCards === undefined) {
    return (
      <PrintPageFrame showClose>
        <p className="text-sm italic text-gray-500">Loading job card...</p>
      </PrintPageFrame>
    );
  }

  const loadedJobCards = jobCards ?? [];
  const allJobCards = (loadedJobCards.length > 0 ? loadedJobCards : buildJobCards([order], todayIso))
    .slice()
    .sort(
      (a, b) =>
        a.item.serialNo - b.item.serialNo ||
        a.unitNo - b.unitNo ||
        a.jobCardNumber.localeCompare(b.jobCardNumber)
    );
  const printableCards = filteredJobCards(allJobCards, searchParams);

  return (
    <PrintPageFrame showClose>
      {printableCards.length > 0 ? (
        <div className="space-y-0">
          {printableCards.map((card) => (
            <TailorJobCardSheet
              key={card.id}
              card={card}
              order={order}
              customer={customer}
              billingSettings={billingSettings}
              measurementSeeds={measurementSeeds}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-gray-500">No job cards found for this order.</p>
      )}
    </PrintPageFrame>
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
