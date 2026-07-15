"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Printer } from "lucide-react";
import {
  MEASUREMENT_FIELD_GROUPS,
  measurementFieldLabel,
  type CatalogGarmentType,
} from "@/lib/catalog";
import type { Customer, GarmentMeasurement } from "@/lib/types";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

const MASTER_FIELD_ORDER = MEASUREMENT_FIELD_GROUPS.flatMap((group) => group.fieldIds);

function garmentKey(name: string) {
  return name.trim().toLowerCase();
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

function orderedFilledEntries(
  measurement: GarmentMeasurement,
  garmentTypes: CatalogGarmentType[]
) {
  const garment = garmentTypes.find(
    (item) => garmentKey(item.name) === garmentKey(measurement.garmentType)
  );
  const configuredOrder = garment?.measurementFieldIds ?? [];
  const knownOrder = [...configuredOrder, ...MASTER_FIELD_ORDER];
  const orderedKeys = new Set(knownOrder);
  const unknownKeys = Object.keys(measurement.values)
    .filter((key) => !orderedKeys.has(key))
    .sort();
  return [...knownOrder, ...unknownKeys]
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .map((key) => [key, measurement.values[key]] as const)
    .filter(([, value]) => value?.trim());
}

export function MeasurementsCard({
  customer,
  garmentTypes,
  measurements,
}: {
  customer: Customer;
  garmentTypes: CatalogGarmentType[];
  measurements: GarmentMeasurement[];
}) {
  const { hasPermission } = useCurrentUser();
  const canEdit = hasPermission("customers.editMeasurements");
  const { t } = useLanguage();
  const router = useRouter();
  const [openingEditor, setOpeningEditor] = useState(false);
  const hasMeasurements = measurements.length > 0;

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold text-ink">
          {t("customers.measurements")}
        </h3>
        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${customer.id}/measurements/print`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setOpeningEditor(true);
                router.push(`/customers/${customer.id}/measurements`);
              }}
              disabled={openingEditor}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Pencil className="h-3.5 w-3.5" />
              {openingEditor ? "Opening..." : t("customers.editMeasurements")}
            </button>
          )}
        </div>
      </div>

      {!hasMeasurements ? (
        <p className="text-sm text-ink-muted">
          {t("customers.noMeasurementsRecorded")}
        </p>
      ) : (
        <div className="space-y-5">
          {measurements.map((measurement) => {
            const entries = orderedFilledEntries(measurement, garmentTypes);
            return (
              <div
                key={measurement.garmentType}
                className="overflow-hidden rounded-lg border border-border-soft bg-white"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border-soft bg-primary-tint/60 px-4 py-3">
                  <h4 className="text-[15px] font-bold text-ink">
                    {formatGarmentName(measurement.garmentType)} Measurements
                  </h4>
                  <span className="text-xs font-medium text-ink-muted">
                    Updated {formatUpdatedAt(measurement.updatedAt)}
                  </span>
                </div>
                <div className="p-3.5">
                  {entries.length > 0 ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
                      {entries.map(([id, value]) => (
                        <div key={id}>
                          <dt className="text-[13px] text-ink-muted">
                            {measurementFieldLabel(id)}
                          </dt>
                          <dd className="text-[15px] font-bold text-ink">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-ink-muted">
                      No measurement fields filled.
                    </p>
                  )}
                  {measurement.notes && (
                    <div className="mt-3 border-t border-border-soft pt-2.5">
                      <p className="text-[13px] font-medium text-ink-muted">
                        Notes
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                        {measurement.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
