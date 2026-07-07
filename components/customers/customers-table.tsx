"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Plus, Pencil, Inbox } from "lucide-react";
import { formatDate } from "@/components/orders/orders-table";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { CustomerStatusBadge } from "@/components/customers/status-badge";
import type { CustomerListRow } from "@/lib/customers";

export function CustomersTable({ rows }: { rows: CustomerListRow[] }) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">
          No customers match these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Customer</th>
            <th className="whitespace-nowrap px-5 py-3">Phone</th>
            <th className="whitespace-nowrap px-5 py-3">Area</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Total Orders
            </th>
            <th className="whitespace-nowrap px-5 py-3">Last Order</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Outstanding
            </th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map(
            ({
              customer,
              totalOrders,
              lastOrderDate,
              outstandingBalance,
              status,
            }) => (
              <tr
                key={customer.id}
                onClick={() => router.push(`/customers/${customer.id}`)}
                className="cursor-pointer border-t border-border-soft transition-colors hover:bg-surface"
              >
                <td className="whitespace-nowrap px-5 py-3">
                  <Link
                    href={`/customers/${customer.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-ink hover:text-primary hover:underline"
                  >
                    {customer.name}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {customer.customerNumber}
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {customer.phone}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {customer.area}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                  {totalOrders}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {lastOrderDate ? formatDate(lastOrderDate) : "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                  {outstandingBalance > 0
                    ? `₹${outstandingBalance.toLocaleString("en-IN")}`
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <CustomerStatusBadge status={status} />
                </td>
                <td
                  className="whitespace-nowrap px-5 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/customers/${customer.id}`}
                      title="View Customer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/orders/new?customerId=${customer.id}`}
                      title="New Order"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                    <ContactActions
                      phone={customer.phone}
                      message={`Hi ${customer.name}, `}
                    />
                    <Link
                      href={`/customers/${customer.id}/edit`}
                      title="Edit Customer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
