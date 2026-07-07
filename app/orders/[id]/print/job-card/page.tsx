"use client";

import { notFound } from "next/navigation";
import {
  getCustomerById,
  getGarmentMeasurement,
  getOrderById,
} from "@/lib/data/stub-data";
import { measurementFields } from "@/lib/catalog";
import { formatDate } from "@/components/orders/orders-table";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import type { Order, OrderItem } from "@/lib/types";

const SHOP_NAME = "TailorSaaS";

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  measurementFields.map((f) => [f.id, f.label])
);

// Measurement *values* prefer the snapshot saved on the order item itself
// (what was actually used when this order was placed — see New Order's
// Measurements handling); fitNotes/notes were never snapshotted onto the
// item, so those always come from the customer's per-garment record.
function resolveMeasurements(order: Order, item: OrderItem) {
  const persisted = getGarmentMeasurement(order.customerId, item.particular);
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

export default function TailorJobCardPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const order = getOrderById(params.id);
  if (!order) {
    notFound();
  }
  const customer = getCustomerById(order!.customerId);

  return (
    <PrintPageFrame backHref="/orders">
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">{SHOP_NAME}</h1>
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
          Tailor Job Card
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Order No</p>
          <p className="font-semibold">{order!.orderNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">Order Status</p>
          <p className="font-semibold">{order!.status}</p>
        </div>
        <div>
          <p className="text-gray-500">Customer Name</p>
          <p className="font-semibold">{customer?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Customer Phone</p>
          <p className="font-semibold">{customer?.phone ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Order Date</p>
          <p className="font-semibold">{formatDate(order!.orderDate)}</p>
        </div>
        <div>
          <p className="text-gray-500">Delivery Date</p>
          <p className="font-semibold">{formatDate(order!.deliveryDate)}</p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {order!.items.map((item) => {
          const { values, fitNotes, notes } = resolveMeasurements(
            order!,
            item
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
                <p className="text-sm font-semibold">Qty: {item.qty}</p>
              </div>

              {item.addOns && item.addOns.length > 0 && (
                <p className="mt-2 text-sm">
                  <span className="text-gray-500">Add-ons: </span>
                  {item.addOns.map((a) => a.label).join(", ")}
                </p>
              )}

              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Measurements
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
                    No measurements recorded for this item.
                  </p>
                )}
              </div>

              {fitNotes && (
                <p className="mt-3 text-sm">
                  <span className="font-semibold text-gray-500">
                    Fit Notes:{" "}
                  </span>
                  {fitNotes}
                </p>
              )}
              {notes && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold text-gray-500">Notes: </span>
                  {notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 grid grid-cols-3 gap-8 border-t border-black pt-6 text-sm">
        <div>
          <p className="mb-8 text-gray-500">Cutting:</p>
          <div className="border-t border-gray-400" />
        </div>
        <div>
          <p className="mb-8 text-gray-500">Stitching:</p>
          <div className="border-t border-gray-400" />
        </div>
        <div>
          <p className="mb-8 text-gray-500">Checked By:</p>
          <div className="border-t border-gray-400" />
        </div>
      </div>
    </PrintPageFrame>
  );
}
