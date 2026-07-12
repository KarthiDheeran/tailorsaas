"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStaffAction } from "@/app/(shell)/staff/actions";
import { StaffForm, type StaffFormValues } from "@/components/staff/staff-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";

function AddStaffPageContent() {
  const router = useRouter();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: StaffFormValues) {
    setError(null);
    const result = await createStaffAction(values);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push("/staff");
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">{t("staff.addStaff")}</h1>
        <p className="text-sm text-ink-muted">{t("staff.addStaffSubtitle")}</p>
      </div>
      <div className="max-w-3xl">
        {error && (
          <div className="mb-4 rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
            {error}
          </div>
        )}
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
