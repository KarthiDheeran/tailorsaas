import Link from "next/link";
import { ArrowRight, Clock3, Scissors } from "lucide-react";

export type ProductionQueueStage = {
  stage: string;
  count: number;
  delayedCount: number;
};

function stageLabel(stage: string) {
  if (stage === "Unassigned") return "Awaiting next stage";
  return stage;
}

export function ProductionQueue({ stages }: { stages: ProductionQueueStage[] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <section className="rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-tint text-primary">
              <Scissors className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-[17px] font-semibold text-ink">Production Queue</h2>
          </div>
          <p className="mt-1 text-[13px] text-ink-faint">
            Pending job cards by current stage — use this to plan tailor capacity.
          </p>
        </div>
        <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-semibold text-primary">
          {total} pending
        </span>
      </div>

      {stages.length === 0 ? (
        <div className="px-5 py-5 text-sm text-ink-muted">No pending job cards. Production is clear.</div>
      ) : (
        <div className="divide-y divide-border-soft">
          {stages.map((stage) => (
            <Link
              key={stage.stage}
              href="/job-cards"
              className="flex min-h-[68px] items-center gap-3 px-5 py-4 transition duration-200 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-primary">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{stageLabel(stage.stage)}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {stage.delayedCount > 0 ? `${stage.delayedCount} delayed` : "On schedule"}
                </p>
              </div>
              <span className="min-w-7 text-right text-lg font-bold text-primary">{stage.count}</span>
              <ArrowRight className="h-4 w-4 text-ink-faint" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
