"use client";

import { useEffect, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { getStaffByIdAction, updateStaffAction } from "@/app/(shell)/staff/actions";
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

  if (!member) return null;

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">{t("staff.editStaff")}</h1>
        <p className="text-sm text-ink-muted">
          {t("staff.editStaffSubtitle")}
        </p>
      </div>
      <div className="max-w-3xl">
        {error && (
          <div className="mb-4 rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
            {error}
          </div>
        )}
        <StaffForm
          onSubmit={handleSubmit}
          initialValues={{
            name: member.name,
            phone: member.phone,
            role: member.role,
            joiningDate: member.joiningDate,
            address: member.address,
            emergencyContact: member.emergencyContact,
            status: member.status,
            notes: member.notes,
            paymentType: member.paymentType,
            baseSalary: member.baseSalary,
            pieceRates: member.pieceRates,
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
