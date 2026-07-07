import type { Order } from "@/lib/types";
import { getCustomerById } from "@/lib/data/stub-data";
import { formatDate } from "@/components/orders/orders-table";
import { ContactActions } from "@/components/dashboard/contact-actions";

export function TrialQueue({ orders }: { orders: Order[] }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="border-b border-border-soft px-5 py-4">
        <h2 className="text-[17px] font-semibold text-ink">Trial Queue</h2>
        <p className="text-[13px] text-ink-faint">Next 7 days</p>
      </div>
      {orders.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-muted">
          No trials scheduled this week.
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {orders.map((order) => {
            const customer = getCustomerById(order.customerId);
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
                    <span className="font-semibold text-primary">
                      {order.orderNumber}
                    </span>
                    <span className="text-ink">
                      {customer?.name ?? "Unknown"}
                    </span>
                  </div>
                  <div className="text-xs text-ink-muted">
                    {formatDate(order.trialDate)} · {itemsSummary}
                  </div>
                </div>
                {customer && (
                  <ContactActions
                    phone={customer.phone}
                    message={`Hi ${customer.name}, your trial for order ${order.orderNumber} is scheduled on ${formatDate(order.trialDate)}.`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
