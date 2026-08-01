"use client";

import { useEffect, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { getStaffByIdAction, updateStaffAction } from "@/app/(shell)/staff/actions";
import { setOperatorPinAction } from "@/app/(shell)/settings/operator-actions";
import type { Staff } from "@/lib/types";
import { StaffForm, type StaffFormValues } from "@/components/staff/staff-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function EditStaffPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [member, setMember] = useState<Staff | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operatorPin, setOperatorPin] = useState("");
  const [operatorPinMessage, setOperatorPinMessage] = useState<string | null>(null);
  const [savingOperatorPin, setSavingOperatorPin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStaffByIdAction(params.id).then((m) => {
      if (cancelled) return;
      setMember(m ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loaded && !member) {
    notFound();
  }

  async function handleSubmit(values: StaffFormValues) {
    setError(null);
    const result = await updateStaffAction(params.id, values);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push("/staff");
  }

  async function handleSaveOperatorPin() {
    setSavingOperatorPin(true);
    setOperatorPinMessage(null);
    const result = await setOperatorPinAction(params.id, operatorPin);
    setSavingOperatorPin(false);
    if (!result.success) {
      setOperatorPinMessage(result.error);
      return;
    }
    setOperatorPin("");
    setOperatorPinMessage("Operator PIN saved. The staff member can now select themselves from the header.");
  }

  if (!member) return null;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">{t("staff.editStaff")}</h1>
        <p className="text-sm text-ink-muted">
          {t("staff.editStaffSubtitle")}
        </p>
      </div>
      <div className="max-w-6xl">
        {error && (
          <div className="mb-4 rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
            {error}
          </div>
        )}
        <section className="mb-5 rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-ink">Shared Desktop Operator PIN</h2>
          <p className="mt-1 text-sm text-ink-muted">Set or reset this staff member&apos;s 4 to 8 digit PIN. The PIN is stored securely and is never shown again.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm font-semibold text-ink">New PIN
              <input value={operatorPin} onChange={(event) => setOperatorPin(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" type="password" className="mt-1.5 h-11 w-full rounded-lg border border-border px-3" placeholder="4 to 8 digits" />
            </label>
            <button type="button" onClick={() => void handleSaveOperatorPin()} disabled={savingOperatorPin || operatorPin.length < 4} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{savingOperatorPin ? "Saving…" : "Save operator PIN"}</button>
          </div>
          {operatorPinMessage && <p className="mt-2 text-sm font-medium text-ink-muted">{operatorPinMessage}</p>}
        </section>
        <StaffForm
          onSubmit={handleSubmit}
          initialValues={{
            name: member.name,
            phone: member.phone,
            shopId: member.shopId,
            role: member.role,
            joiningDate: member.joiningDate,
            address: member.address,
            emergencyContact: member.emergencyContact,
            status: member.status,
            notes: member.notes,
            paymentType: member.paymentType,
            baseSalary: member.baseSalary,
            pieceRates: member.pieceRates,
            garmentStageRates: member.garmentStageRates,
          }}
          title="Staff Details"
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}

export default function EditStaffPage({ params }: { params: { id: string } }) {
  return (
    <RequirePermission permission="staff.manage">
      <EditStaffPageContent params={params} />
    </RequirePermission>
  );
}
