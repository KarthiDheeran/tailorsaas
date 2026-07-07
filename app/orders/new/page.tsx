"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  createCustomer,
  createOrder,
  getCustomerById,
  getOrdersForCustomer,
} from "@/lib/data/stub-data";
import type { Customer } from "@/lib/types";
import { CustomerSearch } from "@/components/orders/customer-search";
import {
  NewCustomerForm,
  type NewCustomerFormValues,
} from "@/components/orders/new-customer-form";
import { OrderForm, type OrderFormValues } from "@/components/orders/order-form";

type Step = "search" | "new-customer" | "order";

function NewOrderFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customerId");
  const prefillCustomer = prefillCustomerId
    ? getCustomerById(prefillCustomerId) ?? null
    : null;

  const [step, setStep] = useState<Step>(prefillCustomer ? "order" : "search");
  const [customer, setCustomer] = useState<Customer | null>(prefillCustomer);

  function handleSelectCustomer(selected: Customer) {
    setCustomer(selected);
    setStep("order");
  }

  function handleCreateCustomer(values: NewCustomerFormValues) {
    const newCustomer = createCustomer(values);
    setCustomer(newCustomer);
    setStep("order");
  }

  function handleOrderSubmit(data: OrderFormValues) {
    if (!customer) return;
    createOrder({ customerId: customer.id, ...data });
    router.push("/orders");
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <button
        onClick={() => router.push("/orders")}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Orders
      </button>

      <h1 className="mb-1 text-[26px] font-semibold text-ink">New Order</h1>
      <p className="mb-6 text-sm text-ink-muted">
        {step === "search" &&
          "Search for an existing customer, or create a new one."}
        {step === "new-customer" && "Enter the new customer's details."}
        {step === "order" && "Add order items, dates, and payment."}
      </p>

      {step === "search" && (
        <div className="space-y-4">
          <CustomerSearch onSelect={handleSelectCustomer} />
          <button
            onClick={() => setStep("new-customer")}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            + New Customer
          </button>
        </div>
      )}

      {step === "new-customer" && (
        <NewCustomerForm
          onSubmit={handleCreateCustomer}
          submitLabel="Create Customer & Continue"
        />
      )}

      {step === "order" && customer && (
        <div className="space-y-5">
          <CustomerBanner customer={customer} />
          <PreviousOrdersPanel customerId={customer.id} />
          <OrderForm customer={customer} onSubmit={handleOrderSubmit} />
        </div>
      )}
    </div>
  );
}

function CustomerBanner({ customer }: { customer: Customer }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <p className="font-medium text-ink">{customer.name}</p>
      <p className="text-sm text-ink-muted">
        {customer.phone} · {customer.area} · {customer.gender}
      </p>
    </div>
  );
}

function PreviousOrdersPanel({ customerId }: { customerId: string }) {
  const previousOrders = getOrdersForCustomer(customerId);
  if (previousOrders.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h3 className="mb-3 text-[17px] font-semibold text-ink">Previous Orders</h3>
      <div className="space-y-2">
        {previousOrders.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between text-sm"
          >
            <span className="font-semibold text-primary">{o.orderNumber}</span>
            <span className="text-ink-muted">{o.orderDate}</span>
            <span className="text-ink-muted">
              {o.items.map((i) => `${i.particular} x${i.qty}`).join(", ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrderFlow />
    </Suspense>
  );
}
