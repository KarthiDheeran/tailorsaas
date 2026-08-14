"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightLeft, CheckCircle2, Loader2, UserRound } from "lucide-react";
import { paymentModes } from "@/lib/constants";
import {
  getCustomerByIdAction,
  getCustomerByNameAndPhoneAction,
  getCustomerOrderEntryDetailAction,
  getCustomersByPhoneAction,
  createCustomerAction,
  saveGarmentMeasurementAction,
  searchCustomerAddressesAction,
  searchCustomersAction,
} from "@/app/(shell)/customers/actions";
import {
  createOrderAction,
  createOrderForNewCustomerAction,
  generateNextOrderNumberAction,
  getNewOrderBootstrapAction,
} from "@/app/(shell)/orders/actions";
import type { CustomerDetail } from "@/lib/customers-db";
import {
  GARMENT_SECTIONS,
  type CatalogAddOn,
  type CatalogGarmentType,
  type GarmentTypeConfiguration,
  type GarmentSection,
} from "@/lib/catalog";
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
import { handleEnterAsNextField } from "@/components/orders/enter-as-next-field";
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
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import { getOrderTaxBreakdown } from "@/lib/order-tax";
import {
  readNewOrderBillingSettings,
  readNewOrderCatalogReference,
  readNewOrderCustomerDetail,
  readNewOrderCustomers,
  readNewOrderOperatorStaff,
  readNewOrderPreferences,
  readNewOrderTodayItemSummary,
  upsertNewOrderCustomer,
  writeNewOrderBillingSettings,
  writeNewOrderCatalogReference,
  writeNewOrderCustomerDetail,
  writeNewOrderCustomers,
  writeNewOrderOperatorStaff,
  writeNewOrderPreferences,
  writeNewOrderTodayItemSummary,
} from "@/lib/new-order-reference-browser-cache";

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
type OrderEntryView = "classic" | "modern";
const ORDER_SECTION_OPTIONS = GARMENT_SECTIONS.map((section, index) => ({
  section,
  code: index + 1,
}));

// Searching is a server round-trip (including auth and permission checks),
// so do not issue one for every character the operator types.
const CUSTOMER_SEARCH_DEBOUNCE_MS = 250;
const CUSTOMER_SEARCH_MIN_LENGTH = 2;
const CUSTOMER_SEARCH_RESULT_LIMIT = 8;
const ORDER_ENTRY_VIEW_KEY = "tailorsaas:new-order-entry-view";

type MeasurementStaffOption = { id: string; name: string; staff_number: string; staff_code?: number };
type TodayItemSummaryRow = { garment: string; qty: number };

function customerMatchesSearch(customer: Customer, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  return (
    customer.name.trim().toLowerCase().startsWith(normalizedQuery) ||
    (digits.length > 0 && customer.phone.replace(/\D/g, "").startsWith(digits))
  );
}

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

