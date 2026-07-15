"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound, useSearchParams } from "next/navigation";
import {
  getCustomerByIdAction,
  getGarmentMeasurementsForCustomerAction,
} from "@/app/(shell)/customers/actions";
import { getPrintableBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import { measurementFieldLabel } from "@/lib/catalog";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import type {
  Customer,
  GarmentMeasurement,
} from "@/lib/types";
import { PrintPageFrame } from "@/components/orders/print/print-page-frame";
import { RequirePermission } from "@/components/auth/require-permission";

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatGarmentName(name: string) {
  return name
    .trim()
    .split(/(\s+|\/|-)/)
    .map((part) =>
      /^[a-z]/i.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part
    )
    .join("");
}

function filledEntries(values: Record<string, string>) {
  return Object.entries(values).filter(([, value]) => value.trim() !== "");
}

function MeasurementGrid({ values }: { values: Record<string, string> }) {
  const entries = filledEntries(values);
  if (entries.length === 0) {
    return <p className="text-sm italic text-gray-500">No filled fields.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-x-5 gap-y-1.5 text-sm">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex justify-between gap-3 border-b border-dotted border-gray-300 pb-0.5"
        >
          <span className="text-gray-600">{measurementFieldLabel(key)}</span>
          <span className="font-semibold">{value}</span>
        </div>
      ))}
    </div>
  );
}

function MeasurementsPrintContent({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const selectedGarmentType = searchParams.get("garmentType")?.trim() ?? "";
  const [customer, setCustomer] = useState<Customer | null | undefined>(
    undefined
  );
  const [garments, setGarments] = useState<GarmentMeasurement[]>([]);
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings>(
    DEFAULT_SHOP_BILLING_SETTINGS
  );

  useEffect(() => {
    let cancelled = false;
    getPrintableBillingSettingsAction().then((settings) => {
      if (!cancelled) setBillingSettings(settings);
    });
    Promise.all([
      getCustomerByIdAction(params.id),
      getGarmentMeasurementsForCustomerAction(params.id),
    ]).then(([customerResult, garmentResults]) => {
      if (cancelled) return;
      setCustomer(customerResult ?? null);
      setGarments(garmentResults);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (customer === undefined) return null;
  if (customer === null) notFound();

  const printableGarments = selectedGarmentType
    ? garments.filter(
        (garment) =>
          garment.garmentType.trim().toLowerCase() ===
          selectedGarmentType.toLowerCase()
      )
    : garments;

  return (
    <PrintPageFrame
      backHref={`/customers/${customer.id}`}
      backLabel="Back to customer"
    >
      <div className="border-b-2 border-black pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold">{billingSettings.shopName}</h1>
            {billingSettings.tagline && (
              <p className="text-sm text-gray-600">{billingSettings.tagline}</p>
            )}
            {(billingSettings.phone || billingSettings.email) && (
              <p className="text-xs text-gray-600">
                {[billingSettings.phone, billingSettings.email]
                  .filter(Boolean)
                  .join(" | ")}
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
              {selectedGarmentType
                ? `${formatGarmentName(selectedGarmentType)} Measurements`
                : "Measurement Profile"}
            </p>
            <p className="mt-1 text-xs text-gray-500">Generated</p>
            <p className="font-semibold">{formatGeneratedAt(generatedAt)}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Customer</p>
          <p className="font-semibold">{customer.name}</p>
          <p className="text-gray-700">{customer.customerNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">Contact</p>
          <p className="font-semibold">{customer.phone}</p>
          <p className="text-gray-700">{customer.area || "-"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-500">Address</p>
          <p className="font-semibold">{customer.address || "-"}</p>
        </div>
      </div>

      <div className="mt-6 break-inside-avoid border border-gray-400 p-4">
        <h2 className="mb-3 text-base font-bold">Customer Notes</h2>
        <p className="whitespace-pre-wrap text-sm text-gray-700">
          {customer.notes || "-"}
        </p>
      </div>

      <div className="mt-6 space-y-5">
        <h2 className="text-base font-bold">
          {selectedGarmentType
            ? `${formatGarmentName(selectedGarmentType)} Measurements`
            : "Garment-Wise Measurements"}
        </h2>
        {printableGarments.length === 0 ? (
          <div className="border border-dashed border-gray-300 p-6 text-center text-sm italic text-gray-500">
            No measurements saved for this garment type.
          </div>
        ) : (
          printableGarments.map((garment) => (
            <section
              key={`${garment.customerId}:${garment.garmentType}`}
              className="break-inside-avoid border border-gray-400 p-4"
            >
              <div className="mb-3 flex items-end justify-between gap-4 border-b border-gray-300 pb-2">
                <h3 className="text-base font-bold">
                  {formatGarmentName(garment.garmentType)}
                </h3>
                <p className="text-xs text-gray-500">
                  Updated {formatUpdatedAt(garment.updatedAt)}
                </p>
              </div>
              <MeasurementGrid values={garment.values} />
              {garment.fitNotes && (
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  <span className="font-semibold text-gray-500">Fit Notes: </span>
                  {garment.fitNotes}
                </p>
              )}
              {garment.notes && (
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  <span className="font-semibold text-gray-500">Notes: </span>
                  {garment.notes}
                </p>
              )}
            </section>
          ))
        )}
      </div>

      <div className="mt-8 border-t border-gray-300 pt-3 text-xs text-gray-500">
        <p>This printout shows the current saved measurements.</p>
      </div>
    </PrintPageFrame>
  );
}

export default function MeasurementsPrintPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RequirePermission allOf={["customers.view", "customers.viewMeasurements"]}>
      <MeasurementsPrintContent params={params} />
    </RequirePermission>
  );
}
