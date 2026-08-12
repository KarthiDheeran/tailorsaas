import { NextResponse } from "next/server";

import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getOrderById } from "@/lib/data/orders-db";
import { createClient as createServerClient } from "@/lib/supabase/server";

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return error instanceof Error ? error.message : fallback;
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
    const { error } = await supabase.rpc("mark_order_ready_with_bin", {
      p_order_id: body.orderId,
      p_delivery_bin: body.deliveryBin?.trim() || null,
    });
    if (error) throw error;
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
