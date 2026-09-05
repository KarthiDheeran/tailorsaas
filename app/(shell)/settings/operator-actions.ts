"use server";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerCallerContext } from "@/lib/auth/require-server-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStaffOptions } from "@/lib/data/staff-db";
import { getSharedDesktopOperatorMode, type ActiveSharedDesktopOperator } from "@/lib/shared-desktop-operator";

const COOKIE = "newlook_active_operator";
export type ActiveOperator = ActiveSharedDesktopOperator;
function verifyPin(pin: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const actual = Buffer.from(scryptSync(pin, salt, 32).toString("hex"), "hex");
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getOperatorModeAction() {
  const supabase = createServerClient();
  const context = await getServerCallerContext(supabase);
  if (!context) return { enabled: false, idleMinutes: 30 };
  return getSharedDesktopOperatorMode();
}

export async function getActiveOperatorStaffAction() {
  const supabase = createServerClient();
  if (!(await getServerCallerContext(supabase))) {
    return { success: false as const, error: "Sign in before selecting an operator." };
  }
  try {
    const staff = await getStaffOptions(createAdminClient(), { activeOnly: true });
    return {
      success: true as const,
      data: staff.map((member) => ({
        id: member.id,
        name: member.name,
        staff_number: member.staffNumber,
        staff_code: member.staffCode,
        can_take_measurements: member.canTakeMeasurements,
        can_create_orders: member.canCreateOrders,
      })),
    };
  } catch {
    return { success: false as const, error: "Could not load active staff. Please check the Staff list and try again." };
  }
}

export async function setOperatorPinAction(staffId: string, pin: string) {
  const supabase = createServerClient();
  const context = await getServerCallerContext(supabase);
  if (!context?.permissions.includes("staff.manage")) {
    return { success: false as const, error: "Only an owner or staff manager can set an operator PIN." };
  }
  if (!/^[0-9]{4,8}$/.test(pin)) {
    return { success: false as const, error: "Enter a 4 to 8 digit PIN." };
  }

  const salt = randomBytes(16).toString("hex");
  const pinHash = `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
  const { data, error } = await createAdminClient()
    .from("staff")
    .update({ operator_pin_hash: pinHash, operator_pin_updated_at: new Date().toISOString() })
    .eq("id", staffId)
    .select("id")
    .maybeSingle();
  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("operator_pin_hash")) {
      return { success: false as const, error: "Shared Operator migration 0063 has not been applied in Supabase yet." };
    }
    return { success: false as const, error: "Could not save the operator PIN." };
  }
  if (!data) return { success: false as const, error: "Staff member not found." };
  return { success: true as const };
}

export async function startOperatorSessionAction(staffId: string, pin: string) {
  const supabase = createServerClient();
  const context = await getServerCallerContext(supabase);
  if (!context) return { success: false as const, error: "Sign in before selecting an operator." };
  if (!/^\d{4,8}$/.test(pin)) return { success: false as const, error: "Enter a 4 to 8 digit PIN." };
  const admin = createAdminClient();
  const { data: staff, error: staffError } = await admin.from("staff").select("id,name,status,operator_pin_hash").eq("id", staffId).maybeSingle();
  if (staffError) {
    const message = `${staffError.message ?? ""} ${staffError.details ?? ""}`.toLowerCase();
    if (message.includes("operator_pin_hash")) {
      return { success: false as const, error: "Shared Operator migration 0063 has not been applied in Supabase yet." };
    }
    return { success: false as const, error: "Could not load the selected staff member." };
  }
  if (!staff || staff.status !== "Active") return { success: false as const, error: "Choose an active staff member." };
  if (!staff.operator_pin_hash) {
    if (!context.permissions.includes("staff.manage")) return { success: false as const, error: "Owner must set this staff PIN first." };
    const salt = randomBytes(16).toString("hex");
    await admin.from("staff").update({ operator_pin_hash: `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`, operator_pin_updated_at: new Date().toISOString() }).eq("id", staff.id);
  } else if (!verifyPin(pin, staff.operator_pin_hash)) return { success: false as const, error: "Incorrect staff PIN." };
  const mode = await getSharedDesktopOperatorMode();
  const expiresAt = new Date(Date.now() + mode.idleMinutes * 60_000).toISOString();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await admin.from("shared_desktop_operator_sessions").insert({ token_hash: tokenHash, staff_id: staff.id, authenticated_by: context.userId, expires_at: expiresAt });
  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (error.code === "42501" && message.includes("shared_desktop_operator_sessions")) {
      return { success: false as const, error: "Operator session table permissions need to be applied in Supabase." };
    }
    if (message.includes("shared_desktop_operator_sessions") || message.includes("operator_pin_hash")) {
      return { success: false as const, error: "Shared Operator migration 0063 has not been applied in Supabase yet." };
    }
    return { success: false as const, error: error.message || "Could not start operator session." };
  }
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) });
  return { success: true as const, data: { id: staff.id, name: staff.name, expiresAt } };
}
