"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type {
  AddOnInput,
  CatalogAddOn,
  CatalogWorkStage,
  WorkerStageRates,
} from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

export function AddOnDrawer({
  addOn,
  workStages,
  onCancel,
  onSaved,
}: {
  addOn: CatalogAddOn | null;
  workStages: CatalogWorkStage[];
  onCancel: () => void;
  onSaved: (data: AddOnInput) => Promise<{ success: boolean; error?: string }>;
}) {
  const { t } = useLanguage();
  const isEdit = addOn !== null;
  const [name, setName] = useState(addOn?.name ?? "");
  const [defaultPrice, setDefaultPrice] = useState<number>(
    addOn?.defaultPrice ?? 0
  );
  const [workerStageRates, setWorkerStageRates] = useState<WorkerStageRates>(
    addOn?.workerStageRates ?? {}
  );
  const [isActive, setIsActive] = useState(addOn?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("catalog.addOnNameRequired"));
      return;
    }
    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      setError(t("catalog.defaultPriceRequired"));
      return;
    }

    const cleanedWorkerStageRates = Object.fromEntries(
      Object.entries(workerStageRates).filter(([, amount]) => Number(amount) > 0)
    ) as WorkerStageRates;

    setSubmitting(true);
    const result = await onSaved({
      name: trimmedName,
      defaultPrice,
      workerStageRates: cleanedWorkerStageRates,
      isActive,
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Could not save add-on.");
      return;
    }
    onCancel();
  }

  return (
    <>
      <div
        onClick={onCancel}
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto overflow-x-hidden bg-white shadow-soft sm:w-[480px]">
        <div className="flex items-start justify-between border-b border-border-soft px-6 py-5">
          <div>
            <p className="text-[17px] font-semibold text-ink">
              {isEdit ? t("catalog.editAddOn") : t("catalog.addAddOnTitle")}
            </p>
            <p className="text-sm text-ink-muted">
              {t("catalog.addOnDrawerSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col justify-between"
        >
          <div className="space-y-5 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-chip-red px-4 py-2.5 text-sm font-medium text-chip-red-fg">
                {error}
              </div>
            )}

            <div className="min-w-0 rounded-xl border border-border-soft bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("catalog.addOnName")}
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Extra Pocket"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("catalog.defaultPriceLabel")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
                <div className="min-w-0 rounded-lg border border-border-soft bg-surface p-3">
                  <p className="text-[13px] font-semibold text-ink">Worker Pay Mapping</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Optional. Add labour pay for stages where this add-on creates extra work.
                  </p>
                  <div className="mt-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
                    {workStages.map((stage) => (
                      <label key={stage.stageKey} className="grid min-w-0 gap-1">
                        <span className="truncate text-xs font-medium text-ink-muted">
                          {stage.name}
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={workerStageRates[stage.stageKey] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setWorkerStageRates((current) => ({
                              ...current,
                              [stage.stageKey]: value === "" ? undefined : Number(value),
                            }));
                          }}
                          placeholder="0"
                          className="h-9 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.status")}
                  </span>
                  <select
                    value={isActive ? "Active" : "Inactive"}
                    onChange={(e) => setIsActive(e.target.value === "Active")}
                    className={inputClass}
                  >
                    <option value="Active">{t("common.active")}</option>
                    <option value="Inactive">{t("common.inactive")}</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-soft px-6 py-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting
                ? "Saving…"
                : isEdit
                  ? t("common.saveChanges")
                  : t("catalog.addAddOnTitle")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
