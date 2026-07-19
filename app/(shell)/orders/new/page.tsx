"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, Loader2 } from "lucide-react";
import { paymentModes } from "@/lib/constants";
import {
  getCustomerByIdAction,
  getCustomerByPhoneAction,
  getCustomerDetailAction,
  getCustomerMeasurementsAction,
  getGarmentMeasurementsForCustomerAction,
  saveGarmentMeasurementAction,
  searchCustomersAction,
} from "@/app/(shell)/customers/actions";
import {
  createOrderAction,
  createOrderForNewCustomerAction,
} from "@/app/(shell)/orders/actions";
import {
  getActiveGarmentTypesAction,
  getAddOnsAction,
} from "@/app/(shell)/catalog/actions";
import type { CustomerDetail } from "@/lib/customers-db";
import type { CatalogAddOn, CatalogGarmentType } from "@/lib/catalog";
import type {
  Customer,
  CustomerMeasurements,
  GarmentMeasurement,
  Gender,
  Order,
  PaymentMode,
} from "@/lib/types";
import { BalanceBadge } from "@/components/orders/orders-table";
import {
  countFilledFields,
  measurementValuesOnly,
} from "@/components/orders/garment-measurement-modal";
import {
  NewOrderItemsCard,
  blankDraftItem,
  computeOrderItems,
  orderItemToDraftItem,
  type DraftItem,
} from "@/components/orders/new-order-items-card";
import {
  OrderAttachmentDraftCard,
  uploadQueuedOrderAttachmentsDetailed,
  type AttachmentUploadFailure,
  type AttachmentItemOption,
  type QueuedOrderAttachment,
} from "@/components/orders/order-attachment-draft-card";
import { NewOrderSummaryPanel } from "@/components/orders/new-order-summary-panel";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { logWhatsAppMessageAction } from "@/app/(shell)/communications/actions";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { formatCurrency } from "@/lib/currency";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

type CustomerEntryMode = "search" | "selected" | "new";

const emptyCustomerDraft = {
  phone: "",
  name: "",
  area: "",
  address: "",
  gender: "Male" as Gender,
};

function money(value: number) {
  return formatCurrency(value);
}

function orderReceiptUrl(orderId: string) {
  if (typeof window === "undefined") return `/orders/${orderId}/print/customer`;
  return `${window.location.origin}/orders/${orderId}/print/customer`;
}

function buildOrderConfirmationMessage(order: Order): string {
  const customerName = order.customerSnapshot?.name ?? "Customer";
  return [
    `Hi ${customerName}, your order ${order.orderNumber} has been confirmed.`,
    `Delivery date: ${order.deliveryDate}`,
    order.deliveryPromiseNote ? `Promise note: ${order.deliveryPromiseNote}` : undefined,
    `Total: ${money(order.totalAmount)}`,
    `Paid: ${money(order.advancePaid)}`,
    `Balance: ${money(order.balance)}`,
    `Receipt: ${orderReceiptUrl(order.id)}`,
  ].filter(Boolean).join("\n");
}

