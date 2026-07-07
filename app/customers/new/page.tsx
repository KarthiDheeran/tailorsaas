"use client";

import { useRouter } from "next/navigation";
import { createCustomer } from "@/lib/data/stub-data";
import {
  NewCustomerForm,
  type NewCustomerFormValues,
} from "@/components/orders/new-customer-form";

export default function AddCustomerPage() {
  const router = useRouter();

  function handleSubmit(values: NewCustomerFormValues) {
    const customer = createCustomer(values);
    router.push(`/customers/${customer.id}`);
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Add Customer</h1>
        <p className="text-sm text-ink-muted">
          Create a new customer record
        </p>
      </div>
      <div className="max-w-2xl">
        <NewCustomerForm
          onSubmit={handleSubmit}
          title="Customer Details"
          submitLabel="Save Customer"
        />
      </div>
    </div>
  );
}
