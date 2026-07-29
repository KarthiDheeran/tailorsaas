import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "newlook_active_operator";

export type ActiveSharedDesktopOperator = {
  id: string;
  name: string;
  expiresAt: string;
};

export type SharedDesktopOperatorMode = {
  enabled: boolean;
  idleMinutes: number;
  operator?: ActiveSharedDesktopOperator;
  error?: string;
};

const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

/** Resolves only the current request's secure, HTTP-only operator session. */
export async function getSharedDesktopOperatorMode(): Promise<SharedDesktopOperatorMode> {
  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from("shop_billing_settings")
    .select("require_active_operator,operator_idle_minutes")
    .eq("id", true)
    .maybeSingle();

  // Keep the original workflow available when the optional migration/settings
  // are unavailable; no browser-controlled value is ever trusted here.
  if (settingsError) return { enabled: false, idleMinutes: 30 };

  const enabled = Boolean(settings?.require_active_operator);
  const idleMinutes = Number(settings?.operator_idle_minutes ?? 30);
  if (!enabled) return { enabled, idleMinutes };

  const token = cookies().get(COOKIE)?.value;
  if (!token) return { enabled, idleMinutes };

  const { data: session, error: sessionError } = await admin
    .from("shared_desktop_operator_sessions")
    .select("id,expires_at,staff:staff_id(id,name,status)")
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError) {
    return { enabled, idleMinutes, error: "Operator session storage is unavailable. Apply migration 0063." };
  }

  const staff = Array.isArray(session?.staff) ? session.staff[0] : session?.staff;
  if (!session || !staff || (staff as { status: string }).status !== "Active") return { enabled, idleMinutes };

  const expiresAt = new Date(Date.now() + idleMinutes * 60_000).toISOString();
  await admin
    .from("shared_desktop_operator_sessions")
    .update({ last_seen_at: new Date().toISOString(), expires_at: expiresAt })
    .eq("id", session.id);
  return {
    enabled,
    idleMinutes,
    operator: { id: (staff as { id: string }).id, name: (staff as { name: string }).name, expiresAt },
  };
}

/** Blocks a write only when the owner explicitly enabled shared-desktop mode. */
export async function requireActiveSharedDesktopOperator(): Promise<
  | { ok: true; operator?: ActiveSharedDesktopOperator }
  | { ok: false; error: string }
> {
  const mode = await getSharedDesktopOperatorMode();
  if (!mode.enabled) return { ok: true };
  if (mode.error) return { ok: false, error: mode.error };
  if (!mode.operator) return { ok: false, error: "Select an active operator before continuing." };
  return { ok: true, operator: mode.operator };
}

