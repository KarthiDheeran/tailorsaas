"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronLeft, Printer } from "lucide-react";
import {
  getCustomerByIdAction,
  getGarmentMeasurementsForCustomerAction,
  saveGarmentMeasurementAction,
} from "@/app/(shell)/customers/actions";
import {
  getActiveGarmentTypesAction,
  getGarmentTypeConfigurationAction,
} from "@/app/(shell)/catalog/actions";
import type { CatalogGarmentType } from "@/lib/catalog";
import type { Customer, GarmentMeasurement } from "@/lib/types";
import { CustomerMeasurementsForm } from "@/components/customers/customer-measurements-form";
import { handleEnterAsNextField } from "@/components/orders/enter-as-next-field";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";
import {
  createGarmentFieldDraft,
  normalizeGarmentFieldValue,
  resolveRuntimeGarmentFields,
  serializeGarmentFieldDraft,
  type GarmentFieldDraft,
  type GarmentFieldValue,
  type RuntimeGarmentField,
} from "@/lib/garment-form-runtime";

type CopyMessage = {
  tone: "success" | "info";
  text: string;
} | null;

type PendingCopy = {
  sourceKey: string;
  matchingFieldIds: string[];
} | null;

interface CopySource {
  measurement: GarmentMeasurement;
  matchingFieldIds: string[];
}

function garmentKey(name: string) {
  return name.trim().toLowerCase();
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

function hasFilledMeasurementValues(measurement: GarmentMeasurement) {
  return Object.values(measurement.values).some((value) =>
    value !== null &&
    value !== undefined &&
    (typeof value !== "string" || value.trim() !== "") &&
    (!Array.isArray(value) || value.length > 0)
  );
}

function findMeasurement(
  measurements: GarmentMeasurement[],
  garmentName: string
) {
  const key = garmentKey(garmentName);
  return measurements.find((measurement) => garmentKey(measurement.garmentType) === key);
}

function matchingFieldIdsForCopy(
  source: GarmentMeasurement,
  targetFieldIds: ReadonlySet<string>
) {
  return Object.entries(source.values)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== undefined &&
        (typeof value !== "string" || value.trim() !== "") &&
        (!Array.isArray(value) || value.length > 0) &&
        targetFieldIds.has(key)
    )
    .map(([key]) => key);
}

function combineNotes(measurement: GarmentMeasurement | undefined) {
  return [measurement?.fitNotes, measurement?.notes]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("\n");
}

