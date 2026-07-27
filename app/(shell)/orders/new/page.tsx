"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRightLeft, CalendarDays, CheckCircle2, Loader2, UserRound } from "lucide-react";
import { paymentModes } from "@/lib/constants";
import {
  getCustomerByIdAction,
  getCustomerByPhoneAction,
  getCustomerDetailAction,
  saveGarmentMeasurementAction,
  searchCustomersAction,
} from "@/app/(shell)/customers/actions";
import {
  createOrderAction,
  createOrderForNewCustomerAction,
} from "@/app/(shell)/orders/actions";
import { getOrderPricingBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import { getNewOrderPreferencesAction } from "@/app/(shell)/settings/order-preferences/actions";
import {
  getActiveGarmentTypesAction,
  getAddOnsAction,
} from "@/app/(shell)/catalog/actions";
import type { CustomerDetail } from "@/lib/customers-db";
import type { CatalogAddOn, CatalogGarmentType } from "@/lib/catalog";
import type {
  Customer,
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
import { StageJobCardPrintModal } from "@/components/orders/stage-job-card-print-modal";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { logWhatsAppMessageAction } from "@/app/(shell)/communications/actions";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { formatCurrency } from "@/lib/currency";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import { getOrderTaxBreakdown } from "@/lib/order-tax";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToIso(dateIso: string, days: number) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

type CustomerEntryMode = "search" | "selected" | "new";

// Searching is a server round-trip (including auth and permission checks),
// so do not issue one for every character the operator types.
const CUSTOMER_SEARCH_DEBOUNCE_MS = 250;
const CUSTOMER_SEARCH_MIN_LENGTH = 2;
const CUSTOMER_SEARCH_RESULT_LIMIT = 8;

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
  const customerSearchInputRef = useRef<HTMLInputElement>(null);
  const customerResultButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const deliveryDateWasEditedRef = useRef(false);
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
  const [garmentSelectorTarget, setGarmentSelectorTarget] =
    useState<HTMLDivElement | null>(null);
  const [newCustomer, setNewCustomer] = useState(emptyCustomerDraft);
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);

  const [orderDate, setOrderDate] = useState(todayIso());
  const trialDate = "";
  const [deliveryDate, setDeliveryDate] = useState("");
  const [defaultDeliveryLeadDays, setDefaultDeliveryLeadDays] = useState<number | null>(null);
  const deliveryPromiseNote = "";

  const [items, setItems] = useState<DraftItem[]>([blankDraftItem()]);
  const [queuedAttachments, setQueuedAttachments] = useState<QueuedOrderAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const [advancePaid, setAdvancePaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings>(
    DEFAULT_SHOP_BILLING_SETTINGS
  );

  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [savedOrder, setSavedOrder] = useState<Order | null>(null);
  const [showStagePrintModal, setShowStagePrintModal] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [profileUpdateWarning, setProfileUpdateWarning] = useState<string | null>(null);
  const [attachmentUploadFailures, setAttachmentUploadFailures] = useState<
    AttachmentUploadFailure[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    getOrderPricingBillingSettingsAction().then((settings) => {
      if (!cancelled) setBillingSettings(settings);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [attachmentUploadCount, setAttachmentUploadCount] = useState(0);
  const [repeatCopyMessage, setRepeatCopyMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leavingToOrders, setLeavingToOrders] = useState(false);
  const [garmentFocusRequest, setGarmentFocusRequest] = useState(0);

  // Phase 6B: Catalog data (active garment types, all add-ons) is fetched
  // once here and threaded down to NewOrderItemsCard as props - every
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
  const [activeCustomerResultIndex, setActiveCustomerResultIndex] = useState(0);
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [phoneDuplicateCustomer, setPhoneDuplicateCustomer] = useState<Customer | null>(null);
  const [phoneDuplicateChecking, setPhoneDuplicateChecking] = useState(false);
  const [similarNameCustomers, setSimilarNameCustomers] = useState<Customer[]>([]);
  const [similarNameChecking, setSimilarNameChecking] = useState(false);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | undefined>(
    undefined
  );

  useEffect(() => {
    if (prefillCustomerId) return;
    window.setTimeout(() => {
      customerSearchInputRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [prefillCustomerId]);

  // isDirty's baseline - starts blank, updated once if a prefill customer
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
  // customer) - fetched via Server Action now, so the form starts blank and
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

  // Customer autosuggest is a server-side lookup. Debouncing prevents one
  // request per keystroke; the cancelled flag prevents an older response from
  // replacing the latest results when requests finish out of order.
  useEffect(() => {
    const query = customerSearchQuery.trim();
    if (customerMode !== "search" || query.length < CUSTOMER_SEARCH_MIN_LENGTH) {
      setCustomerSearchResults([]);
      setActiveCustomerResultIndex(0);
      setCustomerResultsOpen(false);
      setCustomerSearchLoading(false);
      setCustomerSearchCompleted(false);
      return;
    }
    let cancelled = false;
    setCustomerSearchLoading(true);
    setCustomerSearchCompleted(false);
    const timeout = window.setTimeout(() => {
      searchCustomersAction(query, CUSTOMER_SEARCH_RESULT_LIMIT).then((results) => {
        if (cancelled) return;
        setCustomerSearchResults(results);
        setActiveCustomerResultIndex(0);
        setCustomerSearchLoading(false);
        setCustomerSearchCompleted(true);
        setCustomerResultsOpen(
          !!customerSearchRef.current?.contains(document.activeElement)
        );
      });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      setCustomerSearchLoading(false);
    };
  }, [customerMode, customerSearchQuery]);

  useEffect(() => {
    if (!customerResultsOpen) return;
    customerResultButtonRefs.current[activeCustomerResultIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeCustomerResultIndex, customerResultsOpen]);

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
    let cancelled = false;
    getNewOrderPreferencesAction().then((preferences) => {
      if (!cancelled) setDefaultDeliveryLeadDays(preferences.defaultDeliveryLeadDays);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (defaultDeliveryLeadDays === null || deliveryDateWasEditedRef.current) return;
    setDeliveryDate(addDaysToIso(orderDate, defaultDeliveryLeadDays));
  }, [defaultDeliveryLeadDays, orderDate]);

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

  // Previous Orders / customer summary panel data - re-fetched whenever the
  // matched customer changes.
  useEffect(() => {
    if (!matchedCustomer) {
      setCustomerDetail(undefined);
      return;
    }
    let cancelled = false;
    getCustomerDetailAction(matchedCustomer.id).then((detail) => {
      if (cancelled) return;
      setCustomerDetail(detail);
    });
    return () => {
      cancelled = true;
    };
  }, [matchedCustomer]);

  const { computedItems, totalAmount: taxableSubtotal } = computeOrderItems(
    items,
    garmentTypes,
    addOns
  );
  const taxBreakdown = getOrderTaxBreakdown(taxableSubtotal, billingSettings);
  const totalAmount = taxBreakdown?.totalWithTax ?? taxableSubtotal;
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
      label: `Item ${index + 1} - ${garmentName}`,
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
    setGarmentFocusRequest((current) => current + 1);
  }

  function focusCustomerResult(index: number) {
    setActiveCustomerResultIndex(index);
    window.setTimeout(() => {
      customerResultButtonRefs.current[index]?.focus();
    }, 0);
  }

  function handleCustomerSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (customerResultsOpen) {
        event.preventDefault();
        setCustomerResultsOpen(false);
      }
      return;
    }

    if (customerSearchResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCustomerResultsOpen(true);
      focusCustomerResult(activeCustomerResultIndex);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCustomerResultsOpen(true);
      focusCustomerResult(customerSearchResults.length - 1);
      return;
    }

    if (event.key === "Enter" && customerResultsOpen) {
      const activeCustomer = customerSearchResults[activeCustomerResultIndex];
      if (!activeCustomer) return;
      event.preventDefault();
      handleSelectCustomer(activeCustomer);
    }
  }

  function handleCustomerResultKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      setCustomerResultsOpen(false);
      customerSearchInputRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCustomerResult((index + 1) % customerSearchResults.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        customerSearchInputRef.current?.focus();
        return;
      }
      focusCustomerResult(index - 1);
    }
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
    // immediately - the shopkeeper's very next step is usually printing the
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
  // "overdue" before the shopkeeper has even picked a delivery date - so an
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
    <div className="pb-24">
      <div className="mx-auto max-w-[1600px] p-4 sm:px-6 sm:py-3 lg:px-8 2xl:max-w-[1760px]">
        <div
          className={cn(
            "grid grid-cols-1 gap-6 lg:items-start",
            matchedCustomer || customerMode === "new"
              ? "lg:grid-cols-[minmax(0,1fr)_360px]"
              : "lg:grid-cols-1"
          )}
        >
          <div className="min-w-0 space-y-3">
            <div
              className={cn(
                "min-h-[110px] rounded-2xl border border-[#DCE5EA] bg-white p-5 shadow-[0_4px_14px_rgba(15,23,42,0.06)] sm:p-6"
              )}
            >
              {customerMode !== "selected" && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
              )}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[11fr_9fr] lg:items-center lg:gap-6">
              <div className={cn(customerMode !== "selected" && "space-y-3")}>
                {customerMode === "selected" && matchedCustomer && (
                  <div className="flex min-h-[62px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0F766E]">
                        <UserRound className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#64748B]">Customer</p>
                        <p className="truncate text-xl font-bold tracking-tight text-[#111827]">
                          {matchedCustomer.name}
                        </p>
                        <p className="truncate text-[15px] text-[#64748B]">
                          {matchedCustomer.phone} <span aria-hidden="true">•</span> {matchedCustomer.area || "-"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangeCustomer}
                      aria-label="Change customer"
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#0F766E] bg-white px-4 text-[15px] font-semibold text-[#0F766E] transition-colors hover:bg-[#ECFDF5] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30"
                    >
                      <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                      Change Customer
                    </button>
                  </div>
                )}
                <div
                  ref={customerSearchRef}
                  className={cn("relative", customerMode !== "search" && "hidden")}
                >
                  <label className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-medium text-ink-muted">Customer</span>
                        <input
                          ref={customerSearchInputRef}
                          value={customerSearchQuery}
                          onChange={(e) => {
                            setCustomerSearchQuery(e.target.value);
                            setActiveCustomerResultIndex(0);
                            setCustomerResultsOpen(true);
                          }}
                          onFocus={() => {
                            if (customerSearchResults.length > 0) setCustomerResultsOpen(true);
                          }}
                          onKeyDown={handleCustomerSearchKeyDown}
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={customerResultsOpen}
                          aria-controls="customer-search-results"
                          aria-activedescendant={
                            customerResultsOpen && customerSearchResults[activeCustomerResultIndex]
                              ? `customer-search-result-${customerSearchResults[activeCustomerResultIndex].id}`
                              : undefined
                          }
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
                        <ul
                          id="customer-search-results"
                          role="listbox"
                          className="-mt-px max-h-56 overflow-y-auto rounded-b-lg border border-border border-t-0 bg-primary-tint/15 shadow-soft"
                        >
                          {customerSearchResults.map((c, index) => (
                            <li key={c.id} className="border-b border-border-soft last:border-b-0">
                              <button
                                id={`customer-search-result-${c.id}`}
                                ref={(node) => {
                                  customerResultButtonRefs.current[index] = node;
                                }}
                                role="option"
                                aria-selected={index === activeCustomerResultIndex}
                                type="button"
                                onClick={() => handleSelectCustomer(c)}
                                onFocus={() => setActiveCustomerResultIndex(index)}
                                onKeyDown={(event) => handleCustomerResultKeyDown(event, index)}
                                onMouseEnter={() => setActiveCustomerResultIndex(index)}
                                className={cn(
                                  "block w-full cursor-pointer px-4 py-3 text-left text-sm outline-none transition-colors hover:bg-white/70 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-primary",
                                  index === activeCustomerResultIndex && "bg-white ring-2 ring-inset ring-primary"
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate font-semibold text-ink">
                                      {c.name}
                                    </div>
                                    <div className="text-ink-muted">
                                      {c.phone} - {c.area || "-"}
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
                            {phoneDuplicateCustomer.phone} Â· {phoneDuplicateCustomer.area || "-"}
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
                                {customer.phone} Â· {customer.area || "-"}
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
              <div ref={setGarmentSelectorTarget} className="min-w-0 border-t border-[#DCE5EA] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" />
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
              paymentStrip={
                canViewPayments ? (
                  <div className="grid gap-3 rounded-xl bg-[#F8FAFC] p-3 text-sm sm:grid-cols-2 xl:grid-cols-[0.8fr_1.1fr_0.9fr_1.2fr_1.1fr]">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="block text-sm font-medium text-[#64748B]">
                        {taxBreakdown && !taxBreakdown.pricesIncludeTax ? "Total" : "Subtotal"}
                      </span>
                      <span className="flex h-11 items-center text-[21px] font-bold text-[#111827]">
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="block text-sm font-medium text-[#64748B]">
                        {t("orders.paidAdvance")}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={totalAmount}
                        value={advancePaid}
                        onChange={(e) => setAdvancePaid(Number(e.target.value))}
                        className={cn(
                          "h-11 w-full rounded-[10px] border border-[#DCE5EA] bg-white px-3 text-right text-base text-[#111827] outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20",
                          submitAttempted &&
                            errors.advancePaid &&
                            "border-chip-red-fg"
                        )}
                      />
                    </label>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="block text-sm font-medium text-[#64748B]">
                        {t("common.balance")}
                      </span>
                      <span className={cn(
                        "flex h-11 items-center text-[22px] font-extrabold",
                        balance > 0 ? "text-[#C2410C]" : "text-[#15803D]"
                      )}>
                        {formatCurrency(balance)}
                      </span>
                    </div>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="block text-sm font-medium text-[#64748B]">
                        {t("orders.paymentMode")}
                      </span>
                      <Select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                        className="h-11 rounded-[10px] border-[#DCE5EA] py-0 text-base focus:border-[#14B8A6] focus:ring-[#14B8A6]/20"
                      >
                        {paymentModes.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="block text-sm font-medium text-[#64748B]">
                        {t("orders.paymentStatus")}
                      </span>
                      <div className="flex h-11 items-center">
                        {totalAmount === 0 ? (
                          <span className="inline-block rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
                            {t("orders.notCalculated")}
                          </span>
                        ) : (
                          <BalanceBadge order={draftOrderForBadge} todayIso={todayIso()} />
                        )}
                      </div>
                    </div>
                    {submitAttempted && errors.advancePaid && (
                      <p className="text-xs font-medium text-chip-red-fg md:col-span-3 xl:col-span-5">
                        {errors.advancePaid}
                      </p>
                    )}
                  </div>
                ) : undefined
              }
              autoSnapshotDefaultMeasurements
              focusFirstGarmentRequest={garmentFocusRequest}
              garmentSelectorTarget={garmentSelectorTarget}
            />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-stretch">
              <div className="rounded-2xl border border-[#DCE5EA] bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)] sm:p-5 lg:grid lg:min-h-[96px] lg:grid-cols-[auto_minmax(165px,1fr)_minmax(165px,1fr)] lg:items-center lg:gap-4 lg:p-4">
                <h3 className="mb-4 flex items-center gap-2.5 text-[21px] font-bold tracking-tight text-[#111827] lg:mb-0 lg:whitespace-nowrap">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0F766E]">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {t("orders.orderDates")}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:contents">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[15px] font-semibold text-[#334155]">
                      {t("orders.orderDate")}
                    </span>
                    <input
                      type="date"
                      required
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      className="h-11 w-full rounded-[10px] border border-[#DCE5EA] bg-white px-3.5 text-base text-[#111827] outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[15px] font-semibold text-[#334155]">
                      {t("orders.deliveryDate")} <span className="text-chip-red-fg">*</span>
                    </span>
                    <input
                      type="date"
                      required
                      value={deliveryDate}
                      onChange={(e) => {
                        deliveryDateWasEditedRef.current = true;
                        setDeliveryDate(e.target.value);
                      }}
                      className={cn(
                        "h-11 w-full rounded-[10px] border border-[#DCE5EA] bg-white px-3.5 text-base text-[#111827] outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/20",
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
                </div>
              </div>
              <OrderAttachmentDraftCard
                inlineSummary
                queued={queuedAttachments}
                onQueuedChange={setQueuedAttachments}
                error={(submitAttempted && errors.attachments) || attachmentError}
              />
              </div>

          </div>

          <div className="min-w-0">
            <NewOrderSummaryPanel
              customer={matchedCustomer}
              detail={customerDetail}
              onRepeatOrder={handleRepeatOrder}
              repeatCopyMessage={repeatCopyMessage}
              newCustomerPending={customerMode === "new"}
            />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E5E7EB] bg-white shadow-soft">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7 2xl:max-w-[1760px]">
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            {saveError ? (
              <span className="font-medium text-chip-red-fg">{saveError}</span>
            ) : canViewPayments ? (
              <>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-[#64748B]">{t("common.total")}</span>
                  <span className="text-base font-bold text-[#111827]">{formatCurrency(totalAmount)}</span>
                </span>
                <span aria-hidden="true" className="h-5 w-px bg-[#DCE5EA]" />
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-[#64748B]">{t("common.paid")}</span>
                  <span className="text-base font-bold text-[#111827]">{formatCurrency(advancePaid)}</span>
                </span>
                <span aria-hidden="true" className="h-5 w-px bg-[#DCE5EA]" />
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-[#64748B]">{t("common.balance")}</span>
                  <span
                    className={cn(
                      "text-base font-bold",
                      balance > 0 ? "text-[#C2410C]" : "text-[#15803D]"
                    )}
                  >
                    {formatCurrency(balance)}
                  </span>
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
              disabled={leavingToOrders}
              aria-busy={leavingToOrders}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:cursor-wait disabled:opacity-70"
            >
              {leavingToOrders && <Loader2 className="h-4 w-4 animate-spin" />}
              {leavingToOrders ? "Opening orders..." : t("orders.backToOrders")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-12 min-w-[150px] rounded-lg bg-primary px-6 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Savingâ€¦" : t("orders.saveOrder")}
            </button>
          </div>
        </div>
      </div>

      {savedOrder && (
        <>
          {/* z-[80]/[90], above the Measurements modal's z-[60]/[70] - the
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
                    className="flex w-full items-center justify-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
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
                  <button
                    type="button"
                    onClick={() => setShowStagePrintModal(true)}
                    className="flex w-full items-center justify-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    Print Stage Job Card
                  </button>
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
      {savedOrder && showStagePrintModal && (
        <StageJobCardPrintModal
          order={savedOrder}
          target={{ serialNo: savedOrder.items[0]?.serialNo ?? 1 }}
          onClose={() => setShowStagePrintModal(false)}
        />
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
