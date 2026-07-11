"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import {
  getCustomerAreasAction,
  getCustomerListRowsAction,
} from "@/app/(shell)/customers/actions";
import type { CustomerListRow } from "@/lib/customers-db";
import { CustomersTable } from "@/components/customers/customers-table";
import {
  CustomerFilters,
  type CustomerFilterState,
} from "@/components/customers/customer-filters";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";

const EMPTY_FILTERS: CustomerFilterState = {
  query: "",
  area: "",
  balance: "all",
  activity: "all",
};

function CustomersPageContent() {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const [filters, setFilters] = useState<CustomerFilterState>(EMPTY_FILTERS);
  const [allRows, setAllRows] = useState<CustomerListRow[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see orders-table.tsx's formatDate note).
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCustomerListRowsAction(todayIso), getCustomerAreasAction()])
      .then(([rows, areaList]) => {
        if (cancelled) return;
        setAllRows(rows);
        setAreas(areaList);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = allRows.filter((row) => {
    const query = filters.query.trim();
    if (query) {
      const lowerQuery = query.toLowerCase();
      const matchesName = row.customer.name.toLowerCase().includes(lowerQuery);
      const matchesPhone = row.customer.phone.includes(query);
      const matchesNumber = row.customer.customerNumber
        .toLowerCase()
        .includes(lowerQuery);
      if (!matchesName && !matchesPhone && !matchesNumber) return false;
    }
    if (filters.area && row.customer.area !== filters.area) return false;
    if (filters.balance === "has" && row.outstandingBalance <= 0) return false;
    if (filters.balance === "none" && row.outstandingBalance > 0) return false;
    if (filters.activity === "recent" && row.status !== "Active") return false;
    if (filters.activity === "inactive" && row.status !== "Inactive") {
      return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">
            {t("customers.title")}
          </h1>
          <p className="text-sm text-ink-muted">
            {allRows.length} {t("customers.onRecord")}
          </p>
        </div>
        {hasPermission("customers.create") && (
          <Link
            href="/customers/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
          >
            <UserPlus className="h-4 w-4" />
            {t("customers.addCustomer")}
          </Link>
        )}
      </div>

      <CustomerFilters filters={filters} areas={areas} onChange={setFilters} />

      {isLoading ? <LoadingState label={t("customers.title")} /> : <CustomersTable rows={rows} />}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <RequirePermission permission="customers.view">
      <CustomersPageContent />
    </RequirePermission>
  );
}
