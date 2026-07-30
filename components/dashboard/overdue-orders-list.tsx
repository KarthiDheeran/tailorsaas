import Link from "next/link";
import type { Order } from "@/lib/types";
import { formatDate } from "@/components/orders/orders-table";
import { formatCurrency } from "@/lib/currency";

const MAX_VISIBLE_OVERDUE = 5;

export function OverdueOrdersList({
  orders,
}: {
  orders: (Order & { daysLate: number })[];
}) {
  const visibleOrders = orders.slice(0, MAX_VISIBLE_OVERDUE);
  const remainingCount = Math.max(orders.length - visibleOrders.length, 0);

  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Overdue Orders</h2>
          <p className="text-[13px] text-ink-faint">Most overdue first</p>
        </div>
        {orders.length > 0 && (
          <span className="rounded-full bg-chip-red px-3 py-1 text-xs font-semibold text-chip-red-fg">
            {orders.length}
          </span>
        )}
      </div>
      {orders.length === 0 ? (
        <p className="px-5 py-5 text-center text-sm text-ink-muted">
          No overdue orders. Nice work.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-left">
              <thead className="bg-surface-muted/70 text-[13px] font-semibold text-ink-muted">
                <tr className="border-b border-border-soft">
                  <th className="whitespace-nowrap px-5 py-2.5">Order No</th>
                  <th className="whitespace-nowrap px-5 py-2.5">Customer</th>
                  <th className="whitespace-nowrap px-5 py-2.5">
                    Delivery Date
                  </th>
                  <th className="whitespace-nowrap px-5 py-2.5">Days Late</th>
                  <th className="px-5 py-2.5">Items</th>
                  <th className="whitespace-nowrap px-5 py-2.5 text-right">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {visibleOrders.map((order) => {
                  const customer = order.customerSnapshot;
                  const itemsSummary = order.items
                    .map((i) => `${i.particular} x${i.qty}`)
                    .join(", ");
                  return (
                    <tr
                      key={order.id}
                      className="border-t border-border-soft transition-colors hover:bg-surface-muted"
                    >
                      <td className="whitespace-nowrap px-5 py-3">
                        <Link
                          href={`/orders?view=${order.id}`}
                          className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <div className="max-w-[150px] truncate text-ink" title={customer?.name ?? "Unknown"}>
                          {customer?.name ?? "Unknown"}
                        </div>
                        {customer && (
                          <div className="text-xs text-ink-muted">
                            {customer.phone}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                        {formatDate(order.deliveryDate)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span className="inline-block rounded-full bg-chip-red px-3 py-1 text-xs font-semibold text-chip-red-fg">
                          {order.daysLate}d late
                        </span>
                      </td>
                      <td className="max-w-[250px] px-5 py-3 text-ink-muted">
                        <span className="block truncate" title={itemsSummary}>{itemsSummary}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">
                        {formatCurrency(order.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border-soft px-5 py-3 text-[13px]">
            <span className="text-ink-muted">
              {remainingCount > 0
                ? `${remainingCount} more overdue`
                : "Showing all overdue orders"}
            </span>
            <Link href="/orders" className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              View all
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
