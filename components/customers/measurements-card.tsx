"use client";

import Link from "next/link";
import { Pencil, Printer } from "lucide-react";
import { MEASUREMENT_FIELD_GROUPS, measurementFieldLabel } from "@/lib/catalog";
import type { Customer, CustomerMeasurements } from "@/lib/types";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

const FIELD_GROUPS = MEASUREMENT_FIELD_GROUPS.filter((g) => g.title !== "Notes");

export function MeasurementsCard({
  customer,
  measurements,
}: {
  customer: Customer;
  measurements: CustomerMeasurements | undefined;
}) {
  const { hasPermission } = useCurrentUser();
  const canEdit = hasPermission("customers.editMeasurements");
  const { t } = useLanguage();
  const values = measurements?.values ?? {};
  const fitNotes = values.fitNotes?.trim();
  const generalNotes = measurements?.notes?.trim();
  const hasAnyValue = Object.entries(values).some(
    ([key, v]) => key !== "fitNotes" && v?.trim()
  );
  const hasAnything = hasAnyValue || fitNotes || generalNotes;

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold text-ink">{t("customers.measurements")}</h3>
        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${customer.id}/measurements/print`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Link>
          {canEdit && (
          <Link
            href={`/customers/${customer.id}/measurements`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("customers.editMeasurements")}
          </Link>
          )}
        </div>
      </div>

      {!hasAnything ? (
        <p className="text-sm text-ink-muted">
          {t("customers.noMeasurementsRecorded")}
        </p>
      ) : (
        <div className="space-y-4">
          {FIELD_GROUPS.map((group) => {
            const filled = group.fieldIds.filter((id) => values[id]?.trim());
            if (filled.length === 0) return null;
            return (
              <div key={group.title}>
                <h4 className="mb-2 text-[13px] font-semibold text-ink-muted">
                  {group.title}
                </h4>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {filled.map((id) => (
                    <div key={id}>
                      <dt className="text-[13px] text-ink-muted">
                        {measurementFieldLabel(id)}
                      </dt>
                      <dd className="text-sm font-semibold text-ink">
                        {values[id]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
          {fitNotes && (
            <div>
              <dt className="text-[13px] text-ink-muted">{t("common.fitNotes")}</dt>
              <dd className="text-sm text-ink">{fitNotes}</dd>
            </div>
          )}
          {generalNotes && (
            <div>
              <dt className="text-[13px] text-ink-muted">{t("common.notes")}</dt>
              <dd className="text-sm text-ink">{generalNotes}</dd>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
