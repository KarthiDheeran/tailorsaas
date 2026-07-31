"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, MapPin, Plus, Save } from "lucide-react";
import {
  createShopAction,
  getShopsAction,
  updateShopAction,
} from "@/app/(shell)/settings/shops/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { Select } from "@/components/ui/select";
import { GARMENT_SECTIONS, type GarmentSection } from "@/lib/catalog";
import type { Shop, ShopInput } from "@/lib/shops";
import { cn } from "@/lib/utils";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

const blankDraft: ShopInput = {
  name: "",
  location: "",
  allowedOrderSections: [...GARMENT_SECTIONS],
  active: true,
};

function SectionCheckboxes({
  value,
  onChange,
}: {
  value: GarmentSection[];
  onChange: (value: GarmentSection[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {GARMENT_SECTIONS.map((section) => (
        <label
          key={section}
          className="flex h-10 items-center gap-2 rounded-lg border border-border-soft px-3 text-sm"
        >
          <input
            type="checkbox"
            checked={value.includes(section)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? Array.from(new Set([...value, section]))
                  : value.filter((item) => item !== section)
              )
            }
          />
          {section}
        </label>
      ))}
    </div>
  );
}

function shopToInput(shop: Shop): ShopInput {
  return {
    name: shop.name,
    location: shop.location,
    allowedOrderSections: shop.allowedOrderSections,
    active: shop.active,
  };
}

function ShopsSettingsContent() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [draft, setDraft] = useState<ShopInput>(blankDraft);
  const [editing, setEditing] = useState<Record<string, ShopInput>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getShopsAction()
      .then((rows) => {
        if (!cancelled) setShops(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load shops.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedShops = useMemo(
    () => [...shops].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [shops]
  );

  async function createShop() {
    setError("");
    setCreating(true);
    const result = await createShopAction(draft);
    setCreating(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setShops((current) => [...current, result.data]);
    setDraft(blankDraft);
  }

  async function saveShop(shop: Shop) {
    const input = editing[shop.id] ?? shopToInput(shop);
    setError("");
    setSavingId(shop.id);
    const result = await updateShopAction(shop.id, input);
    setSavingId(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setShops((current) => current.map((item) => (item.id === shop.id ? result.data : item)));
    setEditing((current) => {
      const next = { ...current };
      delete next[shop.id];
      return next;
    });
  }

  function updateEditing(shop: Shop, patch: Partial<ShopInput>) {
    setEditing((current) => ({
      ...current,
      [shop.id]: { ...(current[shop.id] ?? shopToInput(shop)), ...patch },
    }));
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-soft bg-white px-3 text-sm font-semibold text-ink-muted shadow-soft transition-colors hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-tint text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Shops & Locations</h1>
          <p className="text-sm text-ink-muted">Create branches and choose which order sections each shop handles.</p>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">{error}</p>}

      <section className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-base font-semibold text-ink">Add Shop</h2>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium text-ink-muted">Shop name</span>
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="Men Shop" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[13px] font-medium text-ink-muted">Location</span>
            <input value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} className={inputClass} placeholder="Anna Nagar" />
          </label>
          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-ink-muted">Sections</span>
            <SectionCheckboxes value={draft.allowedOrderSections} onChange={(allowedOrderSections) => setDraft((current) => ({ ...current, allowedOrderSections }))} />
          </div>
          <button type="button" onClick={() => void createShop()} disabled={creating} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
            <Plus className="h-4 w-4" />
            {creating ? "Adding..." : "Add"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border-soft bg-white shadow-soft">
        <div className="border-b border-border-soft px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Existing Shops</h2>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-muted">Loading shops...</p>
        ) : (
          <div className="divide-y divide-border-soft">
            {sortedShops.map((shop) => {
              const current = editing[shop.id] ?? shopToInput(shop);
              const dirty = JSON.stringify(current) !== JSON.stringify(shopToInput(shop));
              return (
                <div key={shop.id} className={cn("grid gap-3 p-5 lg:grid-cols-[1fr_1fr_1.4fr_130px_auto] lg:items-end", !current.active && "bg-surface-muted")}>
                  <label className="space-y-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">Shop name</span>
                    <input value={current.name} onChange={(event) => updateEditing(shop, { name: event.target.value })} className={inputClass} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">Location</span>
                    <input value={current.location} onChange={(event) => updateEditing(shop, { location: event.target.value })} className={inputClass} placeholder="optional" />
                  </label>
                  <div className="space-y-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">Sections</span>
                    <SectionCheckboxes value={current.allowedOrderSections} onChange={(allowedOrderSections) => updateEditing(shop, { allowedOrderSections })} />
                  </div>
                  <label className="space-y-1.5">
                    <span className="text-[13px] font-medium text-ink-muted">Status</span>
                    <Select value={current.active ? "Active" : "Inactive"} onChange={(event) => updateEditing(shop, { active: event.target.value === "Active" })}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </Select>
                  </label>
                  <button type="button" onClick={() => void saveShop(shop)} disabled={!dirty || savingId === shop.id} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-50">
                    {dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    {savingId === shop.id ? "Saving..." : dirty ? "Save" : "Saved"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ShopsSettingsPage() {
  return (
    <RequirePermission permission="settings.manageShop">
      <ShopsSettingsContent />
    </RequirePermission>
  );
}
