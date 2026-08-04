"use client";

import { useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getEditOrderBootstrapAction } from "@/app/(shell)/orders/actions";
import { EditOrderForm } from "@/components/orders/edit-order-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";
import type { Customer, Order, OrderAttachment } from "@/lib/types";
import type { CatalogAddOn, CatalogGarmentType, GarmentTypeConfiguration } from "@/lib/catalog";
import type { ShopBillingSettings } from "@/lib/data/shop-billing-settings-db";

function EditOrderPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [addOns, setAddOns] = useState<CatalogAddOn[]>([]);
  const [garmentConfigurations, setGarmentConfigurations] = useState<GarmentTypeConfiguration[]>([]);
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [navigatingBack, setNavigatingBack] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await getEditOrderBootstrapAction(params.id);
      if (cancelled) return;
      const foundOrder = data.order;
      if (!foundOrder) {
        setLoaded(true);
        return;
      }
      setOrder(foundOrder);
      setCustomer(data.customer);
      setAttachments(data.attachments);
      setGarmentTypes(data.garmentTypes);
      setAddOns(data.addOns);
      setGarmentConfigurations(data.garmentConfigurations);
      setBillingSettings(data.billingSettings);
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loaded && !order) {
    notFound();
  }

  if (!loaded || !order) {
    return (
      <div className="mx-auto max-w-[1600px] p-4 sm:px-6 sm:py-3 lg:px-8 2xl:max-w-[1760px]">
        <LoadingState label="Loading order edit form..." />
      </div>
    );
  }

  function goToDetails(orderId = order!.id) {
    setNavigatingBack(true);
    router.push(`/orders/${orderId}`);
  }

  return (
    <div className="min-h-screen bg-[#f5f8ff]">
      <div className="mx-auto max-w-none p-2 sm:px-3 sm:py-2 lg:px-4 2xl:max-w-none">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#c9d7ea] bg-white px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-ink">
              {t("orders.editOrder")}
            </h1>
            <p className="text-xs text-ink-muted">
              Compact desktop layout for fast order updates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => goToDetails()}
            disabled={navigatingBack}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {navigatingBack ? "Opening..." : "Back to Order Details"}
          </button>
        </div>

        <EditOrderForm
          order={order}
          customer={customer}
          initialAttachments={attachments}
          initialGarmentTypes={garmentTypes}
          initialAddOns={addOns}
          initialGarmentConfigurations={garmentConfigurations}
          initialBillingSettings={billingSettings ?? undefined}
          onCancel={() => goToDetails()}
          onSaved={(updated) => goToDetails(updated.id)}
        />
      </div>
    </div>
  );
}

export default function EditOrderPage({ params }: { params: { id: string } }) {
  return (
    <RequirePermission permission="orders.edit">
      <EditOrderPageContent params={params} />
    </RequirePermission>
  );
}
