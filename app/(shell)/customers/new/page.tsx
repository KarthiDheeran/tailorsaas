"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createCustomer } from "@/lib/data/stub-data";
import {
  NewCustomerForm,
  type NewCustomerFormValues,
} from "@/components/orders/new-customer-form";

export default function AddCustomerPage() {
  const router = useRouter();

  function handleSaveCustomer(values: NewCustomerFormValues) {
    const customer = createCustomer(values);
    router.push(`/customers/${customer.id}`);
  }

  function handleSaveAndNewOrder(values: NewCustomerFormValues) {
    const customer = createCustomer(values);
    router.push(`/orders/new?customerId=${customer.id}`);
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <Link
        href="/customers"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Customers
      </Link>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Add Customer</h1>
        <p className="text-sm text-ink-muted">
          Create a new customer record
        </p>
      </div>
      <div className="max-w-2xl">
        <NewCustomerForm
          onSubmit={handleSaveCustomer}
          onCancel={() => router.push("/customers")}
          secondaryAction={{
            label: "Save & New Order",
            onSubmit: handleSaveAndNewOrder,
          }}
          title="Customer Details"
          submitLabel="Save Customer"
        />
      </div>
    </div>
  );
}
