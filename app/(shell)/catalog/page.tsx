"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import type {
  AddOnInput,
  CatalogAddOn,
  CatalogField,
  CatalogGarmentType,
  CatalogSection,
  CatalogSectionInput,
  CatalogWorkStage,
  GarmentTypeConfiguration,
  GarmentTypeFieldAssignmentInput,
  GarmentTypeInput,
  WorkStageInput,
} from "@/lib/catalog";
import {
  createAddOnAction,
  createGarmentTypeAction,
  createCatalogFieldAction,
  createCatalogSectionAction,
  createWorkStageAction,
  getCatalogPageBootstrapAction,
  getGarmentTypeConfigurationAction,
  setAddOnActiveAction,
  setCatalogFieldActiveAction,
  saveGarmentTypeConfigurationAction,
  setFinalWorkStageAction,
  setGarmentTypeActiveAction,
  setWorkStageActiveAction,
  updateAddOnAction,
  updateGarmentTypeAction,
  updateCatalogFieldAction,
  updateCatalogSectionAction,
  updateWorkStageAction,
} from "@/app/(shell)/catalog/actions";
import { CatalogTabs, type CatalogTab } from "@/components/catalog/catalog-tabs";
import { CatalogTable } from "@/components/catalog/catalog-table";
import { GarmentTypeConfigDrawer } from "@/components/catalog/garment-type-config-drawer";
import { GarmentTypeDrawer } from "@/components/catalog/garment-type-drawer";
import { FieldsPanel, SectionsPanel } from "@/components/catalog/metadata-catalog-panels";
import { AddOnTable } from "@/components/catalog/addon-table";
import { AddOnDrawer } from "@/components/catalog/addon-drawer";
import { WorkStageTable } from "@/components/catalog/work-stage-table";
import { WorkStageDrawer } from "@/components/catalog/work-stage-drawer";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { clearNewOrderCatalogReference } from "@/lib/new-order-reference-browser-cache";

function isCatalogTab(value: string | null): value is CatalogTab {
  return value === "garment-types" || value === "fields" || value === "sections" || value === "addons" || value === "work-stages";
}

