import { RequirePermission } from "@/components/auth/require-permission";
import { ProductionPrintPage } from "@/components/job-cards/production-print-page";

export default function ProductionPrintRoute() {
  return <RequirePermission permission="orders.printJobCard"><ProductionPrintPage /></RequirePermission>;
}
