"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Receipt, Save } from "lucide-react";
import {
  getBillingSettingsAction,
  saveBillingSettingsAction,
} from "@/app/(shell)/settings/billing/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint disabled:bg-surface disabled:text-ink-faint";
const textareaClass =
  "rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint disabled:bg-surface disabled:text-ink-faint";

function BillingSettingsContent() {
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("settings.manageShop");
  const [settings, setSettings] = useState<ShopBillingSettings>(
    DEFAULT_SHOP_BILLING_SETTINGS
  );
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBillingSettingsAction()
      .then((result) => {
        if (cancelled) return;
        setSettings(result.settings);
        setEnabled(result.enabled);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Failed to load billing settings."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function patch<K extends keyof ShopBillingSettings>(
    key: K,
    value: ShopBillingSettings[K]
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function patchNumber<K extends keyof ShopBillingSettings>(key: K, value: string) {
    patch(key, Math.max(0, Number(value) || 0) as ShopBillingSettings[K]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    const result = await saveBillingSettingsAction(settings);
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSettings(result.data);
    setSaved(true);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <LoadingState label="Loading billing settings..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-tint text-primary">
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Billing / Receipt</h1>
          <p className="text-sm text-ink-muted">
            Shop identity printed on customer receipts and tailor job cards.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5">
          <LoadError message={error} />
        </div>
      )}

      {!enabled && (
        <div className="mb-5 rounded-lg border border-chip-peach bg-chip-peach px-4 py-3 text-sm font-medium text-chip-peach-fg">
          Billing settings migration is pending. Receipts will use default shop
          details until <span className="font-semibold">supabase/migrations/0013_shop_billing_settings.sql</span> and <span className="font-semibold">supabase/migrations/0017_invoice_billing_hardening.sql</span> are applied.
        </div>
      )}

      {!canManage && (
        <div className="mb-5 rounded-lg border border-border-soft bg-white px-4 py-3 text-sm text-ink-muted shadow-soft">
          You can view these settings, but only an Admin with shop-settings access can edit them.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="border border-border-soft bg-white p-6 shadow-soft"
      >
        <div className="mb-5 border-b border-border-soft pb-2">
          <h2 className="text-base font-semibold text-ink">Shop Details</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Shop Name</span>
            <input
              value={settings.shopName}
              onChange={(e) => patch("shopName", e.target.value)}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Tagline</span>
            <input
              value={settings.tagline ?? ""}
              onChange={(e) => patch("tagline", e.target.value)}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Phone</span>
            <input
              value={settings.phone ?? ""}
              onChange={(e) => patch("phone", e.target.value)}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Email</span>
            <input
              value={settings.email ?? ""}
              onChange={(e) => patch("email", e.target.value)}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">GSTIN</span>
            <input
              value={settings.gstin ?? ""}
              onChange={(e) => patch("gstin", e.target.value.toUpperCase())}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-ink-muted">Address</span>
            <textarea
              rows={3}
              value={settings.address ?? ""}
              onChange={(e) => patch("address", e.target.value)}
              disabled={!enabled || !canManage}
              className={textareaClass}
            />
          </label>
        </div>

        <div className="mb-5 mt-8 border-b border-border-soft pb-2">
          <h2 className="text-base font-semibold text-ink">Invoice Numbering</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Receipt Prefix</span>
            <input
              value={settings.receiptPrefix}
              onChange={(e) => patch("receiptPrefix", e.target.value.toUpperCase())}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Invoice Prefix</span>
            <input
              value={settings.invoicePrefix}
              onChange={(e) => patch("invoicePrefix", e.target.value.toUpperCase())}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Next Invoice No</span>
            <input
              type="number"
              min={1}
              value={settings.nextInvoiceSequence}
              onChange={(e) => patchNumber("nextInvoiceSequence", e.target.value)}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Invoice Year</span>
            <input
              type="number"
              min={2000}
              value={settings.invoiceSequenceYear}
              onChange={(e) => patchNumber("invoiceSequenceYear", e.target.value)}
              disabled={!enabled || !canManage}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col justify-end gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-ink-muted">Next Invoice Preview</span>
            <div className="flex h-11 items-center rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold text-ink">
              {settings.invoicePrefix}-{settings.invoiceSequenceYear}-{String(settings.nextInvoiceSequence).padStart(4, "0")}
            </div>
          </div>
        </div>

        <div className="mb-5 mt-8 border-b border-border-soft pb-2">
          <h2 className="text-base font-semibold text-ink">Tax Display</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-white px-3.5 text-sm font-medium text-ink-muted">
            <input
              type="checkbox"
              checked={settings.taxEnabled}
              onChange={(e) => patch("taxEnabled", e.target.checked)}
              disabled={!enabled || !canManage}
              className="h-4 w-4 accent-primary"
            />
            Show tax split on receipt
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Tax Label</span>
            <input
              value={settings.taxLabel}
              onChange={(e) => patch("taxLabel", e.target.value.toUpperCase())}
              disabled={!enabled || !canManage || !settings.taxEnabled}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Tax Rate %</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={settings.taxRatePercent}
              onChange={(e) => patchNumber("taxRatePercent", e.target.value)}
              disabled={!enabled || !canManage || !settings.taxEnabled}
              className={inputClass}
            />
          </label>
          <p className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink-muted md:col-span-3">
            Tax is shown as an included split of the order total, so payment balances stay consistent.
          </p>
        </div>

        <div className="mb-5 mt-8 border-b border-border-soft pb-2">
          <h2 className="text-base font-semibold text-ink">Print Footer</h2>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-ink-muted">Receipt Footer Note</span>
            <textarea
              rows={2}
              value={settings.footerNote}
              onChange={(e) => patch("footerNote", e.target.value)}
              disabled={!enabled || !canManage}
              className={textareaClass}
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border-soft pt-4">
          <p className="text-sm text-ink-muted">
            {saved ? "Saved." : "These details appear on printed receipts and job cards."}
          </p>
          <button
            type="submit"
            disabled={!enabled || !canManage || saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BillingSettingsPage() {
  return (
    <RequirePermission permission="settings.view">
      <BillingSettingsContent />
    </RequirePermission>
  );
}
