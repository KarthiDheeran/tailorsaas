"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Role } from "@/lib/roles";
import { GARMENT_SECTIONS, type GarmentSection } from "@/lib/catalog";
import type { Shop } from "@/lib/shops";
import { createClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/select";

const inputClass =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export interface CreateUserInput {
  fullName: string;
  email: string;
  tempPassword: string;
  roleId: string;
  phone?: string;
  staffId?: string;
  shopId?: string;
  allowedOrderSections: GarmentSection[];
}

// Dedicated creation drawer, not a mode flag on UserEditDrawer — email and
// temporary password only apply here, and editing's active-toggle/last-Admin
// guard don't apply to creation, so the field sets diverge enough to keep
// these separate (same call already made for Edit Order vs. New Order).
export function AddUserDrawer({
  roles,
  shops,
  onCancel,
  onCreate,
}: {
  roles: Role[];
  shops: Shop[];
  onCancel: () => void;
  onCreate: (input: CreateUserInput) => Promise<{ success: boolean; error?: string }>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [staffId, setStaffId] = useState("");
  const [shopId, setShopId] = useState("");
  const [allowedOrderSections, setAllowedOrderSections] = useState<GarmentSection[]>([
    ...GARMENT_SECTIONS,
  ]);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string; staffNumber: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The real Supabase `staff` table (0001_auth_foundation.sql) has no rows
  // yet — Staff HR data is still on lib/data/stub-data.ts's mock array
  // until its own later migration phase. This queries the real table (not
  // the mock one, which would fail a foreign-key check on submit) so the
  // list is correctly empty for now rather than silently wrong.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("staff")
      .select("id, name, staff_number, staff_code")
      .then(({ data }) => {
        if (!cancelled) setStaffOptions((data ?? []).map((row) => ({ id: row.id, name: row.name, staffNumber: String(row.staff_code ?? row.staff_number) })));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError("Name is required.");
    if (!email.trim()) return setError("Email is required.");
    if (tempPassword.length < 8) return setError("Temporary password must be at least 8 characters.");
    if (!roleId) return setError("Select a role.");
    if (allowedOrderSections.length === 0) return setError("Choose at least one order section.");

    setSubmitting(true);
    const result = await onCreate({
      fullName: fullName.trim(),
      email: email.trim(),
      tempPassword,
      roleId,
      phone: phone.trim() || undefined,
      staffId: staffId || undefined,
      shopId: shopId || undefined,
      allowedOrderSections,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Could not create user.");
      return;
    }
    onCancel();
  }

  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-40 bg-black/30 transition-opacity" />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft sm:w-[460px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">Add User</p>
            <p className="text-sm text-ink-muted">Create a new login for the app.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col justify-between">
          <div className="flex-1 space-y-5 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
                {error}
              </div>
            )}

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Name</span>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Temporary password
                  </span>
                  <input
                    required
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={inputClass}
                  />
                  <span className="text-xs text-ink-faint">
                    Share this with the user directly — they&apos;ll be required to set their
                    own password the first time they log in.
                  </span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Phone <span className="font-normal">(optional)</span>
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Role</span>
                  <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.type === "custom" ? " (Custom)" : ""}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Shop</span>
                  <Select value={shopId} onChange={(e) => setShopId(e.target.value)}>
                    <option value="">All shops</option>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                        {shop.location ? ` - ${shop.location}` : ""}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-ink-muted">Order sections</span>
                  <div className="grid grid-cols-3 gap-2">
                    {GARMENT_SECTIONS.map((section) => (
                      <label
                        key={section}
                        className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={allowedOrderSections.includes(section)}
                          onChange={(event) =>
                            setAllowedOrderSections((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, section]))
                                : current.filter((item) => item !== section)
                            )
                          }
                        />
                        {section}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Link to staff record <span className="font-normal">(optional)</span>
                  </span>
                  <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                    <option value="">None</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.staffNumber} — {s.name}
                      </option>
                    ))}
                  </Select>
                  {staffOptions.length === 0 && (
                    <span className="text-xs text-ink-faint">
                      No staff records yet — staff data isn&apos;t migrated to the database yet.
                    </span>
                  )}
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create User"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
