import { RequirePermission } from "@/components/auth/require-permission";
import { WorkAssignmentScanPage } from "@/components/job-cards/work-assignment-scan-page";

export default function Page() {
  return (
    <RequirePermission permission="staff.manage">
      <WorkAssignmentScanPage />
    </RequirePermission>
  );
}
