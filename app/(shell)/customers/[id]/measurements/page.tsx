"use client";

import { useEffect, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getCustomerByIdAction,
  getCustomerMeasurementsAction,
  saveCustomerMeasurementsAction,
} from "@/app/(shell)/customers/actions";
import type { Customer } from "@/lib/types";
import { CustomerMeasurementsForm } from "@/components/customers/customer-measurements-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function EditMeasurementsPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCustomerByIdAction(params.id),
      getCustomerMeasurementsAction(params.id),
    ]).then(([c, existing]) => {
      if (cancelled) return;
      setCustomer(c ?? null);
      setValues({ ...(existing?.values ?? {}) });
      setNotes(existing?.notes ?? "");
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

      <h1 className="mb-1 text-[26px] font-semibold text-ink">
        {t("customers.editMeasurementsTitle")}
      </h1>
      <p className="mb-6 text-sm text-ink-muted">
        {t("customers.editMeasurementsDesc")}
      </p>

      <div className="max-w-3xl space-y-4">
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
          {saving ? "Saving…" : t("customers.saveMeasurements")}
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
