"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Pencil, Printer } from "lucide-react";
import type { Order } from "@/lib/types";
import { getCustomerById } from "@/lib/data/stub-data";
import {
  formatDate,
  OrderStatusEditor,
  BalanceBadge,
} from "@/components/orders/orders-table";
import { ContactActions } from "@/components/dashboard/contact-actions";

// Print routes are opened in the SAME tab (client-side <Link> navigation),
// not a new tab, deliberately: stub-data's in-memory orders/customers arrays
// only live in this browser tab's JS session (see lib/data/stub-data.ts) —
// a genuinely new tab would re-run from seed data and could show "order not
// found" for any order created this session. Same-tab Link navigation keeps
// the existing in-memory state intact.
function PrintMenu({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
      >
        <Printer className="h-3.5 w-3.5" />
        Print
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute bottom-full right-0 z-20 mb-1 w-48 overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
            <li>
              <Link
                href={`/orders/${orderId}/print/customer`}
                className="block px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface"
              >
                Customer Receipt
              </Link>
            </li>
            <li>
              <Link
                href={`/orders/${orderId}/print/job-card`}
                className="block px-4 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface"
              >
                Tailor Job Card
              </Link>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}

export function OrderDetailsDrawer({
  order,
  onClose,
  onStatusChange,
  onEdit,
}: {
  order: Order | null;
  onClose: () => void;
  onStatusChange: () => void;
  onEdit: (order: Order) => void;
}) {
  const customer = order ? getCustomerById(order.customerId) : undefined;
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          order ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft transition-transform duration-300 ease-in-out sm:w-[420px] ${
          order ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {order && (
          <>
            <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
              <div>
                <p className="text-[17px] font-semibold text-ink">
                  {order.orderNumber}
                </p>
                <div className="mt-1.5">
                  <OrderStatusEditor
                    order={order}
                    onStatusChange={onStatusChange}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 px-6 py-5">
              <div>
                <p className="text-[13px] font-medium text-ink-muted">
                  Customer
                </p>
                {customer ? (
                  <Link
                    href={`/customers/${customer.id}`}
                    className="mt-1 block text-sm font-semibold text-ink hover:text-primary hover:underline"
                  >
                    {customer.name}
                  </Link>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-ink">Unknown</p>
                )}
                {customer && (
                  <p className="text-sm text-ink-muted">{customer.phone}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[13px] font-medium text-ink-muted">
                    Order Date
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {formatDate(order.orderDate)}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-ink-muted">
                    Delivery Date
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {formatDate(order.deliveryDate)}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-muted">
                  Items
                </p>
                <div className="overflow-hidden rounded-lg border border-border-soft">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface text-[12px] font-semibold text-ink-muted">
                      <tr>
                        <th className="px-3 py-2">Particular</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr
                          key={item.serialNo}
                          className="border-t border-border-soft"
                        >
                          <td className="px-3 py-2 text-ink">
                            {item.particular}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-muted">
                            {item.qty}
                          </td>
                          <td className="px-3 py-2 text-right text-ink-muted">
                            ₹{item.rate.toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2 text-right text-ink">
                            ₹{item.amount.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg bg-surface p-4">
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-muted">Total</span>
                  <span className="text-sm font-semibold text-ink">
                    ₹{order.totalAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-muted">Paid</span>
                  <span className="text-sm font-semibold text-ink">
                    ₹{order.advancePaid.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-muted">Balance</span>
                  <span className="text-sm font-semibold text-ink">
                    ₹{order.balance.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-muted">
                    Payment Status
                  </span>
                  <BalanceBadge order={order} todayIso={todayIso} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
              <button
                type="button"
                onClick={() => onEdit(order)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Order
              </button>
              <PrintMenu orderId={order.id} />
              {customer && (
                <ContactActions
                  phone={customer.phone}
                  message={`Hi ${customer.name}, regarding your order ${order.orderNumber}.`}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
