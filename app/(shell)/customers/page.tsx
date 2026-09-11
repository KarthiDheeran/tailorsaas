"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import {
  getCustomerAreasAction,
  getCustomerListPageRowsAction,
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
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { useDebouncedValue } from "@/components/ui/use-debounced-value";
import { downloadCsv } from "@/lib/csv";

const PAGE_SIZE = 25;

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
  const debouncedQuery = useDebouncedValue(filters.query);
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see orders-table.tsx's formatDate note).
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    getCustomerAreasAction().then((result) => {
      if (!cancelled) setAreas(result);
    }).catch(() => { /* Area suggestions are optional. */ });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    getCustomerListPageRowsAction({
      todayIso,
      page,
      pageSize: PAGE_SIZE,
      filters: {
        query: debouncedQuery,
        area: filters.area || undefined,
        balance: filters.balance,
        activity: filters.activity,
      },
    })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotalCount(result.totalCount);
        setAllCount(result.allCount);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getErrorMessage(error, "Failed to load customers."));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick, todayIso, page, debouncedQuery, filters.area, filters.balance, filters.activity]);

  function handleFiltersChange(next: CustomerFilterState) {
    setFilters(next);
    setPage(1);
  }

  const hasActiveFilters =
    filters.query.trim() !== "" ||
    filters.area !== "" ||
    filters.balance !== "all" ||
    filters.activity !== "all";
  const countLabel = hasActiveFilters
    ? `${totalCount} ${t("customers.of")} ${allCount} ${t(
        "customers.shown"
      )}`
    : `${allCount} ${t("customers.onRecord")}`;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2
  );

  async function handleExportCustomers() {
    const canViewPayments = hasPermission("orders.viewPayments");
    const exportRows = (
      await getCustomerListPageRowsAction({
        todayIso,
        page: 1,
        pageSize: 10000,
        filters: {
          query: filters.query,
          area: filters.area || undefined,
          balance: filters.balance,
          activity: filters.activity,
        },
      })
    ).rows;
    const headers = [
      "Customer No",
      "Name",
      "Phone",
      "Gender",
      "Area",
      "Total Orders",
      "Last Order",
      "Status",
      ...(canViewPayments ? ["Outstanding Balance"] : []),
    ];
    const csvRows = exportRows.map((row) => {
      const base = [
        row.customer.customerNumber,
        row.customer.name,
        row.customer.phone,
        row.customer.gender,
        row.customer.area,
        row.totalOrders,
        row.lastOrderDate ?? "",
        row.status,
      ];
      return canViewPayments ? [...base, row.outstandingBalance] : base;
    });

    downloadCsv(`customers-${todayIso}.csv`, headers, csvRows);
  }

  return (
    <div className="w-full max-w-none bg-[#f5f8ff] p-2 pb-4 sm:px-3 sm:py-2 lg:px-4 [&_table_td]:!px-2 [&_table_td]:!py-1.5 [&_table_th]:!px-2 [&_table_th]:!py-1.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c9d7ea] bg-white px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
        <div>
          <h1 className="text-lg font-bold text-ink">
            {t("customers.title")}
          </h1>
          <p className="text-xs text-ink-muted">
            {countLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            onClick={handleExportCustomers}
            disabled={isLoading || totalCount === 0}
            label={t("reports.exportCsv")}
          />
          {hasPermission("customers.create") && (
            <Link
              href="/customers/new"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              <UserPlus className="h-4 w-4" />
              {t("customers.addCustomer")}
            </Link>
          )}
        </div>
      </div>

      <CustomerFilters filters={filters} areas={areas} onChange={handleFiltersChange} />

      {loadError ? <LoadError message={loadError} onRetry={() => setRetryTick((tick) => tick + 1)} /> : isLoading ? <LoadingState label="Loading customers..." /> : <CustomersTable rows={rows} />}
      {!isLoading && totalCount > 0 && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {t("common.showing")} {rangeStart} {t("common.to")} {rangeEnd}{" "}
            {t("common.of")} {totalCount}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:enabled:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageNumbers.map((n, index) => (
              <span key={`${n}-${index}`} className="contents">
                {index > 0 && n - pageNumbers[index - 1] > 1 && (
                  <span className="px-1 text-ink-faint">...</span>
                )}
                <button
                  onClick={() => setPage(n)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                    n === page
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-ink hover:bg-surface-muted"
                  }`}
                >
                  {n}
                </button>
              </span>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:enabled:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
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
