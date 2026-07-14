"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { getJobCardsAction } from "@/app/(shell)/job-cards/actions";
import {
  getCustomerFabricsAction,
  getInventoryItemsAction,
  getInventoryMovementsAction,
} from "@/app/(shell)/inventory/actions";
import { getOrderByIdAction } from "@/app/(shell)/orders/actions";
import { getPrintableBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
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
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import type { JobCard } from "@/lib/job-cards";
import type {
  Customer,
  CustomerFabric,
  GarmentMeasurement,
  InventoryItem,
  InventoryMovement,
  Order,
  OrderItem,
} from "@/lib/types";


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

function numberValue(value: number) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function groupJobCardsBySerialNo(jobCards: JobCard[]) {
  const grouped = new Map<number, JobCard[]>();
  for (const card of jobCards) {
    const current = grouped.get(card.item.serialNo) ?? [];
    current.push(card);
    grouped.set(card.item.serialNo, current);
  }
  return grouped;
}

function getReferencedStockUsage(
  order: Order,
  orderJobCards: JobCard[],
  movements: InventoryMovement[]
) {
  const tokens = [
    order.orderNumber.toLowerCase(),
    ...orderJobCards.map((card) => card.jobCardNumber.toLowerCase()),
  ];
  return movements.filter((movement) => {
    if (movement.movementType !== "Stock Out") return false;
    const reason = movement.reason?.toLowerCase() ?? "";
    return tokens.some((token) => token && reason.includes(token));
  });
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
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [customerFabrics, setCustomerFabrics] = useState<CustomerFabric[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
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

      const todayIso = new Date().toISOString().slice(0, 10);
      Promise.all([
        getJobCardsAction(todayIso),
        getCustomerFabricsAction(),
        getInventoryItemsAction(),
        getInventoryMovementsAction(),
      ]).then(([cardsResult, fabricsResult, itemsResult, movementsResult]) => {
        if (cancelled) return;
        setJobCards((cardsResult ?? []).filter((card) => card.orderId === result.id));
        setCustomerFabrics(
          (fabricsResult ?? []).filter((fabric) => fabric.orderId === result.id)
        );
        setInventoryItems(itemsResult ?? []);
        setInventoryMovements(movementsResult ?? []);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (order === undefined) return null;
  if (order === null) notFound();

  const jobCardsBySerialNo = groupJobCardsBySerialNo(jobCards);
  const inventoryItemById = new Map(inventoryItems.map((item) => [item.id, item]));
  const stockUsage = getReferencedStockUsage(order, jobCards, inventoryMovements);

  return (
    <PrintPageFrame backHref="/orders">
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
            <p className="mt-1 text-xs text-gray-500">{t("print.orderNo")}</p>
            <p className="font-semibold">{order.orderNumber}</p>
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

              {((item.fabricSource && item.fabricSource !== "Not specified") ||
                item.fabricNotes ||
                item.designNotes) && (
                <div className="mt-3 border border-gray-300 p-2 text-sm">
                  {item.fabricSource && item.fabricSource !== "Not specified" && (
                    <p>
                      <span className="font-semibold text-gray-500">Fabric: </span>
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

              {(jobCardsBySerialNo.get(item.serialNo)?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Job Cards
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {jobCardsBySerialNo.get(item.serialNo)!.map((card) => (
                      <div key={card.id} className="border border-gray-300 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{card.jobCardNumber}</span>
                          <span>{card.stage}</span>
                        </div>
                        <div className="mt-1 text-gray-600">
                          Unit {card.unitNo} of {card.totalUnits} | Assigned: {card.assignedTo}
                        </div>
                        {card.fabricSource && card.fabricSource !== "Not specified" && (
                          <div className="mt-1 text-gray-600">
                            Fabric: {card.fabricSource}
                            {card.fabricNotes ? ` - ${card.fabricNotes}` : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
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

      {(customerFabrics.length > 0 || stockUsage.length > 0) && (
        <div className="mt-6 break-inside-avoid border border-gray-400 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Materials
          </p>
          <div className="grid grid-cols-2 gap-5 text-sm">
            <div>
              <p className="mb-1 font-semibold">Customer Fabric</p>
              {customerFabrics.length > 0 ? (
                <div className="space-y-1">
                  {customerFabrics.map((fabric) => (
                    <div key={fabric.id} className="border-b border-dotted border-gray-300 pb-1">
                      <span className="font-medium">{fabric.fabricDescription}</span>
                      {fabric.color ? `, ${fabric.color}` : ""} - {numberValue(fabric.quantity)} {fabric.unit} - {fabric.status}
                      {fabric.notes ? <div className="text-xs text-gray-600">{fabric.notes}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="italic text-gray-500">No customer fabric linked.</p>
              )}
            </div>
            <div>
              <p className="mb-1 font-semibold">Shop Stock Used</p>
              {stockUsage.length > 0 ? (
                <div className="space-y-1">
                  {stockUsage.map((movement) => {
                    const item = inventoryItemById.get(movement.itemId);
                    return (
                      <div key={movement.id} className="border-b border-dotted border-gray-300 pb-1">
                        <span className="font-medium">{item?.name ?? "Stock item"}</span>
                        {item?.color ? `, ${item.color}` : ""} - {numberValue(movement.quantity)} {item?.unit ?? ""}
                        <div className="text-xs text-gray-600">
                          {formatDate(movement.movementDate)}
                          {movement.reason ? ` - ${movement.reason}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="italic text-gray-500">No stock usage linked.</p>
              )}
            </div>
          </div>
        </div>
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
