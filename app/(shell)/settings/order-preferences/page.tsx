"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Save } from "lucide-react";
import {
  getOrderPreferencesAction,
  saveOrderPreferencesAction,
} from "@/app/(shell)/settings/order-preferences/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import {
  DEFAULT_SHOP_ORDER_PREFERENCES,
  type ShopOrderPreferences,
} from "@/lib/data/shop-order-preferences-db";
import { clearNewOrderPreferences } from "@/lib/new-order-reference-browser-cache";

function OrderPreferencesContent() {
  const { hasPermission, currentUserId } = useCurrentUser();
  const canManage = hasPermission("settings.manageShop");
  const [preferences, setPreferences] = useState<ShopOrderPreferences>(DEFAULT_SHOP_ORDER_PREFERENCES);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrderPreferencesAction()
      .then((result) => {
        if (cancelled) return;
        setPreferences(result.preferences);
        setEnabled(result.enabled);
      })
      .catch((reason) => !cancelled && setError(getErrorMessage(reason, "Failed to load order preferences.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const result = await saveOrderPreferencesAction(preferences);
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPreferences(result.data);
    clearNewOrderPreferences(currentUserId);
    setSaved(true);
  }

  if (loading) return <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8"><LoadingState label="Loading order preferences..." /></div>;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link href="/settings" className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-soft bg-white px-3 text-sm font-semibold text-ink-muted shadow-soft hover:border-primary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-tint text-primary"><CalendarDays className="h-5 w-5" /></span>
        <div><h1 className="text-[26px] font-semibold text-ink">Order Delivery Defaults</h1><p className="text-sm text-ink-muted">Set the promised delivery date automatically for every new order.</p></div>
      </div>
      {error && <div className="mb-5"><LoadError message={error} /></div>}
      {!enabled && <div className="mb-5 rounded-lg border border-chip-peach bg-chip-peach px-4 py-3 text-sm font-medium text-chip-peach-fg">Order preferences migration is pending. New orders are currently using the default three-week promise.</div>}
      <form onSubmit={submit} className="rounded-xl border border-border-soft bg-white p-6 shadow-soft">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">Default delivery lead time</span>
          <select value={preferences.defaultDeliveryLeadDays} disabled={!enabled || !canManage} onChange={(event) => { setPreferences({ defaultDeliveryLeadDays: Number(event.target.value) }); setSaved(false); }} className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint disabled:bg-surface-muted disabled:text-ink-faint">
            <option value={0}>Same day</option><option value={7}>1 week</option><option value={14}>2 weeks</option><option value={21}>3 weeks</option><option value={28}>4 weeks</option><option value={42}>6 weeks</option><option value={56}>8 weeks</option>
          </select>
          <span className="text-xs text-ink-muted">Example: choosing 3 weeks automatically sets a new order&apos;s delivery date to 21 days after its order date. Staff can still change an individual order&apos;s date.</span>
        </label>
        <div className="mt-6 flex items-center justify-between border-t border-border-soft pt-4"><p className="text-sm text-ink-muted">{saved ? "Saved. New orders will use this promise window." : "This never changes existing orders."}</p><button type="submit" disabled={!enabled || !canManage || saving} className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Delivery Default"}</button></div>
      </form>
    </div>
  );
}

export default function OrderPreferencesPage() {
  return <RequirePermission permission="settings.view"><OrderPreferencesContent /></RequirePermission>;
}
