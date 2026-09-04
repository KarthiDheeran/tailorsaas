import { RequirePermission } from "@/components/auth/require-permission";
import { WorkAssignmentPage } from "@/components/job-cards/work-assignment-page";

export default function Page() {
  return (
    <RequirePermission permission="staff.manage">
      <WorkAssignmentPage />
    </RequirePermission>
  );
}
