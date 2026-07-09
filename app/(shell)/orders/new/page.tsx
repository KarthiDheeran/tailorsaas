"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { orderStatuses, paymentModes } from "@/lib/constants";
import {
  createCustomerAction,
  getCustomerByIdAction,
  getCustomerByPhoneAction,
  getCustomerDetailAction,
  getCustomerMeasurementsAction,
  getGarmentMeasurementsForCustomerAction,
  saveCustomerMeasurementsAction,
  saveGarmentMeasurementAction,
  searchCustomersByPhoneAction,
  updateCustomerAction,
} from "@/app/(shell)/customers/actions";
import { createOrderAction, generateNextOrderNumberAction } from "@/app/(shell)/orders/actions";
import {
  getActiveGarmentTypesAction,
  getAddOnsAction,
} from "@/app/(shell)/catalog/actions";
import type { CustomerDetail } from "@/lib/customers-db";
import type { CatalogAddOn, CatalogGarmentType } from "@/lib/catalog";
import { pickBodyMeasurements } from "@/lib/garment-catalog";
import type {
  Customer,
  CustomerMeasurements,
  GarmentMeasurement,
  Gender,
  Order,
  OrderStatus,
  PaymentMode,
} from "@/lib/types";
import { BalanceBadge } from "@/components/orders/orders-table";
import { countFilledFields } from "@/components/orders/garment-measurement-modal";
import {
  NewOrderItemsCard,
  blankDraftItem,
  computeOrderItems,
  orderItemToDraftItem,
  type DraftItem,
} from "@/components/orders/new-order-items-card";
import { NewOrderSummaryPanel } from "@/components/orders/new-order-summary-panel";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { ORDER_STATUS_LABEL_KEYS } from "@/components/orders/orders-table";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

