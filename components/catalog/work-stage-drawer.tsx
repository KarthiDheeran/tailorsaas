"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CatalogWorkStage, WorkStageInput } from "@/lib/catalog";

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export function WorkStageDrawer({
  stage,
  onCancel,
  onSaved,
}: {
  stage: CatalogWorkStage | null;
  onCancel: () => void;
  onSaved: (data: WorkStageInput) => Promise<{ success: boolean; error?: string }>;
}) {
  const isEdit = stage !== null;
  const [name, setName] = useState(stage?.name ?? "");
  const [displayOrder, setDisplayOrder] = useState(stage?.displayOrder ?? 1);
  const [isActive, setIsActive] = useState(stage?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Stage name is required.");
      return;
    }
    if (!Number.isFinite(displayOrder) || displayOrder < 1) {
      setError("Display order must be 1 or greater.");
      return;
    }
    setSubmitting(true);
    const result = await onSaved({ name: trimmedName, displayOrder, isActive });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Could not save stage.");
      return;
    }
    onCancel();
  }

  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-40 bg-black/30" />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto bg-white shadow-soft sm:w-[420px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">
              {isEdit ? "Edit Work Stage" : "Add Work Stage"}
            </p>
            <p className="text-sm text-ink-muted">
              Stages appear in job-card printing and worker pay mappings.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col justify-between">
          <div className="space-y-5 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
                {error}
              </div>
            )}
            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Stage Name</span>
                  <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Quality Check"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Display Order</span>
                  <input
                    type="number"
                    min={1}
                    required
                    value={displayOrder}
                    onChange={(event) => setDisplayOrder(Number(event.target.value))}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Status</span>
                  <select
                    value={isActive ? "Active" : "Inactive"}
                    onChange={(event) => setIsActive(event.target.value === "Active")}
                    className={inputClass}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Work Stage"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
