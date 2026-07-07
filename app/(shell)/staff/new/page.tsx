"use client";

import { useRouter } from "next/navigation";
import { createStaff } from "@/lib/data/stub-data";
import { StaffForm, type StaffFormValues } from "@/components/staff/staff-form";

export default function AddStaffPage() {
  const router = useRouter();

  function handleSubmit(values: StaffFormValues) {
    createStaff(values);
    router.push("/staff");
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">Add Staff</h1>
        <p className="text-sm text-ink-muted">Create a new staff record</p>
      </div>
      <div className="max-w-3xl">
        <StaffForm
          onSubmit={handleSubmit}
          title="Staff Details"
          submitLabel="Save Staff"
        />
      </div>
    </div>
  );
}
