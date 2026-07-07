"use client";

import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { ChevronLeft, Plus, Pencil } from "lucide-react";
import { getCustomerById, getCustomerMeasurements } from "@/lib/data/stub-data";
import { getCustomerDetail } from "@/lib/customers";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { MeasurementsCard } from "@/components/customers/measurements-card";
import { PaymentSummaryCard } from "@/components/customers/payment-summary-card";
import { OrdersTable } from "@/components/orders/orders-table";

export default function CustomerProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const customer = getCustomerById(params.id);

  if (!customer) {
    notFound();
  }

  const detail = getCustomerDetail(customer!);
  const measurements = getCustomerMeasurements(customer!.id);

  return (
    <div className="mx-auto max-w-7xl p-8">
      <button
        onClick={() => router.push("/customers")}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Customers
      </button>

      <div className="mb-6 flex items-start justify-between rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-semibold text-ink">
              {customer!.name}
            </h1>
            {detail.outstandingBalance > 0 && (
              <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
                ₹{detail.outstandingBalance.toLocaleString("en-IN")} due
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {customer!.customerNumber} · {customer!.phone} · {customer!.area}{" "}
            · {customer!.gender}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{customer!.address}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/orders/new?customerId=${customer!.id}`}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            New Order
          </Link>
          <ContactActions
            phone={customer!.phone}
            message={`Hi ${customer!.name}, `}
          />
          <Link
            href={`/customers/${customer!.id}/edit`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <MeasurementsCard customer={customer!} measurements={measurements} />
          <div>
            <h2 className="mb-3 text-[17px] font-semibold text-ink">
              Order History
            </h2>
            <OrdersTable orders={detail.orders} />
          </div>
        </div>
        <div className="space-y-5">
          <PaymentSummaryCard detail={detail} />
        </div>
      </div>
    </div>
  );
}
