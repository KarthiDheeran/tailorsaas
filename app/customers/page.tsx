"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCustomerAreas, getCustomerListRows } from "@/lib/customers";
import { CustomersTable } from "@/components/customers/customers-table";
import {
  CustomerFilters,
  type CustomerFilterState,
} from "@/components/customers/customer-filters";

const EMPTY_FILTERS: CustomerFilterState = {
  phoneQuery: "",
  nameQuery: "",
  area: "",
  hasBalance: false,
  recentOnly: false,
  inactiveOnly: false,
};

export default function CustomersPage() {
  const [filters, setFilters] = useState<CustomerFilterState>(EMPTY_FILTERS);

  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see orders-table.tsx's formatDate note).
  const todayIso = new Date().toISOString().slice(0, 10);
  const allRows = getCustomerListRows(todayIso);
  const areas = getCustomerAreas();

  const rows = allRows.filter((row) => {
    const phoneQuery = filters.phoneQuery.trim();
    const nameQuery = filters.nameQuery.trim().toLowerCase();
    if (phoneQuery && !row.customer.phone.includes(phoneQuery)) return false;
    if (nameQuery && !row.customer.name.toLowerCase().includes(nameQuery)) {
      return false;
    }
    if (filters.area && row.customer.area !== filters.area) return false;
    if (filters.hasBalance && row.outstandingBalance <= 0) return false;
    if (filters.recentOnly && row.status !== "Active") return false;
    if (filters.inactiveOnly && row.status !== "Inactive") return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Customers</h1>
          <p className="text-sm text-ink-muted">
            {allRows.length} customers on record
          </p>
        </div>
        <Link
          href="/customers/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
        >
          <UserPlus className="h-4 w-4" />
          Add Customer
        </Link>
      </div>

      <CustomerFilters filters={filters} areas={areas} onChange={setFilters} />

      <CustomersTable rows={rows} />
    </div>
  );
}
