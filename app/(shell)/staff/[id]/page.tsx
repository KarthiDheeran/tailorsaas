"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { getStaffByIdAction } from "@/app/(shell)/staff/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { StaffStatusBadge } from "@/components/staff/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { formatCurrency } from "@/lib/currency";
import type { Staff } from "@/lib/types";

function StaffViewPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { hasPermission } = useCurrentUser();
  const [member, setMember] = useState<Staff | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    getStaffByIdAction(params.id)
      .then((result) => {
        if (!cancelled) setMember(result ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load staff details.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const configuredRates = useMemo(() => {
    if (!member?.garmentStageRates) return [];
    return Object.values(member.garmentStageRates).flatMap((stageRates) =>
      Object.entries(stageRates ?? {}).map(([stage, rate]) => ({ stage, rate: Number(rate) }))
    );
  }, [member]);

  if (!loaded) {
    return <LoadingState label="Loading staff details..." />;
  }

  if (loadError || !member) {
    return (
      <div className="w-full max-w-none bg-[#f5f8ff] p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError ?? "Staff record was not found."}
        </div>
        <button onClick={() => router.push("/staff")} className="mt-3 text-sm font-semibold text-primary">
          Back to Staff
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none bg-[#f5f8ff] p-2 pb-4 sm:px-3 sm:py-2 lg:px-4">
      <button onClick={() => router.push("/staff")} className="mb-2 flex h-8 items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" />
        Back to Staff
      </button>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c9d7ea] bg-white px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-ink">{member.name}</h1>
            <StaffStatusBadge status={member.status} />
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">Staff #{member.staffNumber} · {member.role}</p>
        </div>
        {hasPermission("staff.manage") && (
          <Link href={`/staff/${member.id}/edit`} className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-dark">
            <Pencil className="h-3.5 w-3.5" /> Edit Staff
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <section className="rounded-lg border border-[#c9d7ea] bg-white p-3">
          <h2 className="mb-2 text-sm font-bold text-ink">Staff Details</h2>
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-muted">Phone</dt><dd className="font-medium text-ink">{member.phone}</dd>
            <dt className="text-ink-muted">Joining date</dt><dd className="font-medium text-ink">{member.joiningDate}</dd>
            <dt className="text-ink-muted">Payment type</dt><dd className="font-medium text-ink">{member.paymentType}</dd>
            {member.paymentType === "Salary" && <><dt className="text-ink-muted">Monthly salary</dt><dd className="font-semibold text-ink">{formatCurrency(member.baseSalary ?? 0)}</dd></>}
            <dt className="text-ink-muted">Address</dt><dd className="font-medium text-ink">{member.address || "-"}</dd>
            <dt className="text-ink-muted">Emergency contact</dt><dd className="font-medium text-ink">{member.emergencyContact || "-"}</dd>
            <dt className="text-ink-muted">Notes</dt><dd className="font-medium text-ink">{member.notes || "-"}</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-[#c9d7ea] bg-white p-3">
          <h2 className="mb-2 text-sm font-bold text-ink">Work Rates</h2>
          {member.paymentType === "Salary" ? (
            <p className="text-sm text-ink-muted">Monthly salary staff — no piece rate.</p>
          ) : configuredRates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Array.from(new Map(configuredRates.map((row) => [`${row.stage}-${row.rate}`, row])).values()).map((row) => (
                <span key={`${row.stage}-${row.rate}`} className="rounded-md border border-border bg-surface-muted px-2.5 py-1.5 text-xs font-semibold text-ink">
                  {row.stage}: {formatCurrency(row.rate)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No stitching rates configured.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function StaffViewPage({ params }: { params: { id: string } }) {
  return (
    <RequirePermission permission="staff.view">
      <StaffViewPageContent params={params} />
    </RequirePermission>
  );
}
