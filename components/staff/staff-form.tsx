"use client";

import { useEffect, useState } from "react";
import {
  getActiveGarmentTypesAction,
  getActiveWorkStagesAction,
} from "@/app/(shell)/catalog/actions";
import type { CatalogGarmentType, CatalogWorkStage } from "@/lib/catalog";
import type {
  StaffPaymentType,
  StaffRole,
  StaffStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import { Select } from "@/components/ui/select";

export interface StaffFormValues {
  name: string;
  phone: string;
  role: StaffRole;
  joiningDate: string;
  address: string;
  emergencyContact: string;
  status: StaffStatus;
  notes?: string;
  paymentType: StaffPaymentType;
  baseSalary?: number;
  pieceRates?: Partial<Record<string, number>>;
  garmentStageRates?: Record<string, Partial<Record<string, number>>>;
}

const ROLES: StaffRole[] = [
  "Master Tailor",
  "Cutter",
  "Stitching Staff",
  "Embroidery Staff",
  "Finishing Staff",
  "Alteration Staff",
  "Delivery Staff",
  "Manager",
  "Owner/Admin",
];

const STATUSES: StaffStatus[] = ["Active", "Inactive", "On Leave"];

export function StaffForm({
  onSubmit,
  initialValues,
  title = "Add Staff",
  submitLabel = "Save Staff",
}: {
  onSubmit: (values: StaffFormValues) => void;
  initialValues?: StaffFormValues;
  title?: string;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [role, setRole] = useState<StaffRole>(initialValues?.role ?? "Stitching Staff");
  const [joiningDate, setJoiningDate] = useState(initialValues?.joiningDate ?? "");
  const [address, setAddress] = useState(initialValues?.address ?? "");
  const [emergencyContact, setEmergencyContact] = useState(
    initialValues?.emergencyContact ?? ""
  );
  const [status, setStatus] = useState<StaffStatus>(initialValues?.status ?? "Active");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [paymentType, setPaymentType] = useState<StaffPaymentType>(
    initialValues?.paymentType ?? "Per Piece"
  );
  const [baseSalary, setBaseSalary] = useState(
    initialValues?.baseSalary != null ? String(initialValues.baseSalary) : ""
  );
  const [pieceRates, setPieceRates] = useState<Partial<Record<string, string>>>(
    Object.fromEntries(
      Object.entries(initialValues?.pieceRates ?? {}).map(([k, v]) => [k, String(v)])
    )
  );
  const [garmentStageRates, setGarmentStageRates] = useState<
    Record<string, Partial<Record<string, string>>>
  >(
    Object.fromEntries(
      Object.entries(initialValues?.garmentStageRates ?? {}).map(([garmentId, stageRates]) => [
        garmentId,
        Object.fromEntries(Object.entries(stageRates ?? {}).map(([stage, rate]) => [stage, String(rate)])),
      ])
    )
  );
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [workStages, setWorkStages] = useState<CatalogWorkStage[]>([]);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getActiveWorkStagesAction(), getActiveGarmentTypesAction()]).then(
      ([stages, garments]) => {
        if (cancelled) return;
        setWorkStages(stages);
        setGarmentTypes(garments);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !joiningDate) return;

    const rates: Partial<Record<string, number>> = {};
    for (const [k, v] of Object.entries(pieceRates)) {
      const n = Number(v);
      if (v && n > 0) rates[k] = n;
    }
    const garmentRates: Record<string, Partial<Record<string, number>>> = {};
    for (const [garmentId, stageRates] of Object.entries(garmentStageRates)) {
      const cleanedStageRates: Partial<Record<string, number>> = {};
      for (const [stage, value] of Object.entries(stageRates ?? {})) {
        const n = Number(value);
        if (value && Number.isFinite(n) && n > 0) cleanedStageRates[stage] = n;
      }
      if (Object.keys(cleanedStageRates).length > 0) {
        garmentRates[garmentId] = cleanedStageRates;
      }
    }

    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      role,
      joiningDate,
      address: address.trim(),
      emergencyContact: emergencyContact.trim(),
      status,
      notes: notes.trim() || undefined,
      paymentType,
      baseSalary: paymentType === "Salary" ? Number(baseSalary) || 0 : undefined,
      pieceRates: paymentType === "Per Piece" ? rates : undefined,
      garmentStageRates: paymentType === "Per Piece" ? garmentRates : undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border-soft bg-white p-5 shadow-soft"
    >
      <h3 className="mb-4 text-[17px] font-semibold text-ink">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("common.name")}</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("common.phoneNumber")}</span>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("staff.role")}</span>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("staff.joiningDate")}</span>
          <input
            required
            type="date"
            value={joiningDate}
            onChange={(e) => setJoiningDate(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("common.address")}</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("staff.emergencyContact")}
          </span>
          <input
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("common.status")}</span>
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                  status === s
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-ink hover:bg-surface"
                )}
              >
                {s === "Active" ? t("common.active") : s === "Inactive" ? t("common.inactive") : s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">{t("staff.paymentType")}</span>
          <div className="flex gap-2">
            {(["Salary", "Per Piece"] as StaffPaymentType[]).map((payType) => (
              <button
                key={payType}
                type="button"
                onClick={() => setPaymentType(payType)}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                  paymentType === payType
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-ink hover:bg-surface"
                )}
              >
                {payType === "Salary" ? t("staff.monthlySalary") : t("staff.perPieceTask")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {paymentType === "Salary" ? (
        <label className="mt-4 flex max-w-xs flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-muted">
            {t("staff.baseSalary")}
          </span>
          <input
            type="number"
            min={0}
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          />
        </label>
      ) : (
        <div className="mt-4">
          <div>
            <p className="text-[13px] font-semibold text-ink">
              Garment Stage Rates
            </p>
            <p className="text-xs text-ink-muted">
              Configure what this staff member charges for each garment and work stage.
            </p>
          </div>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border-soft">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[150px] bg-surface px-3 py-2">
                    Garment
                  </th>
                  {workStages.map((stage) => (
                    <th key={stage.id} className="min-w-[120px] px-2 py-2">
                      {stage.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {garmentTypes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={workStages.length + 1}
                      className="px-3 py-5 text-center text-sm text-ink-muted"
                    >
                      No active garment types found.
                    </td>
                  </tr>
                ) : (
                  garmentTypes.map((garment) => (
                    <tr key={garment.id} className="border-t border-border-soft">
                      <th className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-ink">
                        {garment.shortcutCode ? `${garment.shortcutCode} - ` : ""}
                        {garment.name}
                      </th>
                      {workStages.map((stage) => (
                        <td key={stage.id} className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            value={garmentStageRates[garment.id]?.[stage.stageKey] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setGarmentStageRates((current) => ({
                                ...current,
                                [garment.id]: {
                                  ...(current[garment.id] ?? {}),
                                  [stage.stageKey]: value,
                                },
                              }));
                            }}
                            placeholder="0"
                            className="h-9 w-full min-w-0 rounded-lg border border-border bg-white px-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <details className="mt-3 rounded-lg border border-border-soft bg-surface px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-ink-muted">
              Legacy stage-only fallback rates
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {workStages.map((stage) => (
                <label key={stage.id} className="flex flex-col gap-1.5">
                  <span className="text-xs text-ink-faint">{stage.name}</span>
                  <input
                    type="number"
                    min={0}
                    value={pieceRates[stage.stageKey] ?? ""}
                    onChange={(e) =>
                      setPieceRates((prev) => ({ ...prev, [stage.stageKey]: e.target.value }))
                    }
                    className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-muted">{t("common.notes")}</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
      </label>

      <button
        type="submit"
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
      >
        {submitLabel}
      </button>
    </form>
  );
}