function formatUpdatedAt(value: string | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function EditMeasurementsPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [measurements, setMeasurements] = useState<GarmentMeasurement[]>([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [fieldDraft, setFieldDraft] = useState<GarmentFieldDraft>({ typedValues: {}, passthroughValues: {} });
  const [runtimeFields, setRuntimeFields] = useState<RuntimeGarmentField[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copySourceKey, setCopySourceKey] = useState("");
  const [copyMessage, setCopyMessage] = useState<CopyMessage>(null);
  const [pendingCopy, setPendingCopy] = useState<PendingCopy>(null);
  const [returningToCustomer, setReturningToCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const pageFormRef = useRef<HTMLDivElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCustomerByIdAction(params.id),
      getActiveGarmentTypesAction(),
      getGarmentMeasurementsForCustomerAction(params.id),
    ]).then(([c, garments, existingMeasurements]) => {
      if (cancelled) return;
      setCustomer(c ?? null);
      setGarmentTypes(garments);
      setMeasurements(existingMeasurements);
      setSelectedGarmentId("");
      setFieldDraft({ typedValues: {}, passthroughValues: {} });
      setRuntimeFields([]);
      setNotes("");
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const selectedGarment = useMemo(
    () => garmentTypes.find((garment) => garment.id === selectedGarmentId),
    [garmentTypes, selectedGarmentId]
  );
  const selectedMeasurement = useMemo(
    () =>
      selectedGarment
        ? findMeasurement(measurements, selectedGarment.name)
        : undefined,
    [measurements, selectedGarment]
  );
  const copySources = useMemo(() => {
    if (!selectedGarment) return [];
    return measurements.reduce<CopySource[]>((sources, measurement) => {
      if (
        garmentKey(measurement.garmentType) === garmentKey(selectedGarment.name) ||
        !hasFilledMeasurementValues(measurement)
      ) {
        return sources;
      }
      const targetFieldIds = new Set(
        runtimeFields.length > 0
          ? runtimeFields.map((field) => field.code)
          : selectedGarment.measurementFieldIds
      );
      const matchingFieldIds = matchingFieldIdsForCopy(
        measurement,
        targetFieldIds
      );
      if (matchingFieldIds.length === 0) return sources;
      sources.push({ measurement, matchingFieldIds });
      return sources;
    }, []).sort((a, b) =>
      a.measurement.garmentType.localeCompare(b.measurement.garmentType)
    );
  }, [measurements, runtimeFields, selectedGarment]);

  if (loaded && !customer) {
    notFound();
  }

  function handleGarmentChange(garmentId: string) {
    setSelectedGarmentId(garmentId);
    setError(null);
    setSuccessMessage(null);
    setCopySourceKey("");
    setCopyMessage(null);
    setPendingCopy(null);
    const garment = garmentTypes.find((item) => item.id === garmentId);
    const measurement = garment
      ? findMeasurement(measurements, garment.name)
      : undefined;
    const legacyFields = (garment?.measurementFieldIds ?? []).map((code, index) => ({
      code, name: code, fieldType: "measurement" as const, inputType: "number" as const,
      sectionId: null, sectionName: "Measurements", sectionOrder: 0, displayOrder: index,
      required: false, unit: "inch", placeholder: null, options: [], min: null, max: null,
      decimalPlaces: 2, defaultValue: null,
    }));
    void getGarmentTypeConfigurationAction(garmentId)
      .then((configuration) => {
        const resolved = resolveRuntimeGarmentFields(configuration?.fields ?? null, []);
        const fields = resolved && resolved.length > 0 ? resolved : legacyFields;
        setRuntimeFields(fields);
        setFieldDraft(createGarmentFieldDraft(measurement?.values ?? {}, fields));
      })
      .catch(() => {
        setRuntimeFields(legacyFields);
        setFieldDraft(createGarmentFieldDraft(measurement?.values ?? {}, legacyFields));
      });
    setNotes(combineNotes(measurement));
  }

  function applyCopiedFields(sourceKey: string, matchingFieldIds: string[]) {
    const source = copySources.find(
      (item) => garmentKey(item.measurement.garmentType) === sourceKey
    );
    if (!source) return;

    setFieldDraft((previous) => {
      const next = { ...previous.typedValues };
      for (const key of matchingFieldIds) {
        const value = source.measurement.values[key];
        const field = runtimeFields.find((candidate) => candidate.code === key);
        if (field && value !== undefined) {
          next[key] = normalizeGarmentFieldValue(value, field.inputType);
        }
      }
      return { ...previous, typedValues: next };
    });
    setCopyMessage({
      tone: "success",
      text: `Copied ${matchingFieldIds.length} matching fields from ${formatGarmentName(source.measurement.garmentType)}.`,
    });
    setPendingCopy(null);
  }

  function handleCopyMeasurements() {
    if (!selectedGarment || !copySourceKey) return;
    setError(null);
    setSuccessMessage(null);
    setCopyMessage(null);
    setPendingCopy(null);

    const source = copySources.find(
      (item) => garmentKey(item.measurement.garmentType) === copySourceKey
    );
    if (!source) return;

    if (source.matchingFieldIds.length === 0) {
      setCopyMessage({
        tone: "info",
        text: "No matching measurement fields found.",
      });
      return;
    }

    const overwritesExisting = source.matchingFieldIds.some(
      (key) => fieldDraft.typedValues[key] !== undefined && fieldDraft.typedValues[key] !== null && fieldDraft.typedValues[key] !== ""
    );
    if (overwritesExisting) {
      setPendingCopy({
        sourceKey: copySourceKey,
        matchingFieldIds: source.matchingFieldIds,
      });
      return;
    }

    applyCopiedFields(copySourceKey, source.matchingFieldIds);
  }

  async function handleSave() {
    if (!selectedGarment) {
      setError("Select a garment type before saving measurements.");
      setSuccessMessage(null);
      setCopyMessage(null);
      setPendingCopy(null);
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setCopyMessage(null);
    setPendingCopy(null);
    setSaving(true);
    const scopedValues = serializeGarmentFieldDraft(fieldDraft);
    const result = await saveGarmentMeasurementAction({
      customerId: params.id,
      garmentType: selectedGarment.name,
      values: scopedValues,
      fitNotes: "",
      notes: notes.trim(),
      source: "Customer measurements",
    });
    if (!result.success) {
      setSaving(false);
      setError(result.error);
      return;
    }
    setMeasurements((prev) => {
      const key = garmentKey(result.data.garmentType);
      const others = prev.filter(
        (measurement) => garmentKey(measurement.garmentType) !== key
      );
      return [...others, result.data].sort((a, b) =>
        a.garmentType.localeCompare(b.garmentType)
      );
    });
    setFieldDraft(createGarmentFieldDraft(result.data.values, runtimeFields));
    setNotes(combineNotes(result.data));
    setSuccessMessage(`${formatGarmentName(result.data.garmentType)} measurements saved.`);
    setSaving(false);
  }

  if (!loaded || !customer) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <LoadingState label="Loading measurements..." />
      </div>
    );
  }

  return (
    <div
      ref={pageFormRef}
      onKeyDownCapture={(event) =>
        handleEnterAsNextField(event, {
          rootRef: pageFormRef,
          finalButtonRef: saveButtonRef,
        })
      }
      className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8"
    >
      <button
        onClick={() => {
          setReturningToCustomer(true);
          router.push(`/customers/${params.id}`);
        }}
        disabled={returningToCustomer}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
      >
        <ChevronLeft className="h-4 w-4" />
        {returningToCustomer ? "Opening..." : `${t("customers.backTo")} ${customer.name}`}
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[26px] font-semibold text-ink">
            {t("customers.editMeasurementsTitle")}
          </h1>
          <p className="text-sm text-ink-muted">Customer: {customer.name}</p>
        </div>
        {selectedGarment ? (
          <Link
            href={`/customers/${params.id}/measurements/print?garmentType=${encodeURIComponent(
              selectedGarment.name
            )}`}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Printer className="h-4 w-4" />
            Print Measurements
          </Link>
        ) : (
          <span className="flex h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-muted opacity-60">
            <Printer className="h-4 w-4" />
            Print Measurements
          </span>
        )}
      </div>

      <div className="mb-5 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-muted">
              Select Garment Type
            </span>
            <div className="relative">
              <select
                value={selectedGarmentId}
                onChange={(event) => handleGarmentChange(event.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-border bg-white py-0 pl-3.5 pr-12 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                <option value="">Select garment type</option>
                  {garmentTypes.map((garment) => (
                  <option key={garment.id} value={garment.id}>
                    {formatGarmentName(garment.name)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            </div>
          </label>
          <div className="rounded-lg border border-border-soft bg-surface-muted/60 px-3.5 py-2.5 text-sm text-ink-muted">
            <span className="block text-[13px] font-medium">Last updated</span>
            <span className="font-semibold text-ink">
              {formatUpdatedAt(selectedMeasurement?.updatedAt)}
            </span>
          </div>
        </div>
        {garmentTypes.length === 0 && (
          <p className="mt-3 text-sm text-chip-red-fg">
            No active garment types with measurement fields found. Add measurement fields in Catalog first.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
          {error}
        </div>
      )}

      {selectedGarment && copySources.length > 0 && (
        <div className="mb-5 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
          <h2 className="mb-3 text-[17px] font-semibold text-ink">
            Copy from existing measurements
          </h2>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-muted">
                Source garment type
              </span>
              <div className="relative">
                <select
                  value={copySourceKey}
                  onChange={(event) => {
                    setCopySourceKey(event.target.value);
                    setCopyMessage(null);
                    setPendingCopy(null);
                  }}
                  className="h-11 w-full appearance-none rounded-lg border border-border bg-white py-0 pl-3.5 pr-12 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  <option value="">Select saved measurements</option>
                  {copySources.map((source) => (
                    <option
                      key={`${source.measurement.customerId}:${source.measurement.garmentType}`}
                      value={garmentKey(source.measurement.garmentType)}
                    >
                      {formatGarmentName(source.measurement.garmentType)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              </div>
            </label>
            <button
              type="button"
              onClick={handleCopyMeasurements}
              disabled={!copySourceKey}
              className="h-11 rounded-lg border border-border bg-white px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Copy Fields
            </button>
          </div>
          {copyMessage && (
            <div
              className={
                copyMessage.tone === "success"
                  ? "mt-3 flex items-center gap-2 rounded-lg bg-chip-mint px-3.5 py-2.5 text-sm font-medium text-chip-mint-fg"
                  : "mt-3 rounded-lg bg-chip-info px-3.5 py-2.5 text-sm font-medium text-chip-info-fg"
              }
            >
              {copyMessage.tone === "success" && (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {copyMessage.text}
            </div>
          )}
          {pendingCopy && (
            <div className="mt-3 rounded-lg border border-chip-peach bg-chip-peach px-3.5 py-3 text-sm text-chip-peach-fg">
              <p className="font-medium">
                This will overwrite matching {formatGarmentName(selectedGarment.name)}{" "}
                measurement values. Continue?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    applyCopiedFields(
                      pendingCopy.sourceKey,
                      pendingCopy.matchingFieldIds
                    )
                  }
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-chip-peach-fg shadow-sm transition-colors hover:bg-surface-muted"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => setPendingCopy(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-chip-peach-fg transition-colors hover:bg-white/70"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-chip-mint px-4 py-2.5 text-sm font-medium text-chip-mint-fg">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      {selectedGarment && (
        <CustomerMeasurementsForm
          garmentName={selectedGarment.name}
          fields={runtimeFields}
          values={fieldDraft.typedValues}
          notes={notes}
          onValueChange={(key, value: GarmentFieldValue) =>
            setFieldDraft((previous) => ({
              ...previous,
              typedValues: {
                ...previous.typedValues,
                [key]: value,
              },
            }))
          }
          onNotesChange={setNotes}
        />
      )}

      {!selectedGarment && garmentTypes.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-white p-8 text-center text-sm font-medium text-ink-muted">
          Select a garment type to enter measurements.
        </div>
      )}

      <button
        ref={saveButtonRef}
        onClick={handleSave}
        disabled={saving || !selectedGarment}
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Saving..." : t("customers.saveMeasurements")}
      </button>
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
