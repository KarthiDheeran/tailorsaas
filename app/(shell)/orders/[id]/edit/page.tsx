"use client";

import { useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCustomerByIdAction } from "@/app/(shell)/customers/actions";
import {
  getOrderAttachmentsAction,
  getOrderByIdAction,
} from "@/app/(shell)/orders/actions";
import { EditOrderForm } from "@/components/orders/edit-order-form";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";
import type { Customer, Order, OrderAttachment } from "@/lib/types";

function EditOrderPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [navigatingBack, setNavigatingBack] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const foundOrder = await getOrderByIdAction(params.id);
      if (cancelled) return;
      if (!foundOrder) {
        setLoaded(true);
        return;
      }
      setOrder(foundOrder);
      const [foundCustomer, foundAttachments] = await Promise.all([
        getCustomerByIdAction(foundOrder.customerId),
        getOrderAttachmentsAction(foundOrder.id).catch(() => []),
      ]);
      if (cancelled) return;
      setCustomer(foundCustomer);
      setAttachments(foundAttachments);
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
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <LoadingState label="Loading order edit form..." />
      </div>
    );
  }

  function goToDetails(orderId = order!.id) {
    setNavigatingBack(true);
    router.push(`/orders/${orderId}`);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <button
        type="button"
        onClick={() => goToDetails()}
        disabled={navigatingBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
      >
        <ChevronLeft className="h-4 w-4" />
        {navigatingBack ? "Opening..." : "Back to Order Details"}
      </button>

      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">{t("orders.editOrder")}</h1>
        <p className="text-sm text-ink-muted">{order.orderNumber}</p>
      </div>

      <EditOrderForm
        order={order}
        customer={customer}
        initialAttachments={attachments}
        onCancel={() => goToDetails()}
        onSaved={(updated) => goToDetails(updated.id)}
      />
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
