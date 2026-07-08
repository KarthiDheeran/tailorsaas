"use client";

import { useRouter, notFound } from "next/navigation";
import { getStaffById, updateStaff } from "@/lib/data/stub-data";
import { StaffForm, type StaffFormValues } from "@/components/staff/staff-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function EditStaffPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const member = getStaffById(params.id);

  if (!member) {
    notFound();
  }

  function handleSubmit(values: StaffFormValues) {
    updateStaff(params.id, values);
    router.push("/staff");
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">{t("staff.editStaff")}</h1>
        <p className="text-sm text-ink-muted">
          {t("staff.editStaffSubtitle")}
        </p>
      </div>
      <div className="max-w-3xl">
        <StaffForm
          onSubmit={handleSubmit}
          initialValues={{
            name: member!.name,
            phone: member!.phone,
            role: member!.role,
            joiningDate: member!.joiningDate,
            address: member!.address,
            emergencyContact: member!.emergencyContact,
            status: member!.status,
            notes: member!.notes,
            paymentType: member!.paymentType,
            baseSalary: member!.baseSalary,
            pieceRates: member!.pieceRates,
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
