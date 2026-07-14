"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { ChevronLeft, Printer } from "lucide-react";
import {
  getCustomerByIdAction,
  getMeasurementAttachmentsForCustomerAction,
  getCustomerMeasurementsAction,
  getMeasurementHistoryForCustomerAction,
  saveCustomerMeasurementsAction,
} from "@/app/(shell)/customers/actions";
import type {
  Customer,
  MeasurementAttachment,
  MeasurementHistoryEntry,
} from "@/lib/types";
import { measurementFieldLabel } from "@/lib/catalog";
import { MeasurementAttachmentsCard } from "@/components/customers/measurement-attachments-card";
import { CustomerMeasurementsForm } from "@/components/customers/customer-measurements-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function summarizeValues(values: Record<string, string>, max = 6) {
  const entries = Object.entries(values).filter(([, value]) => value.trim());
  if (entries.length === 0) return "No filled fields";
  const visible = entries
    .slice(0, max)
    .map(([key, value]) => `${measurementFieldLabel(key)}: ${value}`);
  return entries.length > max
    ? `${visible.join(", ")} +${entries.length - max} more`
    : visible.join(", ");
}

function historyScopeKey(entry: MeasurementHistoryEntry) {
  return `${entry.kind}:${entry.garmentType?.trim().toLowerCase() ?? "baseline"}`;
}

function changedFields(
  current: MeasurementHistoryEntry,
  previous: MeasurementHistoryEntry | undefined,
  max = 4
) {
  if (!previous) return ["Initial record"];

  const changes: string[] = [];
  const keys = new Set([
    ...Object.keys(current.values),
    ...Object.keys(previous.values),
  ]);

  for (const key of Array.from(keys)) {
    const before = previous.values[key]?.trim() ?? "";
    const after = current.values[key]?.trim() ?? "";
    if (before === after) continue;
    const label = measurementFieldLabel(key);
    if (!before && after) {
      changes.push(`${label} added`);
    } else if (before && !after) {
      changes.push(`${label} cleared`);
    } else {
      changes.push(`${label} ${before} -> ${after}`);
    }
  }

  if ((previous.fitNotes ?? "") !== (current.fitNotes ?? "")) {
    changes.push("Fit notes changed");
  }
  if ((previous.notes ?? "") !== (current.notes ?? "")) {
    changes.push("Notes changed");
  }

  if (changes.length === 0) return ["No field changes"];
  return changes.length > max
    ? [...changes.slice(0, max), `+${changes.length - max} more`]
    : changes;
}

function previousByEntryId(entries: MeasurementHistoryEntry[]) {
  const byScope = new Map<string, MeasurementHistoryEntry[]>();
  for (const entry of entries) {
    const scoped = byScope.get(historyScopeKey(entry)) ?? [];
    scoped.push(entry);
    byScope.set(historyScopeKey(entry), scoped);
  }

  const previousById = new Map<string, MeasurementHistoryEntry | undefined>();
  for (const scoped of Array.from(byScope.values())) {
    const sorted = [...scoped].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    sorted.forEach((entry, index) => {
      previousById.set(entry.id, sorted[index + 1]);
    });
  }
  return previousById;
}

function MeasurementHistoryList({
  entries,
}: {
  entries: MeasurementHistoryEntry[];
}) {
  const previous = previousByEntryId(entries);

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h2 className="mb-4 text-[17px] font-semibold text-ink">
        Measurement History
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No measurement revisions recorded yet. Future saves will appear here.
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const changes = changedFields(entry, previous.get(entry.id));
            return (
              <article
                key={entry.id}
                className="rounded-lg border border-border-soft bg-surface/40 p-3"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      {entry.kind === "Garment"
                        ? entry.garmentType ?? "Garment"
                        : "Baseline"}
                    </h3>
                    <p className="text-xs text-ink-faint">
                      {entry.source} - {formatHistoryDate(entry.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink-muted">
                    {entry.kind}
                  </span>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {changes.map((change) => (
                    <span
                      key={change}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-muted"
                    >
                      {change}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-ink-muted">
                  {summarizeValues(entry.values)}
                </p>
                {(entry.fitNotes || entry.notes) && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-ink-faint">
                    {[entry.fitNotes, entry.notes].filter(Boolean).join(" - ")}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditMeasurementsPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<MeasurementHistoryEntry[]>([]);
  const [attachments, setAttachments] = useState<MeasurementAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCustomerByIdAction(params.id),
      getCustomerMeasurementsAction(params.id),
      getMeasurementHistoryForCustomerAction(params.id),
      getMeasurementAttachmentsForCustomerAction(params.id),
    ]).then(([c, existing, historyEntries, attachmentEntries]) => {
      if (cancelled) return;
      setCustomer(c ?? null);
      setValues({ ...(existing?.values ?? {}) });
      setNotes(existing?.notes ?? "");
      setHistory(historyEntries);
      setAttachments(attachmentEntries);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loaded && !customer) {
    notFound();
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const result = await saveCustomerMeasurementsAction({
      customerId: params.id,
      values,
      notes,
      source: "Customer measurements",
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/customers/${params.id}`);
  }

  if (!customer) return null;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <button
        onClick={() => router.push(`/customers/${params.id}`)}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("customers.backTo")} {customer.name}
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[26px] font-semibold text-ink">
            {t("customers.editMeasurementsTitle")}
          </h1>
          <p className="text-sm text-ink-muted">
            {t("customers.editMeasurementsDesc")}
          </p>
        </div>
        <Link
          href={`/customers/${params.id}/measurements/print`}
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <Printer className="h-4 w-4" />
          Print Measurements
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-4">
          {error && (
            <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
              {error}
            </div>
          )}
          <CustomerMeasurementsForm
            values={values}
            notes={notes}
            onValueChange={(key, value) =>
              setValues((prev) => ({ ...prev, [key]: value }))
            }
            onNotesChange={setNotes}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving..." : t("customers.saveMeasurements")}
          </button>
        </div>
        <div className="space-y-5">
          <MeasurementHistoryList entries={history} />
          <MeasurementAttachmentsCard
            customerId={params.id}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        </div>
      </div>
    </div>
  );
}

export default function EditMeasurementsPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RequirePermission permission="customers.editMeasurements">
      <EditMeasurementsPageContent params={params} />
    </RequirePermission>
  );
}
