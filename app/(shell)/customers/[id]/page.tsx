"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { ChevronLeft, FileText, Plus, Pencil } from "lucide-react";
import { getCustomerProfileBootstrapAction } from "@/app/(shell)/customers/actions";
import type { CatalogGarmentType } from "@/lib/catalog";
import type { CustomerDetail } from "@/lib/customers-db";
import type { Customer, GarmentMeasurement } from "@/lib/types";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { MeasurementsCard } from "@/components/customers/measurements-card";
import { PaymentSummaryCard } from "@/components/customers/payment-summary-card";
import { TailoringProfileCard } from "@/components/customers/tailoring-profile-card";
import { OrdersTable } from "@/components/orders/orders-table";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";
import { formatCurrency } from "@/lib/currency";

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
  const [measurements, setMeasurements] = useState<GarmentMeasurement[]>([]);
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [returningToCustomers, setReturningToCustomers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCustomerProfileBootstrapAction(params.id).then((data) => {
      if (cancelled) return;
      setCustomer(data.customer ?? null);
      setDetail(data.detail);
      setMeasurements(data.measurements);
      setGarmentTypes(data.garmentTypes);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loaded && !customer) {
    notFound();
  }

  if (!loaded || !customer || !detail) {
    return (
      <div className="w-full max-w-none bg-[#f5f8ff] p-2 sm:px-3 sm:py-2 lg:px-4">
        <LoadingState label="Loading customer profile..." />
      </div>
    );
  }

  return (
    <div className="w-full max-w-none bg-[#f5f8ff] p-2 pb-4 sm:px-3 sm:py-2 lg:px-4 [&_table_td]:!px-2 [&_table_td]:!py-1.5 [&_table_th]:!px-2 [&_table_th]:!py-1.5">
      <button
        onClick={() => {
          setReturningToCustomers(true);
          router.push("/customers");
        }}
        disabled={returningToCustomers}
        className="mb-2 flex h-8 items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
      >
        <ChevronLeft className="h-4 w-4" />
        {returningToCustomers ? "Opening..." : t("customers.backToCustomers")}
      </button>

      <div className="mb-2 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#c9d7ea] bg-white px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-ink">
              {customer.name}
            </h1>
            {canViewPayments && detail.outstandingBalance > 0 && (
              <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
                {formatCurrency(detail.outstandingBalance)} {t("customers.due")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {customer.customerNumber} · {customer.phone} · {customer.area}{" "}
            · {customer.gender}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{customer.address}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateOrder && (
            <Link
              href={`/orders/new?customerId=${customer.id}`}
              className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              <span>{t("customers.newOrder")}</span>
              <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold">
                Alt N
              </span>
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
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              title="Customer Statement"
            >
              <FileText className="h-3.5 w-3.5" />
            </Link>
          )}
          {canEdit && (
            <Link
              href={`/customers/${customer.id}/edit`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              title="Edit Customer Details"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2">
          <div>
            <h2 className="mb-1 px-1 text-sm font-bold text-ink">
              {t("customers.orderHistory")}
            </h2>
            <OrdersTable
              orders={detail.orders}
              customersById={{ [customer.id]: customer }}
              compact
            />
          </div>
          {canViewMeasurements && (
            <MeasurementsCard
              customer={customer}
              garmentTypes={garmentTypes}
              measurements={measurements}
            />
          )}
        </div>
        <div className="space-y-2">
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
