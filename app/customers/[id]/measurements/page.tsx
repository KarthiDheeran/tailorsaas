"use client";

import { useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getCustomerById,
  getCustomerMeasurements,
  saveCustomerMeasurements,
} from "@/lib/data/stub-data";
import { CustomerMeasurementsForm } from "@/components/customers/customer-measurements-form";

export default function EditMeasurementsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const customer = getCustomerById(params.id);

  if (!customer) {
    notFound();
  }

  const existing = getCustomerMeasurements(params.id);
  const [values, setValues] = useState<Record<string, string>>(
    () => ({ ...(existing?.values ?? {}) })
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  function handleSave() {
    saveCustomerMeasurements({ customerId: params.id, values, notes });
    router.push(`/customers/${params.id}`);
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <button
        onClick={() => router.push(`/customers/${params.id}`)}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {customer!.name}
      </button>

      <h1 className="mb-1 text-[26px] font-semibold text-ink">
        Edit Measurements
      </h1>
      <p className="mb-6 text-sm text-ink-muted">
        This is {customer!.name}&apos;s reusable measurement baseline —
        updating overwrites these fields and applies to future orders. Fields
        left blank are fine.
      </p>

      <div className="max-w-3xl space-y-4">
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
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
        >
          Save Measurements
        </button>
      </div>
    </div>
  );
}
