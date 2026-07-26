"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import type {
  AddOnInput,
  CatalogAddOn,
  CatalogGarmentType,
  CatalogWorkStage,
  GarmentTypeInput,
  WorkStageInput,
} from "@/lib/catalog";
import {
  createAddOnAction,
  createGarmentTypeAction,
  createWorkStageAction,
  getActiveAddOnsAction,
  getActiveWorkStagesAction,
  getAddOnsAction,
  getGarmentTypesAction,
  getWorkStagesAction,
  setAddOnActiveAction,
  setGarmentTypeActiveAction,
  setWorkStageActiveAction,
  updateAddOnAction,
  updateGarmentTypeAction,
  updateWorkStageAction,
} from "@/app/(shell)/catalog/actions";
import { CatalogTabs, type CatalogTab } from "@/components/catalog/catalog-tabs";
import { CatalogTable } from "@/components/catalog/catalog-table";
import { GarmentTypeDrawer } from "@/components/catalog/garment-type-drawer";
import { AddOnTable } from "@/components/catalog/addon-table";
import { AddOnDrawer } from "@/components/catalog/addon-drawer";
import { WorkStageTable } from "@/components/catalog/work-stage-table";
import { WorkStageDrawer } from "@/components/catalog/work-stage-drawer";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";

function isCatalogTab(value: string | null): value is CatalogTab {
  return value === "garment-types" || value === "addons" || value === "work-stages";
}

