import type { Staff } from "@/lib/types";

export function staffGarmentStageRate(
  staff: Staff | undefined,
  garmentTypeId: string | undefined,
  stage: string
): number {
  if (!staff || staff.paymentType !== "Per Piece") return 0;
  const garmentRate =
    garmentTypeId && staff.garmentStageRates
      ? Number(staff.garmentStageRates[garmentTypeId]?.[stage] ?? 0)
      : 0;
  if (Number.isFinite(garmentRate) && garmentRate > 0) return garmentRate;

  const fallbackRate = Number(staff.pieceRates?.[stage] ?? 0);
  return Number.isFinite(fallbackRate) && fallbackRate > 0 ? fallbackRate : 0;
}
