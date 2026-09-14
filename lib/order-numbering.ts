import type { GarmentSection } from "@/lib/catalog";
import type { Order } from "@/lib/types";

export function orderScanReference(order: Pick<Order, "orderNumber" | "orderSection" | "orderNumberYear" | "scanToken">): string {
  if (order.orderSection && order.orderNumberYear && /^\d+$/.test(order.orderNumber)) {
    return `${order.orderSection[0]}-${order.orderNumberYear}-${order.orderNumber}`;
  }
  return order.scanToken ? `TS|ORD|${order.scanToken}` : order.orderNumber;
}

export interface OrderNumberSequence {
  order_section: GarmentSection;
  numbering_year: number;
  next_number: number;
}
