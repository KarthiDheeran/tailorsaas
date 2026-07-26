import Link from "next/link";
import type { Order } from "@/lib/types";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { formatCurrency } from "@/lib/currency";

const MAX_VISIBLE_DELIVERIES = 5;

export function TodaysDeliveries({ orders }: { orders: Order[] }) {
  const visibleOrders = orders.slice(0, MAX_VISIBLE_DELIVERIES);
  const remainingCount = Math.max(orders.length - visibleOrders.length, 0);

  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
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
          <Link href="/delivery" className="font-semibold text-primary hover:underline">
            View delivery
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[13px] font-semibold text-ink-muted">
                <tr className="border-b border-border-soft">
                  <th className="whitespace-nowrap px-5 py-2.5">Order No</th>
                  <th className="whitespace-nowrap px-5 py-2.5">Customer</th>
                  <th className="px-5 py-2.5">Items</th>
                  <th className="whitespace-nowrap px-5 py-2.5 text-right">
                    Balance
                  </th>
                  <th className="whitespace-nowrap px-5 py-2.5 text-right">
                    Action
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
                      className="border-t border-border-soft hover:bg-surface"
                    >
                      <td className="whitespace-nowrap px-5 py-3">
                        <Link
                          href={`/orders?view=${order.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <div className="text-ink">
                          {customer?.name ?? "Unknown"}
                        </div>
                        {customer && (
                          <div className="text-xs text-ink-muted">
                            {customer.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-ink-muted">
                        {itemsSummary}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {order.balance > 0 ? (
                          <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
                            {formatCurrency(order.balance)}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-chip-mint px-3 py-1 text-xs font-semibold text-chip-mint-fg">
                            Paid
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {customer && (
                          <ContactActions
                            phone={customer.phone}
                            message={`Hi ${customer.name}, your order ${order.orderNumber} is ready for delivery today.`}
                            contextType="Order"
                            contextId={order.id}
                          />
                        )}
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
                ? `${remainingCount} more due today`
                : "Showing all deliveries"}
            </span>
            <Link href="/delivery" className="font-semibold text-primary hover:underline">
              View delivery
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
