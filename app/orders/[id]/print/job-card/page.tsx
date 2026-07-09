"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { getOrderByIdAction } from "@/app/(shell)/orders/actions";
import {
  getCustomerByIdAction,
  getGarmentMeasurementAction,
} from "@/app/(shell)/customers/actions";
import { measurementFields } from "@/lib/catalog";
import {
  formatDate,
  ORDER_STATUS_LABEL_KEYS,
} from "@/components/orders/orders-table";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Customer, GarmentMeasurement, Order, OrderItem } from "@/lib/types";

const SHOP_NAME = "TailorSaaS";

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  measurementFields.map((f) => [f.id, f.label])
);

// Measurement *values* prefer the snapshot saved on the order item itself
// (what was actually used when this order was placed — see New Order's
// Measurements handling); fitNotes/notes were never snapshotted onto the
// item, so those always come from the customer's per-garment record.
function resolveMeasurements(
  item: OrderItem,
  persisted: GarmentMeasurement | undefined
) {
  const values =
    item.measurements && Object.keys(item.measurements).length > 0
      ? item.measurements
      : persisted?.values ?? {};
  return {
    values,
    fitNotes: persisted?.fitNotes ?? "",
    notes: persisted?.notes ?? "",
  };
}

function TailorJobCardPrintPageContent({
  params,
}: {
  params: { id: string };
}) {
  const { t } = useLanguage();

  // Phase 6C: same effect-driven fetch/loading-state conversion as the
  // customer receipt print page — this route's data source was never
  // converted before now (Phase 5D only added permission gating), and a
  // direct synchronous stub-data.ts read would simply return nothing once
  // Orders is a real table.
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [measurementsByItem, setMeasurementsByItem] = useState<
    Record<number, GarmentMeasurement | undefined>
  >({});

  useEffect(() => {
    let cancelled = false;
    getOrderByIdAction(params.id).then((result) => {
      if (cancelled) return;
      setOrder(result ?? null);
      if (!result) return;

      getCustomerByIdAction(result.customerId).then((c) => {
        if (!cancelled) setCustomer(c);
      });

      Promise.all(
        result.items.map(async (item) => {
          const persisted = await getGarmentMeasurementAction(
            result.customerId,
            item.particular
          );
          return [item.serialNo, persisted] as const;
        })
      ).then((entries) => {
        if (cancelled) return;
        setMeasurementsByItem(Object.fromEntries(entries));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (order === undefined) return null;
  if (order === null) notFound();

  return (
    <PrintPageFrame backHref="/orders">
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">{SHOP_NAME}</h1>
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
          {t("print.tailorJobCard")}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">{t("print.orderNo")}</p>
          <p className="font-semibold">{order.orderNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.orderStatus")}</p>
          <p className="font-semibold">
            {t(ORDER_STATUS_LABEL_KEYS[order.status])}
          </p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.customerName")}</p>
          <p className="font-semibold">{customer?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.customerPhone")}</p>
          <p className="font-semibold">{customer?.phone ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.orderDate")}</p>
          <p className="font-semibold">{formatDate(order.orderDate)}</p>
        </div>
        <div>
          <p className="text-gray-500">{t("print.deliveryDate")}</p>
          <p className="font-semibold">{formatDate(order.deliveryDate)}</p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {order.items.map((item) => {
          const { values, fitNotes, notes } = resolveMeasurements(
            item,
            measurementsByItem[item.serialNo]
          );
          const filledValues = Object.entries(values).filter(
            ([, v]) => v.trim() !== ""
          );
          return (
            <div
              key={item.serialNo}
              className="break-inside-avoid border border-gray-400 p-4"
            >
              <div className="flex items-center justify-between border-b border-gray-300 pb-2">
                <p className="text-base font-bold">
                  {item.serialNo}. {item.particular}
                </p>
                <p className="text-sm font-semibold">
                  {t("print.qty")}: {item.qty}
                </p>
              </div>

              {item.addOns && item.addOns.length > 0 && (
                <p className="mt-2 text-sm">
                  <span className="text-gray-500">{t("print.addOns")}: </span>
                  {item.addOns.map((a) => a.label).join(", ")}
                </p>
              )}

              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("print.measurements")}
                </p>
                {filledValues.length > 0 ? (
                  <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-sm">
                    {filledValues.map(([key, value]) => (
                      <div key={key} className="flex justify-between border-b border-dotted border-gray-300 pb-0.5">
                        <span className="text-gray-600">
                          {FIELD_LABELS[key] ?? key}
                        </span>
                        <span className="font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-gray-500">
                    {t("print.noMeasurementsRecorded")}
                  </p>
                )}
              </div>

              {fitNotes && (
                <p className="mt-3 text-sm">
                  <span className="font-semibold text-gray-500">
                    {t("common.fitNotes")}:{" "}
                  </span>
                  {fitNotes}
                </p>
              )}
              {notes && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold text-gray-500">
                    {t("common.notes")}:{" "}
                  </span>
                  {notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

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
    </PrintPageFrame>
  );
}

export default function TailorJobCardPrintPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RequirePermission permission="orders.printJobCard">
      <TailorJobCardPrintPageContent params={params} />
    </RequirePermission>
  );
}
