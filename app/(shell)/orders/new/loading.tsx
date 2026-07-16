import { LoadingState } from "@/components/ui/loading-state";

export default function NewOrderLoading() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <LoadingState label="Opening new order..." />
    </div>
  );
}
