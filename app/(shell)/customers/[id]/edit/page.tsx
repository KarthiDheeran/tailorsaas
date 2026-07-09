"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import {
  getCustomerByIdAction,
  updateCustomerAction,
} from "@/app/(shell)/customers/actions";
import type { Customer } from "@/lib/types";
import {
  NewCustomerForm,
  type NewCustomerFormValues,
} from "@/components/orders/new-customer-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function EditCustomerPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomerByIdAction(params.id).then((c) => {
      if (cancelled) return;
      setCustomer(c ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loaded && !customer) {
    notFound();
  }

  async function handleSubmit(values: NewCustomerFormValues) {
    setError(null);
    const result = await updateCustomerAction(params.id, values);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/customers/${params.id}`);
  }

  if (!customer) return null;

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">
          {t("customers.editCustomer")}
        </h1>
        <p className="text-sm text-ink-muted">
          {t("customers.editCustomerSubtitle")}
        </p>
      </div>
      <div className="max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
            {error}
          </div>
        )}
        <NewCustomerForm
          onSubmit={handleSubmit}
          excludeCustomerId={params.id}
          initialValues={{
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            area: customer.area,
            gender: customer.gender,
          }}
          title={t("customers.customerDetailsSection")}
          submitLabel={t("common.saveChanges")}
        />
      </div>
    </div>
  );
}

export default function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RequirePermission permission="customers.edit">
      <EditCustomerPageContent params={params} />
    </RequirePermission>
  );
}
