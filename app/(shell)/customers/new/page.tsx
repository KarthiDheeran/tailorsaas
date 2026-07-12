"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createCustomerAction } from "@/app/(shell)/customers/actions";
import {
  NewCustomerForm,
  type NewCustomerFormValues,
} from "@/components/orders/new-customer-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function AddCustomerPageContent() {
  const router = useRouter();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  async function handleSaveCustomer(values: NewCustomerFormValues) {
    setError(null);
    const result = await createCustomerAction(values);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/customers/${result.data.id}`);
  }

  async function handleSaveAndNewOrder(values: NewCustomerFormValues) {
    setError(null);
    const result = await createCustomerAction(values);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push(`/orders/new?customerId=${result.data.id}`);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/customers"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("customers.backToCustomers")}
      </Link>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">
          {t("customers.addCustomer")}
        </h1>
        <p className="text-sm text-ink-muted">
          {t("customers.addCustomerSubtitle")}
        </p>
      </div>
      <div className="max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
            {error}
          </div>
        )}
        <NewCustomerForm
          onSubmit={handleSaveCustomer}
          onCancel={() => router.push("/customers")}
          secondaryAction={{
            label: t("customers.saveAndNewOrder"),
            onSubmit: handleSaveAndNewOrder,
          }}
          title={t("customers.customerDetailsSection")}
          submitLabel={t("customers.saveCustomer")}
        />
      </div>
    </div>
  );
}

export default function AddCustomerPage() {
  return (
    <RequirePermission permission="customers.create">
      <AddCustomerPageContent />
    </RequirePermission>
  );
}
