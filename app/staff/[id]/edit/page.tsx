"use client";

import { useRouter, notFound } from "next/navigation";
import { getStaffById, updateStaff } from "@/lib/data/stub-data";
import { StaffForm, type StaffFormValues } from "@/components/staff/staff-form";

export default function EditStaffPage({ params }: { params: { id: string } }) {
  const router = useRouter();
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
        <h1 className="text-[26px] font-semibold text-ink">Edit Staff</h1>
        <p className="text-sm text-ink-muted">
          Update {member!.name}&apos;s details
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
