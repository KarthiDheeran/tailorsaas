import Link from "next/link";
import type { Order } from "@/lib/types";
import { formatDate } from "@/components/orders/orders-table";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { formatCurrency } from "@/lib/currency";

const MAX_VISIBLE_PAYMENTS = 6;

export function PaymentPending({ orders }: { orders: Order[] }) {
  const visibleOrders = orders.slice(0, MAX_VISIBLE_PAYMENTS);
  const remainingCount = Math.max(orders.length - visibleOrders.length, 0);

  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">
            Pending Payments
          </h2>
          <p className="text-[13px] text-ink-faint">Oldest dues first</p>
        </div>
        {orders.length > 0 && (
          <span className="rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
            {orders.length}
          </span>
        )}
      </div>
      {orders.length === 0 ? (
        <p className="px-5 py-5 text-center text-sm text-ink-muted">
          No outstanding balances.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border-soft">
            {visibleOrders.map((order) => {
              const customer = order.customerSnapshot;
              return (
                <li
                  key={order.id}
                  className="flex flex-col gap-2.5 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px]">
                      <Link
                        href={`/orders?view=${order.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="truncate text-ink" title={customer?.name ?? "Unknown"}>
                        {customer?.name ?? "Unknown"}
                      </span>
                    </div>
                    <div className="truncate text-xs text-ink-muted" title={`Due since ${formatDate(order.deliveryDate)}`}>
                      Due since {formatDate(order.deliveryDate)} - Paid{" "}
                      {formatCurrency(order.advancePaid)} of{" "}
                      {formatCurrency(order.totalAmount)}
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
                    <span className="rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
                      {formatCurrency(order.balance)}
                    </span>
                    {customer && (
                      <ContactActions
                        phone={customer.phone}
                        message={`Hi ${customer.name}, your order ${order.orderNumber} has a pending balance of ${formatCurrency(order.balance)}.`}
                        contextType="Order"
                        contextId={order.id}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-border-soft px-5 py-3 text-[13px]">
            <span className="text-ink-muted">
              {remainingCount > 0
                ? `${remainingCount} more pending`
                : "Showing all pending payments"}
            </span>
            <Link href="/payments" className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              View all
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
