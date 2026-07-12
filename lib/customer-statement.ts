import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrderFinancialAdjustmentsForOrder,
  isMissingOrderFinancialAdjustmentsSchemaError,
} from "@/lib/data/order-financial-adjustments-db";
import { getOrdersForCustomer } from "@/lib/data/orders-db";
import { getPaymentsForOrder } from "@/lib/data/payments-db";
import { isActiveOrder } from "@/lib/order-finance";
import type { Customer, Order, OrderFinancialAdjustment, Payment } from "@/lib/types";

export type CustomerStatementRowType =
  | "Order"
  | "Payment"
  | "Discount"
  | "Extra Charge"
  | "Refund";

export interface CustomerStatementRow {
  id: string;
  date: string;
  createdAt: string;
  type: CustomerStatementRowType;
  orderId: string;
  orderNumber: string;
  invoiceNumber?: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface CustomerStatementSummary {
  activeOrders: number;
  itemCharges: number;
  discounts: number;
  extraCharges: number;
  billedTotal: number;
  payments: number;
  refunds: number;
  netPaid: number;
  outstandingBalance: number;
}

export interface CustomerStatement {
  customer: Customer;
  generatedAt: string;
  summary: CustomerStatementSummary;
  rows: CustomerStatementRow[];
}

function itemCharges(order: Pick<Order, "items">): number {
  return order.items.reduce((sum, item) => sum + item.amount, 0);
}

async function getAdjustmentsForOrderSafe(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderFinancialAdjustment[]> {
  try {
    return await getOrderFinancialAdjustmentsForOrder(supabase, orderId);
  } catch (error) {
    if (isMissingOrderFinancialAdjustmentsSchemaError(error)) return [];
    throw error;
  }
}

function orderDescription(order: Order): string {
  const garmentCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  const label = garmentCount === 1 ? "garment" : "garments";
  return `${garmentCount} ${label} billed`;
}

function paymentDescription(payment: Payment): string {
  return `${payment.paymentType} payment via ${payment.paymentMode}`;
}

function adjustmentDescription(adjustment: OrderFinancialAdjustment): string {
  if (adjustment.adjustmentType === "Refund") {
    return adjustment.paymentMode
      ? `${adjustment.reason} via ${adjustment.paymentMode}`
      : adjustment.reason;
  }
  return adjustment.reason;
}

export async function getCustomerStatement(
  supabase: SupabaseClient,
  customer: Customer
): Promise<CustomerStatement> {
  const orders = (await getOrdersForCustomer(supabase, customer.id)).filter(isActiveOrder);
  const orderLedgers = await Promise.all(
    orders.map(async (order) => {
      const [payments, adjustments] = await Promise.all([
        getPaymentsForOrder(supabase, order.id),
        getAdjustmentsForOrderSafe(supabase, order.id),
      ]);
      return {
        order,
        payments: payments.filter((payment) => !payment.voided),
        adjustments: adjustments.filter((adjustment) => !adjustment.voided),
      };
    })
  );

  const rows: Omit<CustomerStatementRow, "runningBalance">[] = [];

  for (const { order, payments, adjustments } of orderLedgers) {
    rows.push({
      id: `order-${order.id}`,
      date: order.orderDate,
      createdAt: order.createdAt ?? `${order.orderDate}T00:00:00.000Z`,
      type: "Order",
      orderId: order.id,
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber,
      description: orderDescription(order),
      debit: itemCharges(order),
      credit: 0,
    });

    for (const adjustment of adjustments) {
      const isCredit = adjustment.adjustmentType === "Discount";
      rows.push({
        id: `adjustment-${adjustment.id}`,
        date: adjustment.adjustmentDate,
        createdAt: adjustment.createdAt,
        type: adjustment.adjustmentType,
        orderId: order.id,
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoiceNumber,
        description: adjustmentDescription(adjustment),
        debit: isCredit ? 0 : adjustment.amount,
        credit: isCredit ? adjustment.amount : 0,
      });
    }

    for (const payment of payments) {
      rows.push({
        id: `payment-${payment.id}`,
        date: payment.paymentDate,
        createdAt: payment.createdAt,
        type: "Payment",
        orderId: order.id,
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoiceNumber,
        description: paymentDescription(payment),
        debit: 0,
        credit: payment.amount,
      });
    }
  }

  const chronologicalRows = rows
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .reduce<CustomerStatementRow[]>((acc, row) => {
      const previousBalance = acc[acc.length - 1]?.runningBalance ?? 0;
      acc.push({
        ...row,
        runningBalance: previousBalance + row.debit - row.credit,
      });
      return acc;
    }, []);

  const itemChargeTotal = orderLedgers.reduce(
    (sum, { order }) => sum + itemCharges(order),
    0
  );
  const adjustments = orderLedgers.flatMap(({ adjustments: orderAdjustments }) => orderAdjustments);
  const discounts = adjustments
    .filter((adjustment) => adjustment.adjustmentType === "Discount")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0);
  const extraCharges = adjustments
    .filter((adjustment) => adjustment.adjustmentType === "Extra Charge")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0);
  const refunds = adjustments
    .filter((adjustment) => adjustment.adjustmentType === "Refund")
    .reduce((sum, adjustment) => sum + adjustment.amount, 0);
  const payments = orderLedgers
    .flatMap(({ payments: orderPayments }) => orderPayments)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const billedTotal = Math.max(itemChargeTotal + extraCharges - discounts, 0);
  const netPaid = payments - refunds;
  const outstandingBalance = chronologicalRows.at(-1)?.runningBalance ?? 0;

  return {
    customer,
    generatedAt: new Date().toISOString(),
    summary: {
      activeOrders: orders.length,
      itemCharges: itemChargeTotal,
      discounts,
      extraCharges,
      billedTotal,
      payments,
      refunds,
      netPaid,
      outstandingBalance,
    },
    rows: chronologicalRows,
  };
}
