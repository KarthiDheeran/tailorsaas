"use client";

import { useEffect } from "react";
import {
  getActiveGarmentTypesAction,
  getAddOnsAction,
  getGarmentTypeConfigurationsAction,
} from "@/app/(shell)/catalog/actions";
import { getOrderPricingBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import { getNewOrderPreferencesAction } from "@/app/(shell)/settings/order-preferences/actions";
import { getActiveOperatorStaffAction } from "@/app/(shell)/settings/operator-actions";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import {
  readNewOrderBillingSettings,
  readNewOrderCatalogReference,
  readNewOrderOperatorStaff,
  readNewOrderPreferences,
  writeNewOrderBillingSettings,
  writeNewOrderCatalogReference,
  writeNewOrderOperatorStaff,
  writeNewOrderPreferences,
} from "@/lib/new-order-reference-browser-cache";

function runIdle(task: () => void) {
  if (typeof window === "undefined") return;
  const requestIdleCallback = window.requestIdleCallback;
  if (requestIdleCallback) {
    const id = requestIdleCallback(task, { timeout: 2500 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(task, 250);
  return () => window.clearTimeout(id);
}

export function ReferenceDataWarmer() {
  const { currentUser, isLoading, hasPermission } = useCurrentUser();
  const scopeId = currentUser?.id;
  const canWarmOrderData = !isLoading && hasPermission("orders.create");

  useEffect(() => {
    if (!scopeId || !canWarmOrderData) return;
    return runIdle(() => {
      if (!readNewOrderCatalogReference(scopeId)) {
        void Promise.all([getActiveGarmentTypesAction(), getAddOnsAction()])
          .then(async ([garmentTypes, addOns]) => {
            const configurations = await getGarmentTypeConfigurationsAction(
              garmentTypes.map((garment) => garment.id)
            );
            writeNewOrderCatalogReference(scopeId, {
              garmentTypes,
              addOns,
              configurations,
            });
          })
          .catch(() => undefined);
      }

      if (!readNewOrderBillingSettings(scopeId)) {
        void getOrderPricingBillingSettingsAction()
          .then((settings) => writeNewOrderBillingSettings(scopeId, settings))
          .catch(() => undefined);
      }

      if (!readNewOrderPreferences(scopeId)) {
        void getNewOrderPreferencesAction()
          .then((preferences) => writeNewOrderPreferences(scopeId, preferences))
          .catch(() => undefined);
      }

      if (!readNewOrderOperatorStaff(scopeId)) {
        void getActiveOperatorStaffAction()
          .then((result) => {
            if (result.success) writeNewOrderOperatorStaff(scopeId, result.data);
          })
          .catch(() => undefined);
      }
    });
  }, [canWarmOrderData, scopeId]);

  return null;
}
