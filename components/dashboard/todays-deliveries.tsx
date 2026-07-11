import type { Order } from "@/lib/types";
import { ContactActions } from "@/components/dashboard/contact-actions";

export function TodaysDeliveries({ orders }: { orders: Order[] }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="border-b border-border-soft px-5 py-4">
        <h2 className="text-[17px] font-semibold text-ink">
          Today&apos;s Deliveries
        </h2>
      </div>
      {orders.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-muted">
          No deliveries due today.
        </p>
      ) : (
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
              {orders.map((order) => {
                // Uses the order's own customerSnapshot (captured at
                // creation time) rather than a live customer lookup, so
                // Dashboard never needs customers.view just to load
                // (Phase 6E) — dashboard.view alone is sufficient.
                const customer = order.customerSnapshot;
                const itemsSummary = order.items
                  .map((i) => `${i.particular} x${i.qty}`)
                  .join(", ");
                return (
                  <tr
                    key={order.id}
                    className="border-t border-border-soft hover:bg-surface"
                  >
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                      {order.orderNumber}
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
                          ₹{order.balance.toLocaleString("en-IN")}
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
      )}
    </div>
  );
}
