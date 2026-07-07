import type { Order } from "@/lib/types";
import { getCustomerById } from "@/lib/data/stub-data";
import { formatDate } from "@/components/orders/orders-table";
import { ContactActions } from "@/components/dashboard/contact-actions";

export function PaymentPending({ orders }: { orders: Order[] }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="border-b border-border-soft px-5 py-4">
        <h2 className="text-[17px] font-semibold text-ink">
          Payment Pending
        </h2>
      </div>
      {orders.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-muted">
          No outstanding balances.
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {orders.map((order) => {
            const customer = getCustomerById(order.customerId);
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
                    Due since {formatDate(order.deliveryDate)} · Paid ₹
                    {order.advancePaid.toLocaleString("en-IN")} of ₹
                    {order.totalAmount.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
                    ₹{order.balance.toLocaleString("en-IN")}
                  </span>
                  {customer && (
                    <ContactActions
                      phone={customer.phone}
                      message={`Hi ${customer.name}, your order ${order.orderNumber} has a pending balance of ₹${order.balance.toLocaleString("en-IN")}.`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
