import type { Order } from "@/lib/types";

export function isActiveOrder(order: Pick<Order, "status">): boolean {
  return order.status !== "Cancelled";
}

export function isReceivableOrder(order: Pick<Order, "status" | "balance">): boolean {
  return isActiveOrder(order) && order.balance > 0;
}

export function orderBalance(order: Pick<Order, "status" | "balance">): number {
  return isActiveOrder(order) ? Math.max(order.balance, 0) : 0;
}

