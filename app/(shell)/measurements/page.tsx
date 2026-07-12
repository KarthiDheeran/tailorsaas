"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ruler, Search, Shirt, Users } from "lucide-react";
import {
  getMeasurementDeskRowsAction,
  type MeasurementDeskRow,
} from "@/app/(shell)/measurements/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { measurementFieldLabel } from "@/lib/catalog";
import { cn } from "@/lib/utils";

function countFilled(values: Record<string, string> | undefined) {
  return Object.values(values ?? {}).filter((value) => value.trim() !== "").length;
}

function latestDate(row: MeasurementDeskRow) {
  return [row.baseline?.updatedAt, ...row.garments.map((garment) => garment.updatedAt)]
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
}

function formatValueList(values: Record<string, string>, max = 6) {
  const entries = Object.entries(values).filter(([, value]) => value.trim() !== "");
  if (entries.length === 0) return "No filled fields";
  const labelCounts = new Map<string, number>();
  for (const [key] of entries) {
    const label = measurementFieldLabel(key);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const visible = entries.slice(0, max);
  const text = visible
    .map(([key, value]) => {
      const label = measurementFieldLabel(key);
      return `${labelCounts.get(label)! > 1 ? `${label} (${key})` : label}: ${value}`;
    })
    .join(", ");
  return entries.length > max ? `${text} +${entries.length - max} more` : text;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof Ruler;
  tone?: "default" | "blue";
}) {
  return (
    <div className="rounded-lg border border-border-soft bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-ink-faint">{label}</span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            tone === "blue" ? "bg-chip-blue text-chip-blue-fg" : "bg-primary-tint text-primary"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function MeasurementDeskContent() {
  const [rows, setRows] = useState<MeasurementDeskRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "baseline" | "garment">("all");

  useEffect(() => {
    let cancelled = false;
    getMeasurementDeskRowsAction()
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load measurements."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    return {
      customers: rows.length,
      baseline: rows.filter((row) => row.baseline).length,
      garment: rows.reduce((sum, row) => sum + row.garments.length, 0),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === "baseline" && !row.baseline) return false;
      if (view === "garment" && row.garments.length === 0) return false;
      if (!needle) return true;
      const haystack = [
        row.customer.name,
        row.customer.phone,
        row.customer.area,
        row.customer.customerNumber,
        row.garments.map((garment) => garment.garmentType).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, view]);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Measurements</h1>
          <p className="text-sm text-ink-muted">
            Search saved customer and garment-wise measurements.
          </p>
        </div>
        <Link
          href="/customers"
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <Users className="h-4 w-4" />
          Customers
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Customers with measurements" value={stats.customers} />
        <StatCard icon={Ruler} label="Baseline profiles" value={stats.baseline} />
        <StatCard icon={Shirt} label="Garment records" value={stats.garment} tone="blue" />
      </div>

      <div className="mb-4 rounded-lg border border-border-soft bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer, phone, area, or garment"
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["baseline", "Baseline"],
              ["garment", "Garment-wise"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key as "all" | "baseline" | "garment")}
                className={cn(
                  "h-10 rounded-lg border px-3 text-sm font-semibold transition-colors",
                  view === key
                    ? "border-primary bg-primary-tint text-primary"
                    : "border-border bg-white text-ink-muted hover:bg-surface hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError && <LoadError message={loadError} />}
      {!loaded ? (
        <LoadingState label="Loading measurements..." />
      ) : filteredRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-soft bg-white p-10 text-center text-sm text-ink-muted">
          No saved measurements match this view.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRows.map((row) => (
            <section
              key={row.customer.id}
              className="rounded-lg border border-border-soft bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/customers/${row.customer.id}`}
                    className="text-base font-semibold text-primary hover:underline"
                  >
                    {row.customer.name}
                  </Link>
                  <div className="mt-1 text-xs text-ink-faint">
                    {row.customer.customerNumber} - {row.customer.phone} - {row.customer.area}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink-muted">
                    Updated {latestDate(row) || "unknown"}
                  </span>
                  <Link
                    href={`/customers/${row.customer.id}/measurements`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-tint"
                  >
                    Edit Measurements
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_1.5fr]">
                <div className="rounded-lg border border-border-soft bg-surface/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">Baseline</h2>
                    <span className="text-xs font-medium text-ink-faint">
                      {countFilled(row.baseline?.values)} fields
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {row.baseline ? formatValueList(row.baseline.values) : "No baseline saved"}
                  </p>
                  {row.baseline?.notes && (
                    <p className="mt-2 text-xs text-ink-faint">{row.baseline.notes}</p>
                  )}
                </div>

                <div className="space-y-2">
                  {row.garments.length === 0 ? (
                    <div className="rounded-lg border border-border-soft bg-surface/50 p-3 text-sm text-ink-muted">
                      No garment-wise measurements saved.
                    </div>
                  ) : (
                    row.garments.map((garment) => (
                      <div
                        key={`${row.customer.id}:${garment.garmentType}`}
                        className="rounded-lg border border-border-soft bg-white p-3"
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-ink">
                            {garment.garmentType}
                          </h3>
                          <span className="text-xs text-ink-faint">
                            {countFilled(garment.values)} fields - {garment.updatedAt}
                          </span>
                        </div>
                        <p className="text-sm text-ink-muted">
                          {formatValueList(garment.values)}
                        </p>
                        {(garment.fitNotes || garment.notes) && (
                          <p className="mt-2 text-xs text-ink-faint">
                            {[garment.fitNotes, garment.notes].filter(Boolean).join(" - ")}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MeasurementsPage() {
  return (
    <RequirePermission permission="customers.viewMeasurements">
      <MeasurementDeskContent />
    </RequirePermission>
  );
}
