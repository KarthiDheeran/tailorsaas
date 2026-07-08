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
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function EditMeasurementsPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
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
        {t("customers.backTo")} {customer!.name}
      </button>

      <h1 className="mb-1 text-[26px] font-semibold text-ink">
        {t("customers.editMeasurementsTitle")}
      </h1>
      <p className="mb-6 text-sm text-ink-muted">
        {t("customers.editMeasurementsDesc")}
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
          {t("customers.saveMeasurements")}
        </button>
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