function CatalogPageContent() {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canManage = hasPermission("catalog.manage");
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<CatalogTab>(
    isCatalogTab(tabParam) ? tabParam : "garment-types"
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const [editingGarment, setEditingGarment] =
    useState<CatalogGarmentType | null>(null);
  const [isAddingGarment, setIsAddingGarment] = useState(false);

  const [editingAddOn, setEditingAddOn] = useState<CatalogAddOn | null>(null);
  const [isAddingAddOn, setIsAddingAddOn] = useState(false);
  const [editingWorkStage, setEditingWorkStage] = useState<CatalogWorkStage | null>(null);
  const [isAddingWorkStage, setIsAddingWorkStage] = useState(false);

  // Phase 5B: reads now go through Server Actions (app/(shell)/catalog/
  // actions.ts) against the same server-side copy of the mock catalog arrays
  // that the mutations write to, instead of a direct client-side
  // lib/catalog.ts import — so an edit and this list re-fetch stay
  // consistent.
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [addOns, setAddOns] = useState<CatalogAddOn[]>([]);
  const [activeAddOns, setActiveAddOns] = useState<CatalogAddOn[]>([]);
  const [workStages, setWorkStages] = useState<CatalogWorkStage[]>([]);
  const [activeWorkStages, setActiveWorkStages] = useState<CatalogWorkStage[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  useEffect(() => {
    if (isCatalogTab(tabParam) && tabParam !== tab) {
      setTab(tabParam);
    }
  }, [tab, tabParam]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCatalog(true);
    Promise.all([
      getGarmentTypesAction(),
      getAddOnsAction(),
      getActiveAddOnsAction(),
      getWorkStagesAction(),
      getActiveWorkStagesAction(),
    ]).then(([garments, allAddOns, active, stages, activeStages]) => {
      if (cancelled) return;
      setGarmentTypes(garments);
      setAddOns(allAddOns);
      setActiveAddOns(active);
      setWorkStages(stages);
      setActiveWorkStages(activeStages);
    }).finally(() => {
      if (!cancelled) setIsLoadingCatalog(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleSaveGarment(data: GarmentTypeInput) {
    const result = editingGarment
      ? await updateGarmentTypeAction(editingGarment.id, data)
      : await createGarmentTypeAction(data);
    if (result.success) {
      setEditingGarment(null);
      setIsAddingGarment(false);
      setRefreshKey((k) => k + 1);
    }
    return result;
  }

  async function handleToggleGarmentActive(garment: CatalogGarmentType) {
    const result = await setGarmentTypeActiveAction(garment.id, !garment.isActive);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  async function handleSaveAddOn(data: AddOnInput) {
    const result = editingAddOn
      ? await updateAddOnAction(editingAddOn.id, data)
      : await createAddOnAction(data);
    if (result.success) {
      setEditingAddOn(null);
      setIsAddingAddOn(false);
      setRefreshKey((k) => k + 1);
    }
    return result;
  }

  async function handleSaveWorkStage(data: WorkStageInput) {
    const result = editingWorkStage
      ? await updateWorkStageAction(editingWorkStage.id, data)
      : await createWorkStageAction(data);
    if (result.success) {
      setEditingWorkStage(null);
      setIsAddingWorkStage(false);
      setRefreshKey((k) => k + 1);
    }
    return result;
  }

  async function handleToggleWorkStageActive(stage: CatalogWorkStage) {
    const result = await setWorkStageActiveAction(stage.id, !stage.isActive);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  async function handleToggleAddOnActive(addOn: CatalogAddOn) {
    const result = await setAddOnActiveAction(addOn.id, !addOn.isActive);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  const garmentDrawerOpen = isAddingGarment || editingGarment !== null;
  const addOnDrawerOpen = isAddingAddOn || editingAddOn !== null;
  const workStageDrawerOpen = isAddingWorkStage || editingWorkStage !== null;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-soft bg-white px-3 text-sm font-semibold text-ink-muted shadow-soft transition-colors hover:border-primary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">
            {t("catalog.title")}
          </h1>
          <p className="text-sm text-ink-muted">{t("catalog.subtitle")}</p>
        </div>
        {canManage &&
          (tab === "garment-types" ? (
            <button
              type="button"
              onClick={() => setIsAddingGarment(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              {t("catalog.addGarmentType")}
            </button>
          ) : tab === "addons" ? (
            <button
              type="button"
              onClick={() => setIsAddingAddOn(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              {t("catalog.addAddOn")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingWorkStage(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              Add Work Stage
            </button>
          ))}
      </div>

      <CatalogTabs
        active={tab}
        onChange={(nextTab) => {
          setTab(nextTab);
          router.replace(`${pathname}?tab=${nextTab}`, { scroll: false });
        }}
      />

      {isLoadingCatalog ? (
        <LoadingState label="Loading catalog..." />
      ) : tab === "garment-types" ? (
        <CatalogTable
          garmentTypes={garmentTypes}
          canManage={canManage}
          onEdit={setEditingGarment}
          onToggleActive={handleToggleGarmentActive}
        />
      ) : tab === "addons" ? (
        <AddOnTable
          addOns={addOns}
          canManage={canManage}
          onEdit={setEditingAddOn}
          onToggleActive={handleToggleAddOnActive}
        />
      ) : (
        <WorkStageTable
          stages={workStages}
          canManage={canManage}
          onEdit={setEditingWorkStage}
          onToggleActive={handleToggleWorkStageActive}
        />
      )}

      {canManage && garmentDrawerOpen && (
        <GarmentTypeDrawer
          garment={editingGarment}
          activeAddOns={activeAddOns}
          onCancel={() => {
            setEditingGarment(null);
            setIsAddingGarment(false);
          }}
          onSaved={handleSaveGarment}
        />
      )}

      {canManage && addOnDrawerOpen && (
        <AddOnDrawer
          addOn={editingAddOn}
          workStages={activeWorkStages}
          onCancel={() => {
            setEditingAddOn(null);
            setIsAddingAddOn(false);
          }}
          onSaved={handleSaveAddOn}
        />
      )}

      {canManage && workStageDrawerOpen && (
        <WorkStageDrawer
          stage={editingWorkStage}
          onCancel={() => {
            setEditingWorkStage(null);
            setIsAddingWorkStage(false);
          }}
          onSaved={handleSaveWorkStage}
        />
      )}
    </div>
  );
}

function CatalogPageFallback() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <LoadingState label="Opening catalog..." />
    </div>
  );
}

export default function CatalogPage() {
  return (
    <RequirePermission permission="catalog.view">
      <Suspense fallback={<CatalogPageFallback />}>
        <CatalogPageContent />
      </Suspense>
    </RequirePermission>
  );
}