function NewOrderPageContent() {
  const router = useRouter();
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const canPrintJobCard = hasPermission("orders.printJobCard");
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customerId");

  // Non-mutating peek at the next order number, frozen for this session —
  // the real number is (re)computed by createOrderAction itself at save
  // time. Phase 5A: fetched via a Server Action, so it starts blank and
  // fills in a moment after mount rather than being ready on first paint.
  const [orderNumberPreview, setOrderNumberPreview] = useState("");
  const [status, setStatus] = useState<OrderStatus>("In Progress");

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [gender, setGender] = useState<Gender>("Male");
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);

  const [orderDate, setOrderDate] = useState(todayIso());
  const [trialDate, setTrialDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");

  const [items, setItems] = useState<DraftItem[]>([blankDraftItem()]);

  const [advancePaid, setAdvancePaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");

  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [savedOrder, setSavedOrder] = useState<Order | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const [phoneSuggestions, setPhoneSuggestions] = useState<Customer[]>([]);
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
  const [initialFields, setInitialFields] = useState({
    phone: "",
    name: "",
    area: "",
    address: "",
  });

  function applyCustomer(c: Customer) {
    setMatchedCustomer(c);
    setPhone(c.phone);
    setName(c.name);
    setArea(c.area);
    setAddress(c.address);
    setGender(c.gender ?? "Male");
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
      setInitialFields({ phone: c.phone, name: c.name, area: c.area, address: c.address });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomerId]);

  useEffect(() => {
    let cancelled = false;
    generateNextOrderNumberAction().then((n) => {
      if (!cancelled) setOrderNumberPreview(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phone-suggestions autosuggest — only searches once a customer isn't
  // already matched, same trigger condition as before.
  useEffect(() => {
    if (matchedCustomer || !phone.trim()) {
      setPhoneSuggestions([]);
      return;
    }
    let cancelled = false;
    searchCustomersByPhoneAction(phone).then((results) => {
      if (!cancelled) setPhoneSuggestions(results);
    });
    return () => {
      cancelled = true;
    };
  }, [phone, matchedCustomer]);

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

  const trimmedPhone = phone.trim();
  const trimmedName = name.trim();
  const anyGarmentSelected = items.some((it) => it.garmentTypeId);
  const hasInvalidQtyOrRate = items.some(
    (it) => it.garmentTypeId && (it.qty <= 0 || it.rate < 0)
  );
  const hasValidItem = computedItems.some(
    (it, i) => items[i].garmentTypeId && it.qty > 0 && it.rate >= 0
  );
  let itemsError: string | undefined;
  if (!anyGarmentSelected) {
    itemsError = t("validation.selectGarmentForItem");
  } else if (hasInvalidQtyOrRate) {
    itemsError = t("validation.qtyRateInvalid");
  } else if (!hasValidItem) {
    itemsError = t("validation.itemRequired");
  }
  const errors = {
    phone: !trimmedPhone ? t("validation.phoneRequired") : undefined,
    name: !trimmedName ? t("validation.customerNameRequired") : undefined,
    deliveryDate: !deliveryDate ? t("validation.deliveryDateRequired") : undefined,
    items: itemsError,
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

  async function handlePhoneBlur() {
    if (matchedCustomer) return;
    const exact = await getCustomerByPhoneAction(phone.trim());
    if (exact) handleSelectCustomer(exact);
  }

  function handleChangeCustomer() {
    setMatchedCustomer(null);
    setPhone("");
    setName("");
    setArea("");
    setAddress("");
    setGender("Male");
  }

  function handleRepeatOrder(order: Order) {
    setItems(
      order.items.map((item) => orderItemToDraftItem(item, garmentTypes, addOns))
    );
    setOrderDate(todayIso());
    setDeliveryDate("");
    setTrialDate("");
    setStatus("In Progress");
    setAdvancePaid(0);
  }

  const isDirty =
    phone !== initialFields.phone ||
    name !== initialFields.name ||
    area !== initialFields.area ||
    address !== initialFields.address ||
    deliveryDate !== "" ||
    trialDate !== "" ||
    advancePaid !== 0 ||
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
    router.push("/orders");
  }

  async function handleSave() {
    setSubmitAttempted(true);
    if (hasErrors) return;
    setSaveError(null);
    setSaving(true);

    const validItems = computedItems.filter(
      (it, i) => items[i].garmentTypeId && it.qty > 0 && it.rate >= 0
    );

    // Resolve the customer, preventing an accidental duplicate: if this
    // phone number already belongs to a *different* customer than the one
    // the form was seeded from (e.g. the shopkeeper never blurred the Phone
    // field to trigger the usual auto-match), reuse that existing record
    // instead of creating a new one. That found record is used as-is rather
    // than overwritten with this form's values, since the shopkeeper was
    // never actually editing it.
    const existingByPhone = await getCustomerByPhoneAction(trimmedPhone);
    let customer: Customer;
    if (existingByPhone && existingByPhone.id !== matchedCustomer?.id) {
      customer = existingByPhone;
    } else if (matchedCustomer) {
      const fieldsChanged =
        trimmedName !== matchedCustomer.name ||
        trimmedPhone !== matchedCustomer.phone ||
        area.trim() !== matchedCustomer.area ||
        address.trim() !== matchedCustomer.address ||
        gender !== matchedCustomer.gender;
      if (fieldsChanged) {
        const result = await updateCustomerAction(matchedCustomer.id, {
          name: trimmedName,
          phone: trimmedPhone,
          address: address.trim(),
          area: area.trim(),
          gender,
        });
        if (!result.success) {
          setSaving(false);
          setSaveError(result.error);
          return;
        }
        customer = result.data;
      } else {
        customer = matchedCustomer;
      }
    } else {
      const result = await createCustomerAction({
        name: trimmedName,
        phone: trimmedPhone,
        address: address.trim(),
        area: area.trim(),
        gender,
      });
      if (!result.success) {
        setSaving(false);
        setSaveError(result.error);
        return;
      }
      customer = result.data;
    }

    // Persist any measurement edits: the per-garment-type record (reused for
    // this customer's future orders of the same garment type) and a merge
    // into the customer's general body-measurement baseline.
    for (const it of items) {
      const garment = garmentTypes.find((g) => g.id === it.garmentTypeId);
      if (!garment || !it.measurement) continue;
      if (countFilledFields(it.measurement) === 0) continue;
      const measurementResult = await saveGarmentMeasurementAction({
        customerId: customer.id,
        garmentType: garment.name,
        values: it.measurement.values,
        fitNotes: it.measurement.fitNotes,
        notes: it.measurement.notes,
      });
      if (!measurementResult.success) {
        setSaving(false);
        setSaveError(measurementResult.error);
        return;
      }
      const bodyMeasurements = pickBodyMeasurements(it.measurement.values);
      if (Object.keys(bodyMeasurements).length > 0) {
        const baselineResult = await saveCustomerMeasurementsAction({
          customerId: customer.id,
          values: bodyMeasurements,
        });
        if (!baselineResult.success) {
          setSaving(false);
          setSaveError(baselineResult.error);
          return;
        }
      }
    }

    const created = await createOrderAction({
      customerId: customer.id,
      orderDate,
      trialDate,
      deliveryDate,
      items: validItems.map((it, i) => ({ ...it, serialNo: i + 1 })),
      advancePaid,
      paymentMode,
      status,
    });
    setSaving(false);
    if (!created.success) {
      setSaveError(created.error);
      return;
    }

    // Show the success state with print options rather than redirecting
    // immediately — the shopkeeper's very next step is usually printing the
    // receipt/job card, so don't force them back to the list first.
    setSavedOrder(created.data);
  }

  function handleViewOrder() {
    if (!savedOrder) return;
    router.push(`/orders?created=1&orderId=${savedOrder.id}`);
  }

  function handleBackToOrders() {
    router.push("/orders?created=1");
  }

  // A draft view of the order for BalanceBadge's paid/due/overdue logic, so
  // Payment Status reuses the exact same computation as the rest of the app
  // instead of a second copy of the rules. An empty deliveryDate sorts as
  // "before" any real date string, which would make BalanceBadge report
  // "overdue" before the shopkeeper has even picked a delivery date — so an
  // unset date is treated as far in the future here instead.
  const draftOrderForBadge: Order = {
    id: "draft",
    orderNumber: orderNumberPreview,
    customerId: matchedCustomer?.id ?? "",
    orderDate,
    trialDate,
    deliveryDate: deliveryDate || "9999-12-31",
    items: computedItems,
    totalAmount,
    advancePaid,
    balance,
    paymentMode,
    status,
  };

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-7xl p-8">
        <button
          type="button"
          onClick={handleCancel}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("orders.backToOrders")}
        </button>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold text-ink">{t("orders.newOrder")}</h1>
            <p className="text-sm text-ink-muted">{orderNumberPreview}</p>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-ink-muted">{t("common.status")}</span>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-auto min-w-[150px] font-semibold"
            >
              {orderStatuses.map((s) => (
                <option key={s} value={s}>
                  {t(ORDER_STATUS_LABEL_KEYS[s])}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-5">
            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[17px] font-semibold text-ink">
                  {t("orders.customerDetails")}
                </h3>
                {matchedCustomer && (
                  <button
                    type="button"
                    onClick={handleChangeCustomer}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    {t("orders.changeCustomer")}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="relative flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.phoneNumber")}
                  </span>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={handlePhoneBlur}
                    placeholder="10-digit phone number"
                    className={cn(
                      inputClass,
                      submitAttempted && errors.phone && "border-chip-red-fg"
                    )}
                  />
                  {phoneSuggestions.length > 0 && (
                    <ul className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
                      {phoneSuggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onMouseDown={() => handleSelectCustomer(c)}
                            className="block w-full px-4 py-3 text-left text-sm hover:bg-surface"
                          >
                            <span className="font-medium text-ink">{c.name}</span>
                            <span className="text-ink-muted"> — {c.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {submitAttempted && errors.phone && (
                    <p className="text-xs text-chip-red-fg">{errors.phone}</p>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("customers.customerName")}
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                    {t("common.area")}
                  </span>
                  <input
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-muted">
                    {t("common.address")}
                  </span>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
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
                        onClick={() => setGender(g)}
                        className={cn(
                          "h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors",
                          gender === g
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
            </div>

            <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
              <h3 className="mb-4 text-[17px] font-semibold text-ink">
                {t("orders.orderDates")}
              </h3>
              <div className="grid grid-cols-3 gap-4">
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
                    className={inputClass}
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
                    ₹{totalAmount.toLocaleString("en-IN")}
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
                    ₹{balance.toLocaleString("en-IN")}
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
            />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-soft bg-white shadow-soft md:left-[250px]">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-8">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            {saveError ? (
              <span className="font-medium text-chip-red-fg">{saveError}</span>
            ) : canViewPayments ? (
              <>
                <span>
                  {t("common.total")}: <span className="font-semibold text-ink">₹{totalAmount.toLocaleString("en-IN")}</span>
                </span>
                <span className="text-border">|</span>
                <span>
                  {t("common.paid")}: <span className="font-semibold text-ink">₹{advancePaid.toLocaleString("en-IN")}</span>
                </span>
                <span className="text-border">|</span>
                <span>
                  {t("common.balance")}: <span className="font-semibold text-ink">₹{balance.toLocaleString("en-IN")}</span>
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
                {t("orders.orderCreatedSuccess")}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                {savedOrder.orderNumber}
              </p>
              <div className="mt-5 space-y-2">
                {canPrintReceipt && (
                  <Link
                    href={`/orders/${savedOrder.id}/print/customer`}
                    className="block rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    {t("orders.printCustomerReceipt")}
                  </Link>
                )}
                {canPrintJobCard && (
                  <Link
                    href={`/orders/${savedOrder.id}/print/job-card`}
                    className="block rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    {t("orders.printTailorJobCard")}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleViewOrder}
                  className="block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
                >
                  {t("orders.viewOrder")}
                </button>
                <button
                  type="button"
                  onClick={handleBackToOrders}
                  className="block w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface"
                >
                  {t("orders.backToOrders")}
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
