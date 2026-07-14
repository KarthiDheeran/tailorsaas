"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { ChevronLeft, FileText, Plus, Pencil } from "lucide-react";
import {
  getCustomerByIdAction,
  getCustomerDetailAction,
  getCustomerMeasurementsAction,
} from "@/app/(shell)/customers/actions";
import type { CustomerDetail } from "@/lib/customers-db";
import type { Customer, CustomerMeasurements } from "@/lib/types";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { MeasurementsCard } from "@/components/customers/measurements-card";
import { PaymentSummaryCard } from "@/components/customers/payment-summary-card";
import { TailoringProfileCard } from "@/components/customers/tailoring-profile-card";
import { OrdersTable } from "@/components/orders/orders-table";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

function CustomerProfilePageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canEdit = hasPermission("customers.edit");
  const canCreateOrder = hasPermission("orders.create");
  const canViewPayments = hasPermission("orders.viewPayments");
  const canViewMeasurements = hasPermission("customers.viewMeasurements");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | undefined>(undefined);
  const [measurements, setMeasurements] = useState<CustomerMeasurements | undefined>(
    undefined
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCustomerByIdAction(params.id),
      getCustomerDetailAction(params.id),
      getCustomerMeasurementsAction(params.id),
    ]).then(([c, d, m]) => {
      if (cancelled) return;
      setCustomer(c ?? null);
      setDetail(d);
      setMeasurements(m);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loaded && !customer) {
    notFound();
  }

  if (!customer || !detail) return null;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <button
        onClick={() => router.push("/customers")}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("customers.backToCustomers")}
      </button>

      <div className="mb-6 flex items-start justify-between rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-semibold text-ink">
              {customer.name}
            </h1>
            {canViewPayments && detail.outstandingBalance > 0 && (
              <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
                ₹{detail.outstandingBalance.toLocaleString("en-IN")}{" "}
                {t("customers.due")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {customer.customerNumber} · {customer.phone} · {customer.area}{" "}
            · {customer.gender}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{customer.address}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateOrder && (
            <Link
              href={`/orders/new?customerId=${customer.id}`}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              {t("customers.newOrder")}
            </Link>
          )}
          <ContactActions
            phone={customer.phone}
            message={`Hi ${customer.name}, `}
            contextType="Customer"
            contextId={customer.id}
          />
          {canViewPayments && (
            <Link
              href={`/customers/${customer.id}/statement`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              title="Customer statement"
            >
              <FileText className="h-3.5 w-3.5" />
            </Link>
          )}
          {canEdit && (
            <Link
              href={`/customers/${customer.id}/edit`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              title={t("common.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {canViewMeasurements && (
            <MeasurementsCard customer={customer} measurements={measurements} />
          )}
          <div>
            <h2 className="mb-3 text-[17px] font-semibold text-ink">
              {t("customers.orderHistory")}
            </h2>
            <OrdersTable
              orders={detail.orders}
              customersById={{ [customer.id]: customer }}
            />
          </div>
        </div>
        <div className="space-y-5">
          <TailoringProfileCard customer={customer} />
          {canViewPayments && <PaymentSummaryCard detail={detail} />}
        </div>
      </div>
    </div>
  );
}

export default function CustomerProfilePage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <RequirePermission permission="customers.view">
      <CustomerProfilePageContent params={params} />
    </RequirePermission>
  );
}
