"use client";

import { useRouter } from "next/navigation";
import { createStaff } from "@/lib/data/stub-data";
import { StaffForm, type StaffFormValues } from "@/components/staff/staff-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function AddStaffPageContent() {
  const router = useRouter();
  const { t } = useLanguage();

  function handleSubmit(values: StaffFormValues) {
    createStaff(values);
    router.push("/staff");
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">{t("staff.addStaff")}</h1>
        <p className="text-sm text-ink-muted">{t("staff.addStaffSubtitle")}</p>
      </div>
      <div className="max-w-3xl">
        <StaffForm
          onSubmit={handleSubmit}
          title={t("staff.staffDetails")}
          submitLabel={t("staff.saveStaff")}
        />
      </div>
    </div>
  );
}

export default function AddStaffPage() {
  return (
    <RequirePermission permission="staff.manage">
      <AddStaffPageContent />
    </RequirePermission>
  );
}
