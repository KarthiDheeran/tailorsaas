import Link from "next/link";
import type { Order } from "@/lib/types";
import { formatDate } from "@/components/orders/orders-table";
import { ContactActions } from "@/components/dashboard/contact-actions";

const MAX_VISIBLE_TRIALS = 5;

export function TrialQueue({ orders }: { orders: Order[] }) {
  const visibleOrders = orders.slice(0, MAX_VISIBLE_TRIALS);
  const remainingCount = Math.max(orders.length - visibleOrders.length, 0);

  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Trial Queue</h2>
          <p className="text-[13px] text-ink-faint">Next 7 days</p>
        </div>
        {orders.length > 0 && (
          <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">
            {orders.length}
          </span>
        )}
      </div>
      {orders.length === 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-5 text-sm">
          <p className="text-ink-muted">No trials scheduled this week.</p>
          <Link href="/calendar" className="font-semibold text-primary hover:underline">
            View calendar
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border-soft">
            {visibleOrders.map((order) => {
              const customer = order.customerSnapshot;
              const itemsSummary = order.items
                .map((i) => `${i.particular} x${i.qty}`)
                .join(", ");
              return (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px]">
                      <Link
                        href={`/orders?view=${order.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="truncate text-ink">
                        {customer?.name ?? "Unknown"}
                      </span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {formatDate(order.trialDate)} - {itemsSummary}
                    </div>
                  </div>
                  {customer && (
                    <ContactActions
                      phone={customer.phone}
                      message={`Hi ${customer.name}, your trial for order ${order.orderNumber} is scheduled on ${formatDate(order.trialDate)}.`}
                      contextType="Order"
                      contextId={order.id}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-border-soft px-5 py-3 text-[13px]">
            <span className="text-ink-muted">
              {remainingCount > 0
                ? `${remainingCount} more scheduled`
                : "Showing all trials"}
            </span>
            <Link href="/calendar" className="font-semibold text-primary hover:underline">
              View calendar
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