function OrderSectionCombobox({
  value,
  options,
  inputRef,
  onChange,
  hasError = false,
  compact = false,
}: {
  value: GarmentSection | "";
  options: { section: GarmentSection; code: number }[];
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (section: GarmentSection) => void;
  hasError?: boolean;
  compact?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.section === value);
  const filtered = options.filter((option) => {
    const normalized = query.trim().toLowerCase();
    return !normalized || option.code.toString().startsWith(normalized) || option.section.toLowerCase().startsWith(normalized);
  });
  const inputValue = open ? query : selected ? `${selected.code} - ${selected.section}` : "";

  function selectSection(option: (typeof options)[number]) {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    onChange(option.section);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const exactCode = options.find((option) => option.code.toString() === query.trim());
      const option = exactCode ?? filtered[activeIndex];
      if (option) selectSection(option);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        ref={inputRef}
        required
        role="combobox"
        aria-label="Order section"
        aria-expanded={open}
        aria-controls="order-section-options"
        aria-activedescendant={open && filtered[activeIndex] ? `order-section-${filtered[activeIndex].code}` : undefined}
        autoComplete="off"
        value={inputValue}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActiveIndex(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type 1, 2, or 3"
        className={cn(
          "h-[50px] w-full rounded-[10px] border border-border bg-white px-4 text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint",
          compact && "h-8 rounded-md px-2 text-xs",
          hasError && "border-chip-red-fg"
        )}
      />
      {open && (
        <div id="order-section-options" role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border-soft bg-white py-1 shadow-soft">
          {filtered.map((option, index) => (
            <button
              key={option.section}
              id={`order-section-${option.code}`}
              type="button"
              role="option"
              aria-selected={option.section === value}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectSection(option)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                index === activeIndex ? "bg-primary-tint text-primary" : "text-ink hover:bg-surface-muted"
              )}
            >
              <span className="inline-flex min-w-7 justify-center rounded-md border border-border-soft bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-primary">{option.code}</span>
              <span className="font-semibold">{option.section}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewOrderPageContent() {
  const router = useRouter();
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const customerSearchInputRef = useRef<HTMLInputElement>(null);
  const newCustomerNameInputRef = useRef<HTMLInputElement>(null);
  const orderSectionRef = useRef<HTMLInputElement>(null);
  const customerResultButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const deliveryDateWasEditedRef = useRef(false);
  const {
    hasPermission,
    currentUser,
    currentUserId,
    isLoading: isCurrentUserLoading,
  } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const canCreateCustomers = hasPermission("customers.create");
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
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
  const [cachedCustomers, setCachedCustomers] = useState<Customer[] | null>(null);
  const [customerCreationError, setCustomerCreationError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [orderNumberPreview, setOrderNumberPreview] = useState("");
  const [orderEntryView, setOrderEntryView] = useState<OrderEntryView>("classic");

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
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const advanceAmountRef = useRef<HTMLInputElement | null>(null);
  const deliveryDateInputRef = useRef<HTMLInputElement | null>(null);
  const finalizeDialogRef = useRef<HTMLDivElement | null>(null);
  const finalizeConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const [createdByOperatorId, setCreatedByOperatorId] = useState("");
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
  const [garmentFocusRequest, setGarmentFocusRequest] = useState(0);
  const [orderSection, setOrderSection] = useState<GarmentSection | "">("");
  const [measurementStaff, setMeasurementStaff] = useState<MeasurementStaffOption[]>([]);
  const [measurementTakenByOperatorId, setMeasurementTakenByOperatorId] = useState("");
  const [todayItemSummary, setTodayItemSummary] = useState<TodayItemSummaryRow[]>([]);
  const [todayItemSummaryLoading, setTodayItemSummaryLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ORDER_ENTRY_VIEW_KEY);
      if (saved === "modern" || saved === "classic") {
        setOrderEntryView(saved);
      }
    } catch {
      // Browser preference is optional; Classic remains the safe default.
    }
  }, []);

  function handleOrderEntryViewChange(view: OrderEntryView) {
    setOrderEntryView(view);
    try {
      window.localStorage.setItem(ORDER_ENTRY_VIEW_KEY, view);
    } catch {
      // Preference persistence must not block order entry.
    }
  }

  useEffect(() => {
    if (!finalizeOpen) return;
    const timer = window.setTimeout(() => {
      deliveryDateInputRef.current?.focus();
      finalizeConfirmButtonRef.current =
        Array.from(finalizeDialogRef.current?.querySelectorAll("button") ?? []).find((button) =>
          button.textContent?.includes("Confirm")
        ) ?? null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [finalizeOpen]);

  useEffect(() => {
    if (!orderSection && currentUser?.allowed_order_sections.length === 1) {
      setOrderSection(currentUser.allowed_order_sections[0]);
    }
  }, [currentUser?.allowed_order_sections, orderSection]);

  // Phase 6B: Catalog data (active garment types, all add-ons) is fetched
  // once here and threaded down to NewOrderItemsCard as props - every
  // per-row/per-render lookup inside that component and the pure helpers
  // below stays a synchronous array find(), not its own Supabase call.
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [addOns, setAddOns] = useState<CatalogAddOn[]>([]);
  const [garmentConfigurations, setGarmentConfigurations] = useState<GarmentTypeConfiguration[]>([]);
  const [garmentConfigurationsLoaded, setGarmentConfigurationsLoaded] = useState(false);
  const allowedOrderSections = useMemo(
    () =>
      currentUser?.allowed_order_sections.length
        ? currentUser.allowed_order_sections
        : [...GARMENT_SECTIONS],
    [currentUser?.allowed_order_sections]
  );
  const orderSectionOptions = ORDER_SECTION_OPTIONS.filter((option) =>
    allowedOrderSections.includes(option.section)
  );
  const allowedOrderSectionKey = allowedOrderSections.join("|");
  const visibleGarmentTypes = orderSection
    ? garmentTypes.filter((garment) => garment.section === orderSection)
    : garmentTypes.filter((garment) => allowedOrderSections.includes(garment.section));

  useEffect(() => {
    if (isCurrentUserLoading) return;
    let cancelled = false;
    const today = todayIso();
    const cachedBilling = readNewOrderBillingSettings(currentUserId);
    const cachedPreferences = readNewOrderPreferences(currentUserId);
    const cachedCatalog = readNewOrderCatalogReference(currentUserId);
    const cachedStaff = readNewOrderOperatorStaff(currentUserId);
    const cachedTodaySummary = readNewOrderTodayItemSummary(currentUserId, today);
    const cachedCatalogUsable = Boolean(
      cachedCatalog &&
      Array.isArray(cachedCatalog.garmentTypes) &&
      Array.isArray(cachedCatalog.addOns) &&
      Array.isArray(cachedCatalog.configurations) &&
      cachedCatalog.garmentTypes.some((garment) =>
        allowedOrderSections.includes(garment.section)
      )
    );

    if (cachedBilling) setBillingSettings(cachedBilling);
    if (cachedPreferences) setDefaultDeliveryLeadDays(cachedPreferences.defaultDeliveryLeadDays);
    if (cachedCatalogUsable && cachedCatalog) {
      setGarmentTypes(cachedCatalog.garmentTypes);
      setAddOns(cachedCatalog.addOns);
      setGarmentConfigurations(cachedCatalog.configurations);
      setGarmentConfigurationsLoaded(true);
    }
    if (cachedStaff) setMeasurementStaff(cachedStaff);
    if (cachedTodaySummary) setTodayItemSummary(cachedTodaySummary);

    const cacheComplete = Boolean(
      cachedBilling &&
      cachedPreferences &&
      cachedCatalogUsable &&
      cachedStaff &&
      (orderEntryView !== "classic" || cachedTodaySummary)
    );
    if (!cacheComplete) {
      setTodayItemSummaryLoading(orderEntryView === "classic");
      getNewOrderBootstrapAction(today)
        .then((data) => {
          if (cancelled) return;
          setBillingSettings(data.billingSettings);
          setDefaultDeliveryLeadDays(data.orderPreferences.defaultDeliveryLeadDays);
          setGarmentTypes(data.garmentTypes);
          setAddOns(data.addOns);
          setGarmentConfigurations(data.garmentConfigurations);
          setGarmentConfigurationsLoaded(true);
          setMeasurementStaff(data.measurementStaff);
          setTodayItemSummary(data.todayItemSummary);
          if (data.operatorMode.operator) {
            setMeasurementTakenByOperatorId((current) => current || data.operatorMode.operator!.id);
            setCreatedByOperatorId((current) => current || data.operatorMode.operator!.id);
          }
          writeNewOrderBillingSettings(currentUserId, data.billingSettings);
          writeNewOrderPreferences(currentUserId, data.orderPreferences);
          writeNewOrderCatalogReference(currentUserId, {
            garmentTypes: data.garmentTypes,
            addOns: data.addOns,
            configurations: data.garmentConfigurations,
          });
          writeNewOrderOperatorStaff(currentUserId, data.measurementStaff);
          writeNewOrderTodayItemSummary(currentUserId, today, data.todayItemSummary);
        })
        .catch(() => {
          if (!cancelled) setGarmentConfigurationsLoaded(true);
        })
        .finally(() => {
          if (!cancelled) setTodayItemSummaryLoading(false);
        });
    } else {
      setTodayItemSummaryLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [allowedOrderSectionKey, allowedOrderSections, currentUserId, isCurrentUserLoading, orderEntryView]);

  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [activeCustomerResultIndex, setActiveCustomerResultIndex] = useState(0);
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [phoneDuplicateCustomer, setPhoneDuplicateCustomer] = useState<Customer | null>(null);
  const [samePhoneCustomers, setSamePhoneCustomers] = useState<Customer[]>([]);
  const [phoneDuplicateChecking, setPhoneDuplicateChecking] = useState(false);
  const [similarNameCustomers, setSimilarNameCustomers] = useState<Customer[]>([]);
  const [similarNameChecking, setSimilarNameChecking] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<{ address: string; area: string }[]>([]);
  const [addressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const [activeAddressSuggestionIndex, setActiveAddressSuggestionIndex] = useState(-1);
  const addressSuggestionsRef = useRef<HTMLLabelElement | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | undefined>(
    undefined
  );

  useEffect(() => {
    if (prefillCustomerId) return;
    window.setTimeout(() => {
      customerSearchInputRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [prefillCustomerId]);

  useEffect(() => {
    if (isCurrentUserLoading) return;
    setCachedCustomers(readNewOrderCustomers(currentUserId));
  }, [currentUserId, isCurrentUserLoading]);

  useEffect(() => {
    let cancelled = false;
    generateNextOrderNumberAction(orderSection)
      .then((number) => !cancelled && setOrderNumberPreview(number))
      .catch(() => !cancelled && setOrderNumberPreview(""));
    return () => {
      cancelled = true;
    };
  }, [orderSection]);

  useEffect(() => {
    if (customerMode !== "new") return;
    window.setTimeout(() => newCustomerNameInputRef.current?.focus({ preventScroll: true }), 0);
  }, [customerMode]);

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

  // Use the session-scoped customer cache for normal lookups. Until its first
  // load finishes, the existing debounced server lookup remains the fallback.
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
    const cachedResults = cachedCustomers
      ? cachedCustomers
        .filter((customer) => customerMatchesSearch(customer, query))
        .slice(0, CUSTOMER_SEARCH_RESULT_LIMIT)
      : [];
    if (cachedResults.length > 0) {
      setCustomerSearchResults(cachedResults);
      setActiveCustomerResultIndex(0);
      setCustomerSearchLoading(false);
      setCustomerSearchCompleted(true);
      setCustomerResultsOpen(!!customerSearchRef.current?.contains(document.activeElement));
      return;
    }

    // A browser cache can be stale after another terminal/user created a
    // customer. A cache miss must never become a false "No customers found".
    let cancelled = false;
    setCustomerSearchLoading(true);
    setCustomerSearchCompleted(false);
    const timeout = window.setTimeout(() => {
      searchCustomersAction(query, CUSTOMER_SEARCH_RESULT_LIMIT)
        .then((results) => {
          if (cancelled) return;
          setCustomerSearchResults(results);
          setActiveCustomerResultIndex(0);
          setCustomerSearchLoading(false);
          setCustomerSearchCompleted(true);
          setCustomerResultsOpen(
            !!customerSearchRef.current?.contains(document.activeElement)
          );
          if (results.length > 0) {
            setCachedCustomers((current) => {
              const resultIds = new Set(results.map((customer) => customer.id));
              const next = [...results, ...(current ?? []).filter((customer) => !resultIds.has(customer.id))];
              writeNewOrderCustomers(currentUserId, next);
              return next;
            });
          }
        })
        .catch(() => {
          if (cancelled) return;
          setCustomerSearchResults([]);
          setCustomerSearchLoading(false);
          setCustomerSearchCompleted(true);
        });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      setCustomerSearchLoading(false);
    };
  }, [cachedCustomers, currentUserId, customerMode, customerSearchQuery]);

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
      if (!addressSuggestionsRef.current?.contains(event.target as Node)) {
        setAddressSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [currentUserId]);

  useEffect(() => {
    const query = newCustomer.address.trim();
    if (customerMode !== "new" || query.length < 2) {
      setAddressSuggestions([]);
      setActiveAddressSuggestionIndex(-1);
      return;
    }
    const normalizedQuery = query.toLocaleLowerCase();
    const cachedSuggestions = cachedCustomers
      ? Array.from(
          new Map<string, { address: string; area: string }>(
            cachedCustomers
              .filter((customer) => customer.address?.toLocaleLowerCase().includes(normalizedQuery))
              .map((customer): [string, { address: string; area: string }] => [
                `${customer.address ?? ""}|${customer.area ?? ""}`,
                { address: customer.address ?? "", area: customer.area ?? "" },
              ])
              .filter(([, suggestion]) => suggestion.address.trim())
          ).values()
        ).slice(0, 8)
      : [];
    if (cachedSuggestions.length > 0) {
      setAddressSuggestions(cachedSuggestions);
      setActiveAddressSuggestionIndex(-1);
      return;
    }
    let cancelled = false;
    searchCustomerAddressesAction(query).then((suggestions) => {
      if (!cancelled) {
        setAddressSuggestions(suggestions);
        setActiveAddressSuggestionIndex(-1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cachedCustomers, customerMode, newCustomer.address]);

  useEffect(() => {
    if (defaultDeliveryLeadDays === null || deliveryDateWasEditedRef.current) return;
    setDeliveryDate(addDaysToIso(orderDate, defaultDeliveryLeadDays));
  }, [defaultDeliveryLeadDays, orderDate]);

  useEffect(() => {
    const phone = newCustomer.phone.trim();
    if (customerMode !== "new" || !/^\d{10}$/.test(phone)) {
      setPhoneDuplicateCustomer(null);
      setSamePhoneCustomers([]);
      setPhoneDuplicateChecking(false);
      return;
    }
    const normalizedName = newCustomer.name.trim().toLocaleLowerCase();
    const resolveMatches = (customers: Customer[]) => {
      setSamePhoneCustomers(customers);
      setPhoneDuplicateCustomer(
        normalizedName
          ? customers.find(
              (customer) =>
                customer.name.trim().toLocaleLowerCase() === normalizedName
            ) ?? null
          : null
      );
    };
    if (cachedCustomers !== null) {
      resolveMatches(
        cachedCustomers.filter((customer) => customer.phone.replace(/\D/g, "") === phone)
      );
      setPhoneDuplicateChecking(false);
      return;
    }
    let cancelled = false;
    setPhoneDuplicateChecking(true);
    getCustomersByPhoneAction(phone).then((customers) => {
      if (cancelled) return;
      resolveMatches(customers);
      setPhoneDuplicateChecking(false);
    });
    return () => {
      cancelled = true;
      setPhoneDuplicateChecking(false);
    };
  }, [cachedCustomers, customerMode, newCustomer.name, newCustomer.phone]);

  useEffect(() => {
    const name = newCustomer.name.trim();
    if (customerMode !== "new" || name.length < 2) {
      setSimilarNameCustomers([]);
      setSimilarNameChecking(false);
      return;
    }
    if (cachedCustomers !== null) {
      const normalized = name.toLowerCase();
      setSimilarNameCustomers(
        cachedCustomers
          .filter((customer) => customer.name.toLowerCase().includes(normalized))
          .slice(0, 4)
      );
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
  }, [cachedCustomers, customerMode, newCustomer.name]);

  // Previous Orders / customer summary panel data - re-fetched whenever the
  // matched customer changes.
  useEffect(() => {
    if (!matchedCustomer) {
      setCustomerDetail(undefined);
      return;
    }
    let cancelled = false;
    const cached = readNewOrderCustomerDetail(currentUserId, matchedCustomer.id);
    if (cached) setCustomerDetail(cached);
    else setCustomerDetail(undefined);
    getCustomerOrderEntryDetailAction(matchedCustomer.id).then((detail) => {
      if (cancelled) return;
      setCustomerDetail(detail);
      if (detail) writeNewOrderCustomerDetail(currentUserId, matchedCustomer.id, detail);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, matchedCustomer]);

  const { computedItems, totalAmount: taxableSubtotal } = computeOrderItems(
    items,
    visibleGarmentTypes,
    addOns
  );
  const taxBreakdown = getOrderTaxBreakdown(taxableSubtotal, billingSettings);
  const totalAmount = taxBreakdown?.totalWithTax ?? taxableSubtotal;
  const balance = totalAmount - advancePaid;

  const trimmedNewPhone = newCustomer.phone.trim();
  const trimmedNewName = newCustomer.name.trim();
  const exactDuplicateCustomer = Boolean(
    phoneDuplicateCustomer &&
    phoneDuplicateCustomer.name.trim().toLocaleLowerCase() === trimmedNewName.toLocaleLowerCase()
  );
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
      visibleGarmentTypes.find((garment) => garment.id === item.garmentTypeId)?.name ||
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
    orderSection: !orderSection ? "Select an order section before adding garments." : undefined,
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
      isCreatingNewCustomer && phoneDuplicateCustomer && phoneDuplicateCustomer.name.trim().toLocaleLowerCase() === trimmedNewName.toLocaleLowerCase()
        ? "A customer with this name and phone number already exists."
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

  function focusGarmentEntry() {
    if (orderSection) {
      setGarmentFocusRequest((current) => current + 1);
      return;
    }
    window.setTimeout(() => orderSectionRef.current?.focus(), 0);
  }

  function handleOrderSectionChange(section: GarmentSection) {
    setOrderSection(section);
    setItems((current) =>
      current.map((item) =>
        item.garmentTypeId &&
        !garmentTypes.some((garment) => garment.id === item.garmentTypeId && garment.section === section)
          ? { ...blankDraftItem(), draftKey: item.draftKey }
          : item
      )
    );
    window.setTimeout(() => setGarmentFocusRequest((current) => current + 1), 0);
  }

  function handleSelectCustomer(c: Customer) {
    applyCustomer(c);
    focusGarmentEntry();
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
    setCustomerCreationError(null);
    setNewCustomer({
      ...emptyCustomerDraft,
      phone: /^\d/.test(query) ? query.replace(/\D/g, "").slice(0, 10) : "",
      name: /^\d/.test(query) ? "" : query,
    });
    setCustomerMode("new");
  }

  function selectAddressSuggestion(suggestion: { address: string; area: string }) {
    setNewCustomer((current) => ({
      ...current,
      address: suggestion.address,
      area: suggestion.area || current.area,
    }));
    setAddressSuggestionsOpen(false);
    setActiveAddressSuggestionIndex(-1);
  }

  function handleAddressSuggestionKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (addressSuggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAddressSuggestionsOpen(true);
      setActiveAddressSuggestionIndex((current) =>
        current < 0 ? 0 : Math.min(current + 1, addressSuggestions.length - 1)
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAddressSuggestionsOpen(true);
      setActiveAddressSuggestionIndex((current) =>
        current < 0 ? addressSuggestions.length - 1 : Math.max(current - 1, 0)
      );
      return;
    }
    if (event.key === "Enter" && addressSuggestionsOpen) {
      const suggestion =
        addressSuggestions[activeAddressSuggestionIndex >= 0 ? activeAddressSuggestionIndex : 0];
      if (!suggestion) return;
      event.preventDefault();
      selectAddressSuggestion(suggestion);
      return;
    }
    if (event.key === "Escape" && addressSuggestionsOpen) {
      event.preventDefault();
      setAddressSuggestionsOpen(false);
    }
  }

  function refreshCustomerBrowserCache(customer: Customer) {
    setCachedCustomers((current) => {
      const next = [customer, ...(current ?? []).filter((item) => item.id !== customer.id)];
      upsertNewOrderCustomer(currentUserId, customer);
      return next;
    });
  }

  async function handleSaveCustomerAndContinue() {
    const name = newCustomer.name.trim();
    const phone = newCustomer.phone.trim();
    if (!name) {
      setCustomerCreationError("Customer name is required.");
      newCustomerNameInputRef.current?.focus();
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      setCustomerCreationError("Enter a valid 10-digit phone number.");
      return;
    }
    if (phoneDuplicateCustomer && phoneDuplicateCustomer.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) {
      setCustomerCreationError("A customer with this name and phone number already exists.");
      return;
    }

    setCreatingCustomer(true);
    setCustomerCreationError(null);
    const result = await createCustomerAction({
      name,
      phone,
      area: newCustomer.area.trim(),
      address: newCustomer.address.trim(),
      gender: newCustomer.gender,
    });
    setCreatingCustomer(false);
    if (!result.success) {
      setCustomerCreationError(result.error);
      return;
    }

    refreshCustomerBrowserCache(result.data);
    applyCustomer(result.data);
    focusGarmentEntry();
  }

  function handleCancelNewCustomer() {
    setNewCustomer(emptyCustomerDraft);
    setDuplicateCustomer(null);
    setPhoneDuplicateCustomer(null);
    setSamePhoneCustomers([]);
    setAddressSuggestions([]);
    setAddressSuggestionsOpen(false);
    setActiveAddressSuggestionIndex(-1);
    setSimilarNameCustomers([]);
    setCustomerSearchCompleted(false);
    setCustomerCreationError(null);
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
        it.typedFieldDraft !== undefined ||
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
        it.typedFieldDraft !== undefined ||
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
      const garment = visibleGarmentTypes.find((g) => g.id === it.garmentTypeId);
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
        const garment = visibleGarmentTypes.find((g) => g.id === it.garmentTypeId);
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
        orderSection: orderSection as GarmentSection,
        orderDate,
        trialDate,
        deliveryDate,
        deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
        items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
        advancePaid,
        paymentMode,
        measurementTakenByOperatorId: measurementTakenByOperatorId || undefined,
        createdByOperatorId: createdByOperatorId || undefined,
      });
    } else {
      const existingByNameAndPhone = await getCustomerByNameAndPhoneAction(
        trimmedNewName,
        trimmedNewPhone
      );
      if (existingByNameAndPhone) {
        setSaving(false);
        setDuplicateCustomer(existingByNameAndPhone);
        setPhoneDuplicateCustomer(existingByNameAndPhone);
        setSaveError("A customer with this name and phone number already exists.");
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
          orderSection: orderSection as GarmentSection,
          orderDate,
          trialDate,
          deliveryDate,
          deliveryPromiseNote: deliveryPromiseNote.trim() || undefined,
          items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
          advancePaid,
          paymentMode,
          measurementTakenByOperatorId: measurementTakenByOperatorId || undefined,
          createdByOperatorId: createdByOperatorId || undefined,
        },
      });
    }
    if (!created.success) {
      setSaving(false);
      if (created.error === "A customer with this name and phone number already exists.") {
        const existingByNameAndPhone = await getCustomerByNameAndPhoneAction(
          trimmedNewName,
          trimmedNewPhone
        );
        if (existingByNameAndPhone) {
          setPhoneDuplicateCustomer(existingByNameAndPhone);
          setDuplicateCustomer(existingByNameAndPhone);
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

  const handleSaveShortcutRef = useRef(handleSave);
  handleSaveShortcutRef.current = handleSave;

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      const isSaveShortcut =
        (event.altKey && event.key.toLowerCase() === "s") ||
        (event.ctrlKey && event.key === "Enter");
      if (!isSaveShortcut || event.repeat || saving || savedOrder) return;
      if (document.querySelector('[data-order-item-dialog="true"]')) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (finalizeOpen) void handleSaveShortcutRef.current();
      else setFinalizeOpen(true);
    }

    window.addEventListener("keydown", handleSaveShortcut, true);
    return () => window.removeEventListener("keydown", handleSaveShortcut, true);
  }, [finalizeOpen, savedOrder, saving]);

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

  function handleCreateAnotherOrder() {
    setLeavingToOrders(true);
    window.location.assign("/orders/new");
  }

  function handlePrintCustomerReceiptAndCreateNext(order: Order) {
    window.open(`/orders/${order.id}/print/customer`, "_blank", "noopener,noreferrer");
    window.setTimeout(handleCreateAnotherOrder, 150);
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
  const isClassicEntry = orderEntryView === "classic";

  return (
    <div className={cn("pb-24", isClassicEntry && "bg-[#f5f8ff]")}>
      <div className={cn(
        "mx-auto max-w-[1600px] p-4 sm:px-6 sm:py-3 lg:px-8 2xl:max-w-[1760px]",
        isClassicEntry && "max-w-none p-2 sm:px-3 sm:py-2 lg:px-4 2xl:max-w-none"
      )}>
        <div className={cn(
          "mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.05)]",
          isClassicEntry && "border-[#c9d7ea] bg-white shadow-[0_2px_8px_rgba(30,64,175,0.06)]"
        )}>
          <div>
            <h1 className={cn("font-bold tracking-tight text-ink", isClassicEntry ? "text-lg" : "text-2xl")}>
              {isClassicEntry ? "Classic Order Entry" : "New Order"}
            </h1>
            <p className="text-xs text-ink-muted">
              {isClassicEntry
                ? "Compact desktop layout for fast keyboard entry."
                : "Modern order entry layout."}
            </p>
          </div>
          <div className="flex overflow-hidden rounded-md border border-border bg-surface-muted p-0.5 text-xs font-semibold">
            {(["classic", "modern"] as OrderEntryView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => handleOrderEntryViewChange(view)}
                className={cn(
                  "h-8 px-3 transition-colors",
                  orderEntryView === view
                    ? "rounded bg-white text-primary shadow-sm"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                {view === "classic" ? "Classic Compact View" : "Modern View"}
              </button>
            ))}
          </div>
        </div>
        <div
          className={cn(
            "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start",
            isClassicEntry && "gap-2 lg:grid-cols-1"
          )}
        >
          <div className={cn("min-w-0 space-y-3", isClassicEntry && "space-y-2")}>
            <div
              className={cn(
                "min-h-[110px] rounded-2xl border border-border bg-white p-5 shadow-[0_4px_14px_rgba(15,23,42,0.06)] sm:p-6",
                isClassicEntry && "min-h-0 rounded-lg border-[#c9d7ea] bg-white p-3 shadow-[0_2px_8px_rgba(30,64,175,0.06)] sm:p-3"
              )}
            >
              <div className={cn(
                "mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-soft pb-3",
                isClassicEntry && "mb-2 pb-2"
              )}>
                <div>
                  <p className="text-sm font-semibold text-ink">Order Information</p>
                  <p className="mt-0.5 text-xs text-ink-muted">Order number is confirmed when the order is saved.</p>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary-tint px-3 py-1.5 text-sm font-bold text-primary">
                  {orderNumberPreview || "Select order section"}
                </span>
              </div>
              {customerMode !== "selected" && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                {customerMode === "new" && (
                  <button
                    type="button"
                    onClick={handleCancelNewCustomer}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                  >
                    Back to Customer Search
                  </button>
                )}
              </div>
              )}
              <div className={cn(
                "grid grid-cols-1 gap-5 lg:grid-cols-[11fr_9fr] lg:items-center lg:gap-6",
                isClassicEntry && "gap-2 xl:grid-cols-[340px_300px_220px_minmax(260px,1fr)] xl:items-start xl:justify-start xl:gap-2 2xl:grid-cols-[360px_320px_240px_minmax(280px,1fr)]"
              )}>
              <div className={cn(customerMode !== "selected" && "space-y-3", isClassicEntry && "space-y-2")}>
                {customerMode === "selected" && matchedCustomer && (
                  <div className={cn(
                    "flex min-h-[62px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
                    isClassicEntry && "min-h-0 gap-2 rounded-md border border-[#d5e0f0] bg-[#fbfdff] p-2 sm:items-start"
                  )}>
                    <div className={cn("flex min-w-0 items-center gap-3.5", isClassicEntry && "gap-2")}>
                      <div className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary",
                        isClassicEntry && "h-8 w-8 rounded-md"
                      )}>
                        <UserRound className={cn("h-6 w-6", isClassicEntry && "h-4 w-4")} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-sm font-medium text-ink-muted", isClassicEntry && "text-[11px] leading-4")}>
                          Customer {matchedCustomer.customerNumber ? `· ${matchedCustomer.customerNumber}` : ""}
                        </p>
                        <p className={cn("truncate text-xl font-bold tracking-tight text-ink", isClassicEntry && "text-base leading-5")}>
                          {matchedCustomer.name}
                        </p>
                        <p className={cn("truncate text-[15px] text-ink-muted", isClassicEntry && "text-xs leading-4")}>
                          {matchedCustomer.phone} <span aria-hidden="true">·</span> {matchedCustomer.area || "-"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangeCustomer}
                      aria-label="Change customer"
                      className={cn(
                        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-primary bg-white px-4 text-[15px] font-semibold text-primary transition-colors hover:bg-primary-tint focus:outline-none focus:ring-2 focus:ring-primary-tint",
                        isClassicEntry && "h-8 rounded-md px-2 text-xs"
                      )}
                    >
                      <ArrowRightLeft className={cn("h-4 w-4", isClassicEntry && "h-3.5 w-3.5")} aria-hidden="true" />
                      {isClassicEntry ? "Change" : "Change Customer"}
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
                            isClassicEntry && "h-8 rounded-md px-2 text-xs",
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
                  <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", isClassicEntry && "grid-cols-2 gap-2")}>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    Customer Name
                  </span>
                  <input
                    ref={newCustomerNameInputRef}
                    required
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer((current) => ({ ...current, name: e.target.value }))
                    }
                    className={cn(
                      inputClass,
                      isClassicEntry && "h-8 rounded-md px-2 text-xs",
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
                      isClassicEntry && "h-8 rounded-md px-2 text-xs",
                      (exactDuplicateCustomer ||
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
                    className={cn(inputClass, isClassicEntry && "h-8 rounded-md px-2 text-xs")}
                  />
                </label>
                <label ref={addressSuggestionsRef} className="relative flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.address")}
                  </span>
                  <input
                    value={newCustomer.address}
                    onFocus={() => setAddressSuggestionsOpen(true)}
                    onChange={(e) => {
                      setNewCustomer((current) => ({ ...current, address: e.target.value }));
                      setAddressSuggestionsOpen(true);
                    }}
                    onKeyDown={handleAddressSuggestionKeyDown}
                    className={cn(inputClass, isClassicEntry && "h-8 rounded-md px-2 text-xs")}
                  />
                  {addressSuggestionsOpen && addressSuggestions.length > 0 && (
                    <div
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-soft"
                    >
                      {addressSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.address}|${suggestion.area}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeAddressSuggestionIndex}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveAddressSuggestionIndex(index)}
                          onClick={() => selectAddressSuggestion(suggestion)}
                          className={cn(
                            "block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted",
                            index === activeAddressSuggestionIndex && "bg-primary-tint"
                          )}
                        >
                          <span className="block truncate font-medium">{suggestion.address}</span>
                          {suggestion.area && <span className="block truncate text-xs text-ink-muted">{suggestion.area}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <div className={cn("flex flex-col gap-1.5", isClassicEntry && "hidden")}>
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
                            : "border-border bg-white text-ink hover:bg-surface-muted"
                        )}
                      >
                        {g === "Male" ? t("common.male") : t("common.female")}
                      </button>
                    ))}
                  </div>
                </div>
                  </div>
                  {canCreateCustomers && (
                    <div className={cn(
                      "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-primary-tint px-3.5 py-3",
                      isClassicEntry && "mt-2 gap-2 rounded-md px-2 py-2"
                    )}>
                      <div>
                        <p className={cn("text-sm font-semibold text-success", isClassicEntry && "text-xs")}>Save customer before adding garments</p>
                        {!isClassicEntry && (
                          <p className="mt-0.5 text-xs text-ink-muted">The customer is added to this browser&apos;s search list immediately.</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveCustomerAndContinue()}
                        disabled={creatingCustomer || exactDuplicateCustomer}
                        className={cn(
                          "inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-primary bg-white px-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-60",
                          isClassicEntry && "h-8 rounded-md px-2.5 text-xs"
                        )}
                      >
                        {creatingCustomer ? "Creating..." : isClassicEntry ? "Create & Continue" : "Create Customer & Continue"}
                      </button>
                    </div>
                  )}
                  {customerCreationError && (
                    <p className="mt-3 text-sm font-medium text-chip-red-fg">{customerCreationError}</p>
                  )}
                  {phoneDuplicateCustomer && (
                    <div className="rounded-lg border border-chip-red-fg/20 bg-chip-red px-3.5 py-3 text-sm">
                      <div className="font-semibold text-chip-red-fg">
                        A customer with this name and phone number already exists.
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
                          className="shrink-0 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted"
                        >
                          Use Existing Customer
                        </button>
                      </div>
                    </div>
                  )}
                  {!phoneDuplicateCustomer && samePhoneCustomers.length > 0 && (
                    <div className={cn(
                      "rounded-lg border border-border-soft bg-surface-muted px-3.5 py-3 text-sm",
                      isClassicEntry && "rounded-md px-2 py-2 text-xs"
                    )}>
                      <div className={cn("mb-2 font-semibold text-ink", isClassicEntry && "mb-1 text-xs")}>
                        Same phone number used by family/customer
                      </div>
                      <div className="divide-y divide-border-soft">
                        {samePhoneCustomers.slice(0, 4).map((customer) => (
                          <div key={customer.id} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-ink">{customer.name}</div>
                              <div className="text-ink-muted">{customer.phone} · {customer.area || "-"}</div>
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
                  {similarNameCustomers.length > 0 && (
                    <div className="rounded-lg border border-border-soft bg-surface-muted px-3.5 py-3 text-sm">
                      <div className="mb-2 font-semibold text-ink">
                        Similar customers found
                      </div>
                      <div className="divide-y divide-border-soft">
                        {similarNameCustomers.map((customer) => (
                          <div
                            key={customer.id}
                            className={cn(
                              "flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0",
                              isClassicEntry && "gap-2 py-1"
                            )}
                          >
                            <div className="min-w-0">
                              <div className={cn("truncate font-semibold text-ink", isClassicEntry && "text-xs leading-4")}>
                                {customer.name}
                              </div>
                              <div className={cn("text-ink-muted", isClassicEntry && "text-[11px] leading-4")}>
                                {customer.phone} · {customer.area || "-"}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectCustomer(customer)}
                              className={cn("shrink-0 text-xs font-semibold text-primary hover:underline", isClassicEntry && "text-[11px]")}
                            >
                              {isClassicEntry ? "Use Existing" : "Use Existing Customer"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {similarNameChecking && similarNameCustomers.length === 0 && (
                    <p className="text-xs text-ink-muted">Checking similar names...</p>
                  )}
                  {duplicateCustomer && !phoneDuplicateCustomer && samePhoneCustomers.length === 0 && (
                    <div className="rounded-lg bg-chip-red px-3.5 py-2.5 text-xs font-medium text-chip-red-fg">
                      This phone number already belongs to {duplicateCustomer.name}. Select that customer instead.
                    </div>
                  )}
                </>
                )}
              </div>
              <div className={cn(
                "min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0",
                isClassicEntry && "rounded-md border border-[#d5e0f0] bg-[#fbfdff] p-2 lg:border lg:p-2"
              )}>
                <div className={cn("flex flex-col gap-1.5", isClassicEntry && "gap-1")}>
                  <span className={cn("text-[15px] font-semibold text-ink", isClassicEntry && "text-sm")}>Order Details</span>
                  <OrderSectionCombobox
                    value={orderSection}
                    options={orderSectionOptions}
                    inputRef={orderSectionRef}
                    onChange={handleOrderSectionChange}
                    hasError={submitAttempted && !!errors.orderSection}
                    compact={isClassicEntry}
                  />
                  <p className={cn("text-xs text-ink-muted", isClassicEntry && "text-[11px]")}>Type code: {orderSectionOptions.map((option) => `${option.code} ${option.section}`).join(" / ")}</p>
                </div>
                {submitAttempted && errors.orderSection && (
                  <p className="mt-1.5 text-xs font-medium text-chip-red-fg">{errors.orderSection}</p>
                )}
                <div ref={setGarmentSelectorTarget} className={cn("mt-4", isClassicEntry && "mt-2")} />
              </div>
              {isClassicEntry && (
                <div className="min-w-0 rounded-md border border-[#d5e0f0] bg-[#fbfdff] p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">Photo / Attachments</span>
                  </div>
                  <OrderAttachmentDraftCard
                    inlineSummary
                    compactSummary
                    queued={queuedAttachments}
                    onQueuedChange={setQueuedAttachments}
                    error={(submitAttempted && errors.attachments) || attachmentError}
                  />
                </div>
              )}
              {isClassicEntry && (
                <div className="min-w-0 rounded-md border border-[#d5e0f0] bg-[#fbfdff] p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">Today Items</span>
                    <span className="text-[11px] font-semibold text-ink-muted">
                      {todayItemSummaryLoading
                        ? "Loading"
                        : `${todayItemSummary.reduce((sum, row) => sum + row.qty, 0)} pcs`}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-[#d5e0f0] bg-white">
                    {todayItemSummaryLoading ? (
                      <div className="px-2 py-3 text-center text-[11px] text-ink-muted">Loading...</div>
                    ) : todayItemSummary.length > 0 ? (
                      <table className="min-w-full text-center text-[11px]">
                        <thead className="bg-[#eef4ff] text-ink-muted">
                          <tr>
                            {todayItemSummary.map((row) => (
                              <th
                                key={row.garment}
                                className="max-w-[88px] truncate border-r border-border-soft px-2 py-1 font-semibold last:border-r-0"
                                title={row.garment}
                              >
                                {row.garment}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-border-soft">
                            {todayItemSummary.map((row) => (
                              <td
                                key={row.garment}
                                className="border-r border-border-soft px-2 py-1.5 font-bold text-primary last:border-r-0"
                              >
                                {row.qty}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <div className="px-2 py-3 text-center text-[11px] text-ink-muted">No items today</div>
                    )}
                  </div>
                </div>
              )}
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
              garmentTypes={visibleGarmentTypes}
              addOns={addOns}
              garmentConfigurations={garmentConfigurations}
              garmentConfigurationsLoaded={garmentConfigurationsLoaded}
              previousOrders={customerDetail?.orders ?? []}
              paymentStrip={
                canViewPayments ? (
                  <div className={cn(
                    "grid gap-3 rounded-xl bg-surface-muted p-3 text-sm sm:grid-cols-2 xl:grid-cols-[0.8fr_1.1fr_0.9fr_1.2fr_1.1fr]",
                    isClassicEntry && "gap-2 rounded-md bg-[#eef4ff] p-2 sm:grid-cols-5 xl:grid-cols-5"
                  )}>
                    <div className={cn("flex min-w-0 flex-col gap-1.5", isClassicEntry && "gap-1")}>
                      <span className={cn("block text-sm font-medium text-ink-muted", isClassicEntry && "text-[11px]")}>
                        {taxBreakdown && !taxBreakdown.pricesIncludeTax ? "Total" : "Subtotal"}
                      </span>
                      <span className={cn("flex h-11 items-center text-[21px] font-bold text-ink", isClassicEntry && "h-8 text-sm")}>
                        {formatCurrency(totalAmount)}
                      </span>
                    </div>
                    <label className={cn("flex min-w-0 flex-col gap-1.5", isClassicEntry && "gap-1")}>
                      <span className={cn("block text-sm font-medium text-ink-muted", isClassicEntry && "text-[11px]")}>
                        Advance
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={totalAmount}
                        value={advancePaid}
                        onChange={(e) => setAdvancePaid(Number(e.target.value))}
                        className={cn(
                          "h-11 w-full rounded-[10px] border border-border bg-white px-3 text-right text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint",
                          isClassicEntry && "h-8 rounded-md px-2 text-xs",
                          submitAttempted &&
                            errors.advancePaid &&
                            "border-chip-red-fg"
                        )}
                      />
                    </label>
                    <div className={cn("flex min-w-0 flex-col gap-1.5", isClassicEntry && "gap-1")}>
                      <span className={cn("block text-sm font-medium text-ink-muted", isClassicEntry && "text-[11px]")}>
                        Balance
                      </span>
                      <span className={cn(
                        "flex h-11 items-center text-[22px] font-extrabold",
                        isClassicEntry && "h-8 text-sm",
                        balance > 0 ? "text-warning" : "text-success"
                      )}>
                        {formatCurrency(balance)}
                      </span>
                    </div>
                    <label className={cn("flex min-w-0 flex-col gap-1.5", isClassicEntry && "gap-1")}>
                      <span className={cn("block text-sm font-medium text-ink-muted", isClassicEntry && "text-[11px]")}>
                        Top
                      </span>
                      <Select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                        className={cn(
                          "h-11 rounded-[10px] border-border py-0 text-base focus:border-primary focus:ring-primary-tint",
                          isClassicEntry && "h-8 rounded-md py-0 text-xs"
                        )}
                      >
                        {paymentModes.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <div className={cn("flex min-w-0 flex-col gap-1.5", isClassicEntry && "gap-1")}>
                      <span className={cn("block text-sm font-medium text-ink-muted", isClassicEntry && "text-[11px]")}>
                        Bottom
                      </span>
                      <div className={cn("flex h-11 items-center", isClassicEntry && "h-8")}>
                        {totalAmount === 0 ? (
                          <span className="inline-block rounded-full border border-border-soft bg-chip-info px-3 py-2 text-sm font-semibold text-ink-muted">
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
              garmentSection={orderSection || null}
              garmentSelectorTarget={garmentSelectorTarget}
              compact={isClassicEntry}
            />

            {!isClassicEntry && (
              <OrderAttachmentDraftCard
                inlineSummary
                queued={queuedAttachments}
                onQueuedChange={setQueuedAttachments}
                error={(submitAttempted && errors.attachments) || attachmentError}
              />
            )}

          </div>

          <div className={cn("min-w-0 space-y-3", isClassicEntry && "hidden")}>
            <NewOrderSummaryPanel
              customer={matchedCustomer}
              detail={customerDetail}
              onRepeatOrder={handleRepeatOrder}
              repeatCopyMessage={repeatCopyMessage}
              hideCustomerSummary
            />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-soft bg-white shadow-soft">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7 2xl:max-w-[1760px]">
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            {saveError ? (
              <span className="font-medium text-chip-red-fg">{saveError}</span>
            ) : canViewPayments ? (
              <>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-ink-muted">{t("common.total")}</span>
                  <span className="text-base font-bold text-ink">{formatCurrency(totalAmount)}</span>
                </span>
                <span aria-hidden="true" className="h-5 w-px bg-border" />
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-ink-muted">{t("common.paid")}</span>
                  <span className="text-base font-bold text-ink">{formatCurrency(advancePaid)}</span>
                </span>
                <span aria-hidden="true" className="h-5 w-px bg-border" />
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm font-medium text-ink-muted">{t("common.balance")}</span>
                  <span
                    className={cn(
                      "text-base font-bold",
                      balance > 0 ? "text-warning" : "text-success"
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
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-wait disabled:opacity-70"
            >
              {leavingToOrders && <Loader2 className="h-4 w-4 animate-spin" />}
              {leavingToOrders ? "Opening orders..." : t("orders.backToOrders")}
            </button>
            <button
              type="button"
              onClick={() => setFinalizeOpen(true)}
              disabled={saving}
              aria-keyshortcuts="Alt+S Control+Enter"
              title="Save order (Alt+S or Ctrl+Enter)"
              className="h-12 min-w-[150px] rounded-lg bg-secondary px-6 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-secondary-hover disabled:opacity-60"
            >
              {saving ? "Saving…" : `${t("orders.saveOrder")} · Alt+S`}
            </button>
          </div>
        </div>
      </div>

      {finalizeOpen && !savedOrder && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4">
          <div
            ref={finalizeDialogRef}
            onKeyDownCapture={(event) =>
              handleEnterAsNextField(event, {
                rootRef: finalizeDialogRef,
                finalButtonRef: finalizeConfirmButtonRef,
              })
            }
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-xl font-bold text-ink">Finalize Order</h2>
            <p className="mt-1 text-sm text-ink-muted">Confirm the delivery and payment details discussed with the customer.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-ink">Order date<input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border px-3" /></label>
              <label className="text-sm font-semibold text-ink">Delivery date<input ref={deliveryDateInputRef} type="date" value={deliveryDate} onChange={(event) => { deliveryDateWasEditedRef.current = true; setDeliveryDate(event.target.value); }} className="mt-1 h-11 w-full rounded-lg border border-border px-3" /></label>
              <label className="text-sm font-semibold text-ink">Measurements taken by<select value={measurementTakenByOperatorId} onChange={(event) => setMeasurementTakenByOperatorId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-white px-3"><option value="">Not specified</option>{measurementStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.staff_code ?? staff.staff_number} — {staff.name}</option>)}</select></label>
              <label className="text-sm font-semibold text-ink">Created by<select value={createdByOperatorId} onChange={(event) => setCreatedByOperatorId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-white px-3"><option value="">Active operator</option>{measurementStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.staff_code ?? staff.staff_number} — {staff.name}</option>)}</select></label>
              <label className="text-sm font-semibold text-ink">Advance amount<input ref={advanceAmountRef} type="number" min={0} max={totalAmount} value={advancePaid} onChange={(event) => setAdvancePaid(Number(event.target.value))} className="mt-1 h-11 w-full rounded-lg border border-border px-3 text-right" /></label>
              <label className="text-sm font-semibold text-ink sm:col-span-2">Payment mode<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)} className="mt-1 h-11 w-full rounded-lg border border-border bg-white px-3">{paymentModes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setFinalizeOpen(false)} className="h-11 rounded-lg border border-border px-5 font-semibold">Cancel</button><button type="button" disabled={saving} onClick={() => void handleSave()} className="h-11 rounded-lg bg-secondary px-6 font-semibold text-white hover:bg-secondary-hover disabled:opacity-60">{saving ? "Creating…" : "Confirm & Create Order"}</button></div>
          </div>
        </div>
      )}

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
                  <button
                    type="button"
                    onClick={() => handlePrintCustomerReceiptAndCreateNext(savedOrder)}
                    disabled={leavingToOrders}
                    aria-busy={leavingToOrders}
                    className="flex w-full items-center justify-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
                  >
                    {t("orders.printCustomerReceipt")}
                  </button>
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
                    onClick={() => {
                      handleWhatsAppConfirmation(savedOrder);
                      window.setTimeout(handleCreateAnotherOrder, 150);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary-tint px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Send WhatsApp confirmation
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
                    onClick={handleCreateAnotherOrder}
                    disabled={leavingToOrders}
                    aria-busy={leavingToOrders}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted disabled:cursor-wait disabled:opacity-70"
                  >
                  {leavingToOrders && <Loader2 className="h-4 w-4 animate-spin" />}
                  {leavingToOrders ? "Opening new order..." : "Create Next Order"}
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
