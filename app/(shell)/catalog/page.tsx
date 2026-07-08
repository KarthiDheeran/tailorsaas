"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  createAddOn,
  createGarmentType,
  getAllAddOns,
  getAllGarmentTypes,
  setAddOnActive,
  setGarmentTypeActive,
  updateAddOn,
  updateGarmentType,
  type AddOnInput,
  type CatalogAddOn,
  type CatalogGarmentType,
  type GarmentTypeInput,
} from "@/lib/catalog";
import { CatalogTabs, type CatalogTab } from "@/components/catalog/catalog-tabs";
import { CatalogTable } from "@/components/catalog/catalog-table";
import { GarmentTypeDrawer } from "@/components/catalog/garment-type-drawer";
import { AddOnTable } from "@/components/catalog/addon-table";
import { AddOnDrawer } from "@/components/catalog/addon-drawer";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

function CatalogPageContent() {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canManage = hasPermission("catalog.manage");
  const [tab, setTab] = useState<CatalogTab>("garment-types");
  const [refreshKey, setRefreshKey] = useState(0);

  const [editingGarment, setEditingGarment] =
    useState<CatalogGarmentType | null>(null);
  const [isAddingGarment, setIsAddingGarment] = useState(false);

  const [editingAddOn, setEditingAddOn] = useState<CatalogAddOn | null>(null);
  const [isAddingAddOn, setIsAddingAddOn] = useState(false);

  void refreshKey; // forces a re-render (and re-read of the catalog data) after mutations
  const garmentTypes = getAllGarmentTypes();
  const addOns = getAllAddOns();

  function handleSaveGarment(data: GarmentTypeInput) {
    if (editingGarment) {
      updateGarmentType(editingGarment.id, data);
    } else {
      createGarmentType(data);
    }
    setEditingGarment(null);
    setIsAddingGarment(false);
    setRefreshKey((k) => k + 1);
  }

  function handleToggleGarmentActive(garment: CatalogGarmentType) {
    setGarmentTypeActive(garment.id, !garment.isActive);
    setRefreshKey((k) => k + 1);
  }

  function handleSaveAddOn(data: AddOnInput) {
    if (editingAddOn) {
      updateAddOn(editingAddOn.id, data);
    } else {
      createAddOn(data);
    }
    setEditingAddOn(null);
    setIsAddingAddOn(false);
    setRefreshKey((k) => k + 1);
  }

  function handleToggleAddOnActive(addOn: CatalogAddOn) {
    setAddOnActive(addOn.id, !addOn.isActive);
    setRefreshKey((k) => k + 1);
  }

  const garmentDrawerOpen = isAddingGarment || editingGarment !== null;
  const addOnDrawerOpen = isAddingAddOn || editingAddOn !== null;

  return (
    <div className="mx-auto max-w-7xl p-8">
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
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingAddOn(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              {t("catalog.addAddOn")}
            </button>
          ))}
      </div>

      <CatalogTabs active={tab} onChange={setTab} />

      {tab === "garment-types" ? (
        <CatalogTable
          garmentTypes={garmentTypes}
          canManage={canManage}
          onEdit={setEditingGarment}
          onToggleActive={handleToggleGarmentActive}
        />
      ) : (
        <AddOnTable
          addOns={addOns}
          canManage={canManage}
          onEdit={setEditingAddOn}
          onToggleActive={handleToggleAddOnActive}
        />
      )}

      {canManage && garmentDrawerOpen && (
        <GarmentTypeDrawer
          garment={editingGarment}
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
          onCancel={() => {
            setEditingAddOn(null);
            setIsAddingAddOn(false);
          }}
          onSaved={handleSaveAddOn}
        />
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <RequirePermission permission="catalog.view">
      <CatalogPageContent />
    </RequirePermission>
  );
}
