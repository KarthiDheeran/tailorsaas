"use client";

import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { getCustomerById, updateCustomer } from "@/lib/data/stub-data";
import {
  NewCustomerForm,
  type NewCustomerFormValues,
} from "@/components/orders/new-customer-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function EditCustomerPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const customer = getCustomerById(params.id);

  if (!customer) {
    notFound();
  }

  function handleSubmit(values: NewCustomerFormValues) {
    updateCustomer(params.id, values);
    router.push(`/customers/${params.id}`);
  }

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
        <NewCustomerForm
          onSubmit={handleSubmit}
          excludeCustomerId={params.id}
          initialValues={{
            name: customer!.name,
            phone: customer!.phone,
            address: customer!.address,
            area: customer!.area,
            gender: customer!.gender,
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
