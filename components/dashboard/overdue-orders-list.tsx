import type { Order } from "@/lib/types";
import { formatDate } from "@/components/orders/orders-table";
import { formatCurrency } from "@/lib/currency";

export function OverdueOrdersList({
  orders,
}: {
  orders: (Order & { daysLate: number })[];
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="border-b border-border-soft px-5 py-4">
        <h2 className="text-[17px] font-semibold text-ink">Overdue Orders</h2>
      </div>
      {orders.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-muted">
          No overdue orders. Nice work.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[13px] font-semibold text-ink-muted">
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
              {orders.map((order) => {
                // See todays-deliveries.tsx's comment: uses the order's own
                // customerSnapshot, no live customer lookup (Phase 6E).
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
                    <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                      {formatDate(order.deliveryDate)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="inline-block rounded-full bg-chip-red px-3 py-1 text-xs font-semibold text-chip-red-fg">
                        {order.daysLate}d late
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-muted">
                      {itemsSummary}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                      {formatCurrency(order.balance)}
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
