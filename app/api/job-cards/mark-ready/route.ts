import { NextResponse } from "next/server";

import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getOrderById } from "@/lib/data/orders-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function missingCompletedStitchingUnitsForOrder(order: Order): Promise<number> {
  const admin = createAdminClient();
  const [
    { data: cardRows, error: cardsError },
    { data: earningRows, error: earningsError },
    { data: slipRows, error: slipsError },
  ] = await Promise.all([
    admin
      .from("job_cards")
      .select("id, order_item_serial_no, unit_no, cancelled")
      .eq("order_id", order.id),
    admin
      .from("staff_work_earnings")
      .select("job_card_id")
      .eq("order_id", order.id)
      .eq("task_type", "Stitching"),
    admin
      .from("job_card_stage_slips")
      .select("order_item_serial_no, unit_no, quantity")
      .eq("order_id", order.id)
      .eq("stage", "Stitching")
      .not("tallied_at", "is", null),
  ]);

  if (cardsError) throw cardsError;
  if (earningsError) throw earningsError;
  if (slipsError) throw slipsError;

  const completedJobCardIds = new Set(
    ((earningRows ?? []) as { job_card_id: string | null }[])
      .map((row) => row.job_card_id)
      .filter((id): id is string => Boolean(id))
  );
  const activeCardsByItem = new Map<number, { id: string; unit_no: number }[]>();
  for (const row of (cardRows ?? []) as {
    id: string;
    order_item_serial_no: number | null;
    unit_no: number | null;
    cancelled: boolean | null;
  }[]) {
    if (row.cancelled || row.order_item_serial_no == null || row.unit_no == null) continue;
    const cards = activeCardsByItem.get(row.order_item_serial_no) ?? [];
    cards.push({ id: row.id, unit_no: row.unit_no });
    activeCardsByItem.set(row.order_item_serial_no, cards);
  }

  let missing = 0;
  for (const item of order.items) {
    const requiredUnits = Math.max(1, Number(item.qty) || 1);
    const completedSlipUnits = new Set<number>();
    for (const slip of (slipRows ?? []) as {
      order_item_serial_no: number | null;
      unit_no: number | null;
      quantity: number | null;
    }[]) {
      if (slip.order_item_serial_no !== item.serialNo || slip.unit_no == null) continue;
      const firstUnit = slip.unit_no;
      const lastUnit = Math.min(requiredUnits, firstUnit + Math.max(1, Number(slip.quantity) || 1) - 1);
      for (let unit = firstUnit; unit <= lastUnit; unit += 1) {
        completedSlipUnits.add(unit);
      }
    }
    if (completedSlipUnits.size >= requiredUnits) continue;

    const itemCards = (activeCardsByItem.get(item.serialNo) ?? []).filter(
      (card) => card.unit_no >= 1 && card.unit_no <= requiredUnits
    );
    if (itemCards.length === 0) {
      missing += requiredUnits - completedSlipUnits.size;
      continue;
    }
    missing += itemCards.filter(
      (card) => !completedSlipUnits.has(card.unit_no) && !completedJobCardIds.has(card.id)
    ).length;
  }
  return missing;
}

export async function POST(request: Request) {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) {
    return NextResponse.json({ success: false, error: guard.error }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    deliveryBin?: string;
  };
  if (!body.orderId) {
    return NextResponse.json({ success: false, error: "Order is required." }, { status: 400 });
  }

  const orderBefore = await getOrderById(supabase, body.orderId);
  if (!orderBefore) {
    return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  }
  if (orderBefore.status === "Cancelled" || orderBefore.status === "Delivered") {
    return NextResponse.json({
      success: false,
      error: "Cancelled or delivered orders cannot be marked ready.",
    }, { status: 400 });
  }

  try {
    const missingUnits = await missingCompletedStitchingUnitsForOrder(orderBefore);
    if (missingUnits > 0) {
      return NextResponse.json({
        success: false,
        error: `Cannot mark order ${orderBefore.orderNumber} ready or delivered: ${missingUnits} garment unit(s) still need a completed Stitching scan.`,
      }, { status: 400 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const todayIso = now.slice(0, 10);
    const { error: orderError } = await admin
      .from("orders")
      .update({
        status: "Ready",
        delivery_bin: body.deliveryBin?.trim() || null,
        updated_at: now,
      })
      .eq("id", body.orderId)
      .not("status", "in", '("Cancelled","Delivered")');
    if (orderError) throw orderError;

    const { error: cardsError } = await admin
      .from("job_cards")
      .update({
        current_stage: "Ready",
        order_status: "Ready",
        assigned_staff_id: null,
        completed_date: todayIso,
        updated_at: now,
      })
      .eq("order_id", body.orderId)
      .eq("cancelled", false);
    if (cardsError) throw cardsError;
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: errorMessage(error, "Could not mark the order ready."),
    }, { status: 500 });
  }

  const order = await getOrderById(supabase, body.orderId);
  return NextResponse.json(order ? { success: true, data: order } : {
    success: false,
    error: "Order not found.",
  }, { status: order ? 200 : 404 });
}