function NewOrderPageContent() {
  const router = useRouter();
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const canPrintJobCard = hasPermission("orders.printJobCard");
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customerId");
  const [customerMode, setCustomerMode] = useState<CustomerEntryMode>("search");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerResultsOpen, setCustomerResultsOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchCompleted, setCustomerSearchCompleted] = useState(false);
  const [newCustomer, setNewCustomer] = useState(emptyCustomerDraft);
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);

  const [orderDate, setOrderDate] = useState(todayIso());
  const [trialDate, setTrialDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryPromiseNote, setDeliveryPromiseNote] = useState("");

  const [items, setItems] = useState<DraftItem[]>([blankDraftItem()]);
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedOrderAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const [advancePaid, setAdvancePaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");

  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [savedOrder, setSavedOrder] = useState<Order | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [profileUpdateWarning, setProfileUpdateWarning] = useState<string | null>(null);
  const [attachmentUploadFailures, setAttachmentUploadFailures] = useState<
    AttachmentUploadFailure[]
  >([]);
  const [attachmentUploadCount, setAttachmentUploadCount] = useState(0);
  const [repeatCopyMessage, setRepeatCopyMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leavingToOrders, setLeavingToOrders] = useState(false);

  // Phase 6B: Catalog data (active garment types, all add-ons) is fetched
  // once here and threaded down to NewOrderItemsCard as props — every
  // per-row/per-render lookup inside that component and the pure helpers
  // below stays a synchronous array find(), not its own Supabase call.
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [addOns, setAddOns] = useState<CatalogAddOn[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getActiveGarmentTypesAction(), getAddOnsAction()]).then(
      ([garments, allAddOns]) => {
        if (cancelled) return;
        setGarmentTypes(garments);
        setAddOns(allAddOns);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [phoneDuplicateCustomer, setPhoneDuplicateCustomer] = useState<Customer | null>(null);
  const [phoneDuplicateChecking, setPhoneDuplicateChecking] = useState(false);
  const [similarNameCustomers, setSimilarNameCustomers] = useState<Customer[]>([]);
  const [similarNameChecking, setSimilarNameChecking] = useState(false);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | undefined>(
    undefined
  );
  const [customerMeasurements, setCustomerMeasurements] = useState<
    CustomerMeasurements | undefined
  >(undefined);
  const [customerGarmentMeasurements, setCustomerGarmentMeasurements] = useState<
    GarmentMeasurement[]
  >([]);

  // isDirty's baseline — starts blank, updated once if a prefill customer
  // loads, so "dirty" only reflects changes made *after* the form settled
  // into its starting state (prefilled or not).
  function applyCustomer(c: Customer) {
    setMatchedCustomer(c);
    setCustomerMode("selected");
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setCustomerResultsOpen(false);
    setCustomerSearchCompleted(false);
    setDuplicateCustomer(null);
    setPhoneDuplicateCustomer(null);
    setSimilarNameCustomers([]);
    setNewCustomer(emptyCustomerDraft);
    setRepeatCopyMessage(null);
  }

  // Prefill from ?customerId= (the "New Order" link from an already-selected
  // customer) — fetched via Server Action now, so the form starts blank and
  // populates a moment after mount instead of on first paint.
  useEffect(() => {
    if (!prefillCustomerId) return;
    let cancelled = false;
    getCustomerByIdAction(prefillCustomerId).then((c) => {
      if (cancelled || !c) return;
      applyCustomer(c);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomerId]);

  // Phone-suggestions autosuggest — only searches once a customer isn't
  // already matched, same trigger condition as before.
  useEffect(() => {
    if (customerMode !== "search" || !customerSearchQuery.trim()) {
      setCustomerSearchResults([]);
      setCustomerResultsOpen(false);
      setCustomerSearchLoading(false);
      setCustomerSearchCompleted(false);
      return;
    }
    let cancelled = false;
    setCustomerSearchLoading(true);
    setCustomerSearchCompleted(false);
    searchCustomersAction(customerSearchQuery).then((results) => {
      if (cancelled) return;
      setCustomerSearchResults(results.slice(0, 8));
      setCustomerSearchLoading(false);
      setCustomerSearchCompleted(true);
      setCustomerResultsOpen(
        !!customerSearchRef.current?.contains(document.activeElement)
      );
    });
    return () => {
      cancelled = true;
      setCustomerSearchLoading(false);
    };
  }, [customerMode, customerSearchQuery]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!customerSearchRef.current?.contains(event.target as Node)) {
        setCustomerResultsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const phone = newCustomer.phone.trim();
    if (customerMode !== "new" || !/^\d{10}$/.test(phone)) {
      setPhoneDuplicateCustomer(null);
      setPhoneDuplicateChecking(false);
      return;
    }
    let cancelled = false;
    setPhoneDuplicateChecking(true);
    getCustomerByPhoneAction(phone).then((customer) => {
      if (cancelled) return;
      setPhoneDuplicateCustomer(customer ?? null);
      setPhoneDuplicateChecking(false);
    });
    return () => {
      cancelled = true;
      setPhoneDuplicateChecking(false);
    };
  }, [customerMode, newCustomer.phone]);

  useEffect(() => {
    const name = newCustomer.name.trim();
    if (customerMode !== "new" || name.length < 2) {
      setSimilarNameCustomers([]);
      setSimilarNameChecking(false);
      return;
    }
    let cancelled = false;
    setSimilarNameChecking(true);
    searchCustomersAction(name).then((customers) => {
      if (cancelled) return;
      const normalized = name.toLowerCase();
      setSimilarNameCustomers(
        customers
          .filter((customer) =>
            customer.name.toLowerCase().includes(normalized)
          )
          .slice(0, 4)
      );
      setSimilarNameChecking(false);
    });
    return () => {
      cancelled = true;
      setSimilarNameChecking(false);
    };
  }, [customerMode, newCustomer.name]);

  // Previous Orders / saved-measurements summary panel data — re-fetched
  // whenever the matched customer changes.
  useEffect(() => {
    if (!matchedCustomer) {
      setCustomerDetail(undefined);
      setCustomerMeasurements(undefined);
      setCustomerGarmentMeasurements([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      getCustomerDetailAction(matchedCustomer.id),
      getCustomerMeasurementsAction(matchedCustomer.id),
      getGarmentMeasurementsForCustomerAction(matchedCustomer.id),
    ]).then(([detail, measurements, garmentMeasurements]) => {
      if (cancelled) return;
      setCustomerDetail(detail);
      setCustomerMeasurements(measurements);
      setCustomerGarmentMeasurements(garmentMeasurements);
    });
    return () => {
      cancelled = true;
    };
  }, [matchedCustomer]);

  const { computedItems, totalAmount } = computeOrderItems(items, garmentTypes, addOns);
  const balance = totalAmount - advancePaid;

  const trimmedNewPhone = newCustomer.phone.trim();
  const trimmedNewName = newCustomer.name.trim();
  const isCreatingNewCustomer = customerMode === "new";
  const hasSelectedCustomer = customerMode === "selected" && matchedCustomer;
  const phoneInvalid =
    isCreatingNewCustomer && trimmedNewPhone && !/^\d{10}$/.test(trimmedNewPhone);
  const anyGarmentSelected = items.some((it) => it.garmentTypeId);
  const hasInvalidQtyOrRate = items.some(
    (it) => it.garmentTypeId && (it.qty <= 0 || it.rate < 0)
  );
  const hasValidItem = computedItems.some(
    (it, i) => items[i].garmentTypeId && it.qty > 0 && it.rate >= 0
  );
  const attachmentItemOptions: AttachmentItemOption[] = [];
  let predictedSerialNo = 1;
  items.forEach((item, index) => {
    const computed = computedItems[index];
    const valid = item.garmentTypeId && computed.qty > 0 && computed.rate >= 0;
    const garmentName =
      garmentTypes.find((garment) => garment.id === item.garmentTypeId)?.name ||
      computed.particular ||
      "Unselected item";
    attachmentItemOptions.push({
      key: item.draftKey,
      label: `Item ${index + 1} — ${garmentName}`,
      serialNo: valid ? predictedSerialNo : undefined,
    });
    if (valid) predictedSerialNo += 1;
  });
  const attachmentValidationError =
    queuedAttachments.find((attachment) => attachment.error)?.error ??
    (queuedAttachments.some(
      (attachment) =>
        attachment.orderItemKey &&
        !attachmentItemOptions.some((option) => option.key === attachment.orderItemKey)
    )
      ? "Reassign or remove attachments linked to deleted items."
      : queuedAttachments.some(
            (attachment) =>
              attachment.orderItemKey &&
              !attachmentItemOptions.find((option) => option.key === attachment.orderItemKey)
                ?.serialNo
          )
        ? "Attachments can only be linked to valid garment items."
        : undefined);
  let itemsError: string | undefined;
  if (!anyGarmentSelected) {
    itemsError = t("validation.selectGarmentForItem");
  } else if (hasInvalidQtyOrRate) {
    itemsError = t("validation.qtyRateInvalid");
  } else if (!hasValidItem) {
    itemsError = t("validation.itemRequired");
  }
  const deliveryDateError = !deliveryDate
    ? t("validation.deliveryDateRequired")
    : deliveryDate < orderDate
      ? "Delivery date cannot be before order date."
      : undefined;
  const trialDateError =
    trialDate && orderDate && trialDate < orderDate
      ? "Trial date cannot be before order date."
      : trialDate && deliveryDate && trialDate > deliveryDate
        ? "Trial date cannot be after delivery date."
        : undefined;
  const errors = {
    customer:
      !hasSelectedCustomer && !isCreatingNewCustomer
        ? "Select an existing customer or create a new customer."
        : undefined,
    phone: isCreatingNewCustomer
      ? !trimmedNewPhone
        ? t("validation.phoneRequired")
        : phoneInvalid
          ? t("validation.phoneInvalid")
          : undefined
      : undefined,
    phoneDuplicate:
      isCreatingNewCustomer && phoneDuplicateCustomer
        ? "A customer with this phone number already exists."
        : undefined,
    name:
      isCreatingNewCustomer && !trimmedNewName
        ? t("validation.customerNameRequired")
        : undefined,
    deliveryDate: deliveryDateError,
    trialDate: trialDateError,
    items: itemsError,
    attachments: attachmentValidationError,
    advancePaid:
      advancePaid < 0
        ? t("validation.paidCannotBeNegative")
        : advancePaid > totalAmount
          ? t("validation.paidCannotExceedTotal")
          : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function handleSelectCustomer(c: Customer) {
    applyCustomer(c);
  }

  function handleChangeCustomer() {
    setMatchedCustomer(null);
    setCustomerMode("search");
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setCustomerResultsOpen(false);
    setCustomerSearchCompleted(false);
    setDuplicateCustomer(null);
    setPhoneDuplicateCustomer(null);
    setSimilarNameCustomers([]);
    setRepeatCopyMessage(null);
  }

  function handleCreateNewCustomer() {
    const query = customerSearchQuery.trim();
    setMatchedCustomer(null);
    setDuplicateCustomer(null);
    setPhoneDuplicateCustomer(null);
    setSimilarNameCustomers([]);
    setCustomerResultsOpen(false);
    setCustomerSearchCompleted(false);
    setNewCustomer({
      ...emptyCustomerDraft,
      phone: /^\d/.test(query) ? query.replace(/\D/g, "").slice(0, 10) : "",
      name: /^\d/.test(query) ? "" : query,
    });
    setCustomerMode("new");
  }

  function handleCancelNewCustomer() {
    setNewCustomer(emptyCustomerDraft);
    setDuplicateCustomer(null);
    setPhoneDuplicateCustomer(null);
    setSimilarNameCustomers([]);
    setCustomerSearchCompleted(false);
    setCustomerMode("search");
  }

  function hasMeaningfulItemDraftData() {
    return items.some(
      (it) =>
        it.garmentTypeId !== "" ||
        it.qty !== 1 ||
        it.rate !== 0 ||
        it.rateOverridden ||
        it.addOnIds.length > 0 ||
        it.fabricSource !== "Not specified" ||
        it.fabricNotes.trim() !== "" ||
        it.designNotes.trim() !== "" ||
        it.alterationIssue.trim() !== "" ||
        it.alterationRequiredChange.trim() !== "" ||
        it.linkedOriginalOrderId !== "" ||
        it.measurement !== null
    );
  }

  function handleRepeatOrder(order: Order) {
    if (
      hasMeaningfulItemDraftData() &&
      !window.confirm("Using this order will replace the current order items. Continue?")
    ) {
      return;
    }
    setItems(
      order.items.map((item) => ({
        ...orderItemToDraftItem(item, garmentTypes, addOns),
        draftKey: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        orderItemId: undefined,
      }))
    );
    setRepeatCopyMessage(`Order ${order.orderNumber} copied into this draft.`);
  }

  const isDirty =
    customerMode !== (prefillCustomerId ? "selected" : "search") ||
    customerSearchQuery.trim() !== "" ||
    newCustomer.phone !== "" ||
    newCustomer.name !== "" ||
    newCustomer.area !== "" ||
    newCustomer.address !== "" ||
    newCustomer.gender !== "Male" ||
    deliveryDate !== "" ||
    deliveryPromiseNote.trim() !== "" ||
    trialDate !== "" ||
    advancePaid !== 0 ||
    queuedAttachments.length > 0 ||
    items.some(
      (it) =>
        it.garmentTypeId !== "" ||
        it.qty !== 1 ||
        it.rate !== 0 ||
        it.addOnIds.length > 0 ||
        it.measurement !== null
    );

  function handleCancel() {
    if (isDirty && !window.confirm(t("orders.discardChanges"))) return;
    setLeavingToOrders(true);
    router.push("/orders");
  }

  async function handleSave() {
    setSubmitAttempted(true);
    if (hasErrors) return;
    setSaveError(null);
    setAttachmentError(null);
    setProfileUpdateWarning(null);
    setAttachmentUploadFailures([]);
    setAttachmentUploadCount(0);
    setSaving(true);

    const validItems = computedItems.filter(
      (it, i) => items[i].garmentTypeId && it.qty > 0 && it.rate >= 0
    );

    const profileUpdateCounts = new Map<string, number>();
    for (const it of items) {
      if (!it.measurement?.updateCustomerMeasurements) continue;
      if (countFilledFields(it.measurement) === 0) continue;
      const garment = garmentTypes.find((g) => g.id === it.garmentTypeId);
      if (!garment) continue;
      profileUpdateCounts.set(
        garment.name,
        (profileUpdateCounts.get(garment.name) ?? 0) + 1
      );
    }
    const duplicateProfileUpdate = Array.from(profileUpdateCounts.entries()).find(
      ([, count]) => count > 1
    );
    if (duplicateProfileUpdate) {
      setSaving(false);
      setSaveError(
        `Choose only one ${duplicateProfileUpdate[0]} item to update the customer's saved measurements.`
      );
      return;
    }

    async function persistMeasurementEdits(customerId: string): Promise<string | null> {
      for (const it of items) {
        const garment = garmentTypes.find((g) => g.id === it.garmentTypeId);
        if (!garment || !it.measurement) continue;
        if (!it.measurement.updateCustomerMeasurements) continue;
        if (countFilledFields(it.measurement) === 0) continue;
        const measurementValues = measurementValuesOnly(it.measurement.values);
        const measurementResult = await saveGarmentMeasurementAction({
          customerId,
          garmentType: garment.name,
          values: measurementValues,
          fitNotes: "",
          notes: it.measurement.notes,
          source: "New order",
        });
        if (!measurementResult.success) {
          return measurementResult.error;
        }
      }
      return null;
    }

    let created: Awaited<ReturnType<typeof createOrderAction>>;
    if (matchedCustomer) {
      created = await createOrderAction({
        customerId: matchedCustomer.id,
        orderDate,
        trialDate,
        deliveryDate,
        deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
        items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
        advancePaid,
        paymentMode,
      });
    } else {
      const existingByPhone = await getCustomerByPhoneAction(trimmedNewPhone);
      if (existingByPhone) {
        setSaving(false);
        setDuplicateCustomer(existingByPhone);
        setPhoneDuplicateCustomer(existingByPhone);
        setSaveError("A customer with this phone number already exists.");
        return;
      }
      created = await createOrderForNewCustomerAction({
        customer: {
          name: trimmedNewName,
          phone: trimmedNewPhone,
          address: newCustomer.address.trim(),
          area: newCustomer.area.trim(),
          gender: newCustomer.gender,
        },
        order: {
          orderDate,
          trialDate,
          deliveryDate,
          deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
          items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
          advancePaid,
          paymentMode,
        },
      });
    }
    if (!created.success) {
      setSaving(false);
      if (created.error === "A customer with this phone number already exists.") {
        const existingByPhone = await getCustomerByPhoneAction(trimmedNewPhone);
        if (existingByPhone) {
          setPhoneDuplicateCustomer(existingByPhone);
          setDuplicateCustomer(existingByPhone);
        }
      }
      setSaveError(created.error);
      return;
    }
    const postSaveWarnings: string[] = [];
    const measurementError = await persistMeasurementEdits(created.data.customerId);
    if (measurementError) {
      postSaveWarnings.push(
        `Saved customer measurements were not updated: ${measurementError}`
      );
    }
    if (queuedAttachments.length > 0) {
      const savedAttachmentItemOptions = attachmentItemOptions.map((option) => {
        const savedItem = option.serialNo
          ? created.data.items.find((item) => item.serialNo === option.serialNo)
          : undefined;
        return {
          ...option,
          orderItemId: savedItem?.id,
          serialNo: savedItem?.serialNo ?? option.serialNo,
        };
      });
      const attachmentResult = await uploadQueuedOrderAttachmentsDetailed({
        orderId: created.data.id,
        queued: queuedAttachments,
        itemOptions: savedAttachmentItemOptions,
      });
      setAttachmentUploadCount(attachmentResult.uploadedCount);
      if (attachmentResult.failures.length > 0) {
        setAttachmentUploadFailures(attachmentResult.failures);
        setQueuedAttachments((current) =>
          current.filter((attachment) =>
            attachmentResult.failures.some((failure) => failure.id === attachment.id)
          )
        );
      } else {
        setAttachmentUploadFailures([]);
        setQueuedAttachments([]);
      }
    }
    setProfileUpdateWarning(postSaveWarnings.join(" "));
    setSaving(false);

    // Show the success state with print options rather than redirecting
    // immediately — the shopkeeper's very next step is usually printing the
    // receipt/job card, so don't force them back to the list first.
    setSavedOrder(created.data);
  }

  function handleViewOrder() {
    if (!savedOrder) return;
    setLeavingToOrders(true);
    router.push(`/orders?created=1&orderId=${savedOrder.id}`);
  }

  function handleOpenOrderAttachments() {
    if (!savedOrder) return;
    setLeavingToOrders(true);
    router.push(`/orders/${savedOrder.id}#attachments`);
  }

  function handleBackToOrders() {
    setLeavingToOrders(true);
    router.push("/orders?created=1");
  }

  function handleWhatsAppConfirmation(order: Order) {
    const phone = order.customerSnapshot?.phone;
    if (!phone) return;
    const message = buildOrderConfirmationMessage(order);
    void logWhatsAppMessageAction({
      phone,
      message,
      contextType: "Order",
      contextId: order.id,
      status: "Opened",
    });
    window.open(buildWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
  }

  // A draft view of the order for BalanceBadge's paid/due/overdue logic, so
  // Payment Status reuses the exact same computation as the rest of the app
  // instead of a second copy of the rules. An empty deliveryDate sorts as
  // "before" any real date string, which would make BalanceBadge report
  // "overdue" before the shopkeeper has even picked a delivery date — so an
  // unset date is treated as far in the future here instead.
  const draftOrderForBadge: Order = {
    id: "draft",
    orderNumber: "Draft",
    customerId: matchedCustomer?.id ?? "",
    orderDate,
    trialDate,
    deliveryDate: deliveryDate || "9999-12-31",
    deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
    items: computedItems,
    totalAmount,
    advancePaid,
    balance,
    paymentMode,
    status: "In Progress",
  };

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <button
          type="button"
          onClick={handleCancel}
          disabled={leavingToOrders}
          aria-busy={leavingToOrders}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink disabled:cursor-wait disabled:opacity-70"
        >
          {leavingToOrders ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
          {leavingToOrders ? "Opening orders..." : t("orders.backToOrders")}
        </button>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold text-ink">{t("orders.newOrder")}</h1>
            <p className="text-sm text-ink-muted">
              Order number will be assigned on save.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-5">
            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[17px] font-semibold text-ink">
                  {t("orders.customerDetails")}
                </h3>
                {customerMode === "new" && (
                  <button
                    type="button"
                    onClick={handleCancelNewCustomer}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    Back to Customer Search
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {customerMode === "selected" && matchedCustomer && (
                  <div className="rounded-lg border border-primary/20 bg-primary-tint px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase text-primary">
                          Selected Customer
                        </div>
                        <div className="truncate text-sm font-semibold text-ink">
                          {matchedCustomer.name}
                        </div>
                        <div className="mt-0.5 text-sm text-ink-muted">
                          {matchedCustomer.phone} · {matchedCustomer.area || "-"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleChangeCustomer}
                        className="shrink-0 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                      >
                        {t("orders.changeCustomer")}
                      </button>
                    </div>
                  </div>
                )}
                <div
                  ref={customerSearchRef}
                  className={cn("relative", customerMode !== "search" && "hidden")}
                >
                  <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">Customer</span>
                  <input
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setCustomerResultsOpen(true);
                    }}
                    onFocus={() => {
                      if (customerSearchResults.length > 0) setCustomerResultsOpen(true);
                    }}
                    placeholder="Search by phone number or customer name"
                    className={cn(
                      inputClass,
                      (customerSearchLoading ||
                        (customerResultsOpen && customerSearchResults.length > 0)) &&
                        "rounded-b-none",
                      submitAttempted && errors.customer && "border-chip-red-fg"
                    )}
                  />
                  </label>
                  {customerSearchLoading && (
                    <div className="-mt-px h-0.5 overflow-hidden bg-primary-tint">
                      <div className="h-full w-1/2 animate-pulse bg-primary" />
                    </div>
                  )}
                  {customerSearchLoading && customerSearchResults.length === 0 && (
                    <div className="-mt-px rounded-b-lg border border-border border-t-0 bg-white px-4 py-3 text-sm text-ink-muted shadow-soft">
                      Searching...
                    </div>
                  )}
                  {customerResultsOpen &&
                    customerSearchCompleted &&
                    !customerSearchLoading &&
                    customerSearchResults.length === 0 && (
                      <div className="-mt-px rounded-b-lg border border-border border-t-0 bg-white px-4 py-3 text-sm text-ink-muted shadow-soft">
                        No customers found.
                      </div>
                    )}
                  {customerResultsOpen && customerSearchResults.length > 0 && (
                    <ul className="-mt-px max-h-56 overflow-y-auto rounded-b-lg border border-border border-t-0 bg-primary-tint/15 shadow-soft">
                      {customerSearchResults.map((c) => (
                        <li key={c.id} className="border-b border-border-soft last:border-b-0">
                          <button
                            type="button"
                            onClick={() => handleSelectCustomer(c)}
                            className="block w-full cursor-pointer px-4 py-3 text-left text-sm outline-none transition-colors hover:bg-white/70 focus:bg-white"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-ink">
                                  {c.name}
                                </div>
                                <div className="text-ink-muted">
                                  {c.phone} · {c.area || "-"}
                                </div>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-primary">
                                Select
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {submitAttempted && errors.customer && (
                    <p className="text-xs text-chip-red-fg">{errors.customer}</p>
                  )}
                </div>
                {customerMode === "search" &&
                  !customerResultsOpen &&
                  !customerSearchLoading && (
                  <button
                    type="button"
                    onClick={handleCreateNewCustomer}
                    className="text-left text-sm font-semibold text-primary hover:underline"
                  >
                    + Create New Customer
                  </button>
                )}
                {customerMode === "new" && (
                  <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Customer Name
                  </span>
                  <input
                    required
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer((current) => ({ ...current, name: e.target.value }))
                    }
                    className={cn(
                      inputClass,
                      submitAttempted && errors.name && "border-chip-red-fg"
                    )}
                  />
                  {submitAttempted && errors.name && (
                    <p className="text-xs text-chip-red-fg">{errors.name}</p>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.phoneNumber")}
                  </span>
                  <input
                    required
                    inputMode="numeric"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer((current) => ({
                        ...current,
                        phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                      }))
                    }
                    placeholder="10-digit phone number"
                    className={cn(
                      inputClass,
                      (phoneDuplicateCustomer ||
                        (submitAttempted && errors.phone)) &&
                        "border-chip-red-fg"
                    )}
                  />
                  {submitAttempted && errors.phone && (
                    <p className="text-xs text-chip-red-fg">{errors.phone}</p>
                  )}
                  {phoneDuplicateChecking && (
                    <p className="text-xs text-ink-muted">Checking phone...</p>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.area")}
                  </span>
                  <input
                    value={newCustomer.area}
                    onChange={(e) =>
                      setNewCustomer((current) => ({ ...current, area: e.target.value }))
                    }
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.address")}
                  </span>
                  <input
                    value={newCustomer.address}
                    onChange={(e) =>
                      setNewCustomer((current) => ({ ...current, address: e.target.value }))
                    }
                    className={inputClass}
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.gender")}
                  </span>
                  <div className="flex gap-2">
                    {(["Male", "Female"] as Gender[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setNewCustomer((current) => ({ ...current, gender: g }))
                        }
                        className={cn(
                          "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                          newCustomer.gender === g
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-white text-ink hover:bg-surface"
                        )}
                      >
                        {g === "Male" ? t("common.male") : t("common.female")}
                      </button>
                    ))}
                  </div>
                </div>
                  </div>
                  {phoneDuplicateCustomer && (
                    <div className="rounded-lg border border-chip-red-fg/20 bg-chip-red px-3.5 py-3 text-sm">
                      <div className="font-semibold text-chip-red-fg">
                        A customer with this phone number already exists.
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">
                            {phoneDuplicateCustomer.name}
                          </div>
                          <div className="text-ink-muted">
                            {phoneDuplicateCustomer.phone} · {phoneDuplicateCustomer.area || "-"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectCustomer(phoneDuplicateCustomer)}
                          className="shrink-0 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                        >
                          Use Existing Customer
                        </button>
                      </div>
                    </div>
                  )}
                  {similarNameCustomers.length > 0 && (
                    <div className="rounded-lg border border-border-soft bg-surface px-3.5 py-3 text-sm">
                      <div className="mb-2 font-semibold text-ink">
                        Similar customers found
                      </div>
                      <div className="divide-y divide-border-soft">
                        {similarNameCustomers.map((customer) => (
                          <div
                            key={customer.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-ink">
                                {customer.name}
                              </div>
                              <div className="text-ink-muted">
                                {customer.phone} · {customer.area || "-"}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectCustomer(customer)}
                              className="shrink-0 text-xs font-semibold text-primary hover:underline"
                            >
                              Use Existing Customer
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {similarNameChecking && similarNameCustomers.length === 0 && (
                    <p className="text-xs text-ink-muted">Checking similar names...</p>
                  )}
                  {duplicateCustomer && !phoneDuplicateCustomer && (
                    <div className="rounded-lg bg-chip-red px-3.5 py-2.5 text-xs font-medium text-chip-red-fg">
                      This phone number already belongs to {duplicateCustomer.name}. Select that customer instead.
                    </div>
                  )}
                </>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-4 text-[17px] font-semibold text-ink">
                {t("orders.orderDates")}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.orderDate")}
                  </span>
                  <input
                    type="date"
                    required
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.deliveryDate")} <span className="text-chip-red-fg">*</span>
                  </span>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className={cn(
                      inputClass,
                      submitAttempted &&
                        errors.deliveryDate &&
                        "border-chip-red-fg"
                    )}
                  />
                  {submitAttempted && errors.deliveryDate && (
                    <p className="text-xs text-chip-red-fg">
                      {errors.deliveryDate}
                    </p>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-faint">
                    {t("orders.trialDate")} <span className="font-normal">({t("common.optional")})</span>
                  </span>
                  <input
                    type="date"
                    value={trialDate}
                    onChange={(e) => setTrialDate(e.target.value)}
                    className={cn(
                      inputClass,
                      submitAttempted && errors.trialDate && "border-chip-red-fg"
                    )}
                  />
                  {submitAttempted && errors.trialDate && (
                    <p className="text-xs text-chip-red-fg">
                      {errors.trialDate}
                    </p>
                  )}
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-3">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Delivery Promise Note
                  </span>
                  <textarea
                    value={deliveryPromiseNote}
                    onChange={(e) => setDeliveryPromiseNote(e.target.value)}
                    rows={2}
                    placeholder="Verbal promise, pickup timing, urgency, customer expectation..."
                    className="min-h-[44px] rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                  />
                </label>
              </div>
            </div>

            {submitAttempted && errors.items && (
              <p className="text-xs font-medium text-chip-red-fg">
                {errors.items}
              </p>
            )}
            <NewOrderItemsCard
              customerId={matchedCustomer?.id ?? null}
              items={items}
              onItemsChange={setItems}
              garmentTypes={garmentTypes}
              addOns={addOns}
              previousOrders={customerDetail?.orders ?? []}
              autoSnapshotDefaultMeasurements
            />

            <OrderAttachmentDraftCard
              itemOptions={attachmentItemOptions}
              queued={queuedAttachments}
              onQueuedChange={setQueuedAttachments}
              error={(submitAttempted && errors.attachments) || attachmentError}
            />

            {canViewPayments && (
            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-4 text-[17px] font-semibold text-ink">
                {t("orders.paymentSummary")}
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.total")}
                  </span>
                  <div className="flex h-11 items-center text-sm font-semibold text-ink">
                    {formatCurrency(totalAmount)}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.paidAdvance")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={totalAmount}
                    value={advancePaid}
                    onChange={(e) => setAdvancePaid(Number(e.target.value))}
                    className={cn(
                      inputClass,
                      submitAttempted &&
                        errors.advancePaid &&
                        "border-chip-red-fg"
                    )}
                  />
                  {submitAttempted && errors.advancePaid && (
                    <p className="text-xs text-chip-red-fg">
                      {errors.advancePaid}
                    </p>
                  )}
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.balance")}
                  </span>
                  <div className="flex h-11 items-center text-sm font-semibold text-ink">
                    {formatCurrency(balance)}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("orders.paymentMode")}
                  </span>
                  <Select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  >
                    {paymentModes.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border-soft pt-4">
                <span className="text-sm text-ink-muted">{t("orders.paymentStatus")}</span>
                {totalAmount === 0 ? (
                  <span className="inline-block rounded-full bg-chip-info px-3 py-1 text-xs font-semibold text-chip-info-fg">
                    {t("orders.notCalculated")}
                  </span>
                ) : (
                  <BalanceBadge order={draftOrderForBadge} todayIso={todayIso()} />
                )}
              </div>
            </div>
            )}
          </div>

          <div className="min-w-0">
            <NewOrderSummaryPanel
              customer={matchedCustomer}
              detail={customerDetail}
              measurements={customerMeasurements}
              garmentMeasurements={customerGarmentMeasurements}
              onRepeatOrder={handleRepeatOrder}
              repeatCopyMessage={repeatCopyMessage}
              newCustomerPending={customerMode === "new"}
            />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-soft bg-white shadow-soft md:left-[250px]">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            {saveError ? (
              <span className="font-medium text-chip-red-fg">{saveError}</span>
            ) : canViewPayments ? (
              <>
                <span>
                  {t("common.total")}: <span className="font-semibold text-ink">{formatCurrency(totalAmount)}</span>
                </span>
                <span className="text-border">|</span>
                <span>
                  {t("common.paid")}: <span className="font-semibold text-ink">{formatCurrency(advancePaid)}</span>
                </span>
                <span className="text-border">|</span>
                <span>
                  {t("common.balance")}: <span className="font-semibold text-ink">{formatCurrency(balance)}</span>
                </span>
              </>
            ) : (
              <span>
                {computedItems.length} item{computedItems.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : t("orders.saveOrder")}
            </button>
          </div>
        </div>
      </div>

      {savedOrder && (
        <>
          {/* z-[80]/[90], above the Measurements modal's z-[60]/[70] — the
              success modal must always win if that modal's overlay hasn't
              fully unmounted yet. */}
          <div className="fixed inset-0 z-[80] bg-black/40" />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl border border-border-soft bg-white p-6 text-center shadow-soft">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-chip-mint">
                <CheckCircle2 className="h-6 w-6 text-chip-mint-fg" />
              </div>
              <h3 className="text-[17px] font-semibold text-ink">
                {attachmentUploadFailures.length > 0
                  ? `${savedOrder.orderNumber} was created with attachment issues`
                  : t("orders.orderCreatedSuccess")}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                {savedOrder.orderNumber}
              </p>
              {attachmentUploadFailures.length > 0 && (
                <div className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-left text-xs font-medium text-chip-red-fg">
                  <p>
                    Order {savedOrder.orderNumber} was created, but{" "}
                    {attachmentUploadFailures.length} attachment
                    {attachmentUploadFailures.length === 1 ? "" : "s"} could not be uploaded.
                  </p>
                  {attachmentUploadCount > 0 && (
                    <p className="mt-1">
                      {attachmentUploadCount} attachment
                      {attachmentUploadCount === 1 ? "" : "s"} uploaded successfully.
                    </p>
                  )}
                  <div className="mt-2 space-y-1">
                    <p>Failed attachments:</p>
                    {attachmentUploadFailures.map((failure) => (
                      <p key={failure.id}>
                        {failure.fileName} - {failure.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {profileUpdateWarning && (
                <p className="mt-3 rounded-lg bg-chip-red px-3 py-2 text-left text-xs font-medium text-chip-red-fg">
                  {profileUpdateWarning}
                </p>
              )}
              <div className="mt-5 space-y-2">
                {canPrintReceipt && (
                  <Link
                    href={`/orders/${savedOrder.id}/print/customer`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    {t("orders.printCustomerReceipt")}
                  </Link>
                )}
                {attachmentUploadFailures.length > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenOrderAttachments}
                    disabled={leavingToOrders}
                    aria-busy={leavingToOrders}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-wait disabled:opacity-70"
                  >
                    {leavingToOrders && <Loader2 className="h-4 w-4 animate-spin" />}
                    {leavingToOrders
                      ? "Opening order..."
                      : "Open Order and Retry Attachments"}
                  </button>
                )}
                {savedOrder.customerSnapshot?.phone && (
                  <button
                    type="button"
                    onClick={() => handleWhatsAppConfirmation(savedOrder)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary-tint px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Send WhatsApp confirmation
                  </button>
                )}
                {canPrintJobCard && (
                  <Link
                    href={`/orders/${savedOrder.id}/job-cards/print`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    Print All Job Cards
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleViewOrder}
                  disabled={leavingToOrders}
                  aria-busy={leavingToOrders}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-wait disabled:opacity-70"
                >
                  {leavingToOrders && <Loader2 className="h-4 w-4 animate-spin" />}
                  {leavingToOrders ? "Opening orders..." : t("orders.viewOrder")}
                </button>
                <button
                  type="button"
                  onClick={handleBackToOrders}
                  disabled={leavingToOrders}
                  aria-busy={leavingToOrders}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface disabled:cursor-wait disabled:opacity-70"
                >
                  {leavingToOrders && <Loader2 className="h-4 w-4 animate-spin" />}
                  {leavingToOrders ? "Opening orders..." : t("orders.backToOrders")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <RequirePermission permission="orders.create">
      <Suspense>
        <NewOrderPageContent />
      </Suspense>
    </RequirePermission>
  );
}