function CatalogPageContent() {
  const { hasPermission, currentUserId } = useCurrentUser();
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
  const [garmentConfiguration, setGarmentConfiguration] = useState<GarmentTypeConfiguration | null>(null);
  const [metadataFieldCounts, setMetadataFieldCounts] = useState<Record<string, number>>({});
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
  const [catalogFields, setCatalogFields] = useState<CatalogField[]>([]);
  const [catalogSections, setCatalogSections] = useState<CatalogSection[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isCatalogTab(tabParam) && tabParam !== tab) {
      setTab(tabParam);
    }
  }, [tab, tabParam]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCatalog(true);
    setLoadError(null);
    getCatalogPageBootstrapAction().then((data) => {
      if (cancelled) return;
      setGarmentTypes(data.garmentTypes);
      setAddOns(data.addOns);
      setActiveAddOns(data.activeAddOns);
      setWorkStages(data.workStages);
      setActiveWorkStages(data.activeWorkStages);
      setCatalogFields(data.catalogFields);
      setCatalogSections(data.catalogSections);
      setMetadataFieldCounts(data.metadataFieldCounts);
    }).catch((error) => {
      if (!cancelled) setLoadError(getErrorMessage(error, "Failed to load catalog."));
    }).finally(() => {
      if (!cancelled) setIsLoadingCatalog(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleSaveGarmentConfiguration(
    data: GarmentTypeInput,
    assignments: GarmentTypeFieldAssignmentInput[],
    legacyMeasurementFieldIds: string[]
  ) {
    const result = await saveGarmentTypeConfigurationAction(
      editingGarment?.id ?? null,
      data,
      assignments,
      legacyMeasurementFieldIds
    );
    if (result.success) {
      clearNewOrderCatalogReference(currentUserId);
      setEditingGarment(null);
      setIsAddingGarment(false);
      setGarmentConfiguration(null);
      setRefreshKey((k) => k + 1);
    }
    return result;
  }

  async function handleSaveLegacyGarment(data: GarmentTypeInput) {
    const result = editingGarment
      ? await updateGarmentTypeAction(editingGarment.id, data)
      : await createGarmentTypeAction(data);
    if (result.success) {
      clearNewOrderCatalogReference(currentUserId);
      setEditingGarment(null);
      setIsAddingGarment(false);
      setRefreshKey((key) => key + 1);
    }
    return result;
  }

  async function openGarmentEditor(garment: CatalogGarmentType) {
    setEditingGarment(garment);
    setGarmentConfiguration(null);
    try {
      setGarmentConfiguration(await getGarmentTypeConfigurationAction(garment.id));
    } catch {
      window.alert("Could not load the garment field configuration.");
    }
  }

  async function handleSaveSection(id: string | null, data: CatalogSectionInput) {
    const result = id ? await updateCatalogSectionAction(id, data) : await createCatalogSectionAction(data);
    if (result.success) {
      clearNewOrderCatalogReference(currentUserId);
      setRefreshKey((key) => key + 1);
    }
    return result;
  }

  async function handleSaveField(id: string | null, data: import("@/lib/catalog").CatalogFieldInput) {
    const result = id ? await updateCatalogFieldAction(id, data) : await createCatalogFieldAction(data);
    if (result.success) {
      clearNewOrderCatalogReference(currentUserId);
      setRefreshKey((key) => key + 1);
    }
    return result;
  }

  async function handleToggleField(field: CatalogField) {
    const result = await setCatalogFieldActiveAction(field.id, !field.isActive);
    if (!result.success) window.alert(result.error);
    else {
      clearNewOrderCatalogReference(currentUserId);
      setRefreshKey((key) => key + 1);
    }
  }

  async function handleToggleGarmentActive(garment: CatalogGarmentType) {
    const result = await setGarmentTypeActiveAction(garment.id, !garment.isActive);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    clearNewOrderCatalogReference(currentUserId);
    setRefreshKey((k) => k + 1);
  }

  async function handleToggleCustomerWorkDetails(garment: CatalogGarmentType) {
    const result = await updateGarmentTypeAction(garment.id, {
      name: garment.name,
      section: garment.section,
      shortcutCode: garment.shortcutCode,
      basePrice: garment.basePrice,
      measurementFieldIds: garment.measurementFieldIds,
      addOnIds: garment.addOnIds,
      showOrderAddOns: garment.showOrderAddOns,
      showWorkDetailsOnCustomerPrint: !garment.showWorkDetailsOnCustomerPrint,
      bodyMeasurementLayout: garment.bodyMeasurementLayout,
      productionPrintGroup: garment.productionPrintGroup,
      customerPrintName: garment.customerPrintName,
      isActive: garment.isActive,
    });
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    clearNewOrderCatalogReference(currentUserId);
    setRefreshKey((key) => key + 1);
  }

  async function handleSaveAddOn(data: AddOnInput) {
    const result = editingAddOn
      ? await updateAddOnAction(editingAddOn.id, data)
      : await createAddOnAction(data);
    if (result.success) {
      clearNewOrderCatalogReference(currentUserId);
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
      clearNewOrderCatalogReference(currentUserId);
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
    clearNewOrderCatalogReference(currentUserId);
    setRefreshKey((k) => k + 1);
  }

  async function handleSetFinalWorkStage(stage: CatalogWorkStage) {
    const result = await setFinalWorkStageAction(stage.id);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    clearNewOrderCatalogReference(currentUserId);
    setRefreshKey((k) => k + 1);
  }

  async function handleToggleAddOnActive(addOn: CatalogAddOn) {
    const result = await setAddOnActiveAction(addOn.id, !addOn.isActive);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    clearNewOrderCatalogReference(currentUserId);
    setRefreshKey((k) => k + 1);
  }

  const garmentDrawerOpen = isAddingGarment || editingGarment !== null;
  const metadataAvailable = catalogFields.length > 0 && catalogSections.length > 0;
  const addOnDrawerOpen = isAddingAddOn || editingAddOn !== null;
  const workStageDrawerOpen = isAddingWorkStage || editingWorkStage !== null;

  return (
    <div className="w-full max-w-none bg-[#f5f8ff] p-2 pb-4 sm:px-3 sm:py-2 lg:px-4 [&_table_td]:!px-2 [&_table_td]:!py-1.5 [&_table_th]:!px-2 [&_table_th]:!py-1.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#c9d7ea] bg-white px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              title="Back to Settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-lg font-bold text-ink">
              {t("catalog.title")}
            </h1>
          </div>
          <p className="ml-10 mt-0.5 text-xs text-ink-muted">{t("catalog.subtitle")}</p>
        </div>
        <div>
          {canManage &&
            (tab === "garment-types" ? (
              <button
                type="button"
                onClick={() => {
                  setGarmentConfiguration(null);
                  setIsAddingGarment(true);
                }}
                className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
              >
                <Plus className="h-4 w-4" />
                {t("catalog.addGarmentType")}
              </button>
            ) : tab === "addons" ? (
              <button
                type="button"
                onClick={() => setIsAddingAddOn(true)}
                className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
              >
                <Plus className="h-4 w-4" />
                {t("catalog.addAddOn")}
              </button>
            ) : tab === "work-stages" ? (
              <button
                type="button"
                onClick={() => setIsAddingWorkStage(true)}
                className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
              >
                <Plus className="h-4 w-4" />
                Add Work Stage
              </button>
            ) : null)}
        </div>
      </div>

      <div className="mb-2 bg-white px-2">
        <CatalogTabs
          active={tab}
          onChange={(nextTab) => {
            setTab(nextTab);
            router.replace(`${pathname}?tab=${nextTab}`, { scroll: false });
          }}
        />
      </div>

      {loadError ? (
        <LoadError message={loadError} onRetry={() => setRefreshKey((key) => key + 1)} />
      ) : isLoadingCatalog ? (
        <LoadingState label="Loading catalog..." />
      ) : tab === "garment-types" ? (
        <>
          {!metadataAvailable && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Dynamic Fields and Sections will be available after database migrations 0055 and 0056 are applied. Existing catalog management remains available.
            </div>
          )}
          <CatalogTable
            garmentTypes={garmentTypes}
            metadataFieldCounts={metadataFieldCounts}
            canManage={canManage}
            onEdit={metadataAvailable ? openGarmentEditor : setEditingGarment}
            onToggleActive={handleToggleGarmentActive}
            onToggleCustomerWorkDetails={handleToggleCustomerWorkDetails}
          />
        </>
      ) : tab === "fields" ? (
        <FieldsPanel
          fields={catalogFields}
          sections={catalogSections}
          canManage={canManage}
          onSave={handleSaveField}
          onToggleActive={handleToggleField}
        />
      ) : tab === "sections" ? (
        <SectionsPanel sections={catalogSections} canManage={canManage} onSave={handleSaveSection} />
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
          onSetFinal={handleSetFinalWorkStage}
        />
      )}

      {canManage && garmentDrawerOpen && metadataAvailable && (
        <GarmentTypeConfigDrawer
          garment={editingGarment}
          configuration={garmentConfiguration}
          fields={catalogFields}
          sections={catalogSections}
          activeAddOns={activeAddOns}
          onCancel={() => {
            setEditingGarment(null);
            setIsAddingGarment(false);
            setGarmentConfiguration(null);
          }}
          onSaved={handleSaveGarmentConfiguration}
        />
      )}
      {canManage && garmentDrawerOpen && !metadataAvailable && (
        <GarmentTypeDrawer
          garment={editingGarment}
          activeAddOns={activeAddOns}
          onCancel={() => {
            setEditingGarment(null);
            setIsAddingGarment(false);
          }}
          onSaved={handleSaveLegacyGarment}
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
    <div className="w-full max-w-none bg-[#f5f8ff] p-2 sm:px-3 sm:py-2 lg:px-4">
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
