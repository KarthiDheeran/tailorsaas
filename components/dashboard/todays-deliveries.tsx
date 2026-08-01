import Link from "next/link";
import type { Order } from "@/lib/types";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_DELIVERIES = 5;

export function TodaysDeliveries({
  orders,
  className,
}: {
  orders: Order[];
  className?: string;
}) {
  const visibleOrders = orders.slice(0, MAX_VISIBLE_DELIVERIES);
  const remainingCount = Math.max(orders.length - visibleOrders.length, 0);

  return (
    <div className={cn("flex flex-col rounded-xl border border-border-soft bg-white shadow-soft", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">
            Today&apos;s Deliveries
          </h2>
          <p className="text-[13px] text-ink-faint">Due today</p>
        </div>
        {orders.length > 0 && (
          <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">
            {orders.length}
          </span>
        )}
      </div>
      {orders.length === 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-5 text-sm">
          <p className="text-ink-muted">No deliveries due today.</p>
          <Link href="/delivery" className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            View delivery
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-border-soft">
            {visibleOrders.map((order) => {
              const customer = order.customerSnapshot;
              const itemsSummary = order.items
                .map((i) => `${i.particular} x${i.qty}`)
                .join(", ");
              return (
                <li
                  key={order.id}
                  className="flex flex-col gap-2.5 px-5 py-3 transition-colors hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <Link
                        href={`/orders?view=${order.id}`}
                        className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="truncate font-medium text-ink" title={customer?.name ?? "Unknown"}>
                        {customer?.name ?? "Unknown"}
                      </span>
                      {customer && (
                        <span className="text-xs text-ink-muted">{customer.phone}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-muted" title={itemsSummary}>
                      {itemsSummary}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    {order.balance > 0 ? (
                      <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
                        {formatCurrency(order.balance)}
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-chip-mint px-3 py-1 text-xs font-semibold text-chip-mint-fg">
                        Paid
                      </span>
                    )}
                    {customer && (
                      <ContactActions
                        phone={customer.phone}
                        message={`Hi ${customer.name}, your order ${order.orderNumber} is ready for delivery today.`}
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
                ? `${remainingCount} more due today`
                : "Showing all deliveries"}
            </span>
            <Link href="/delivery" className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              View delivery
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
