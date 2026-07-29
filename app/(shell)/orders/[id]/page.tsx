"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  ChevronLeft,
  FileText,
  Loader2,
  Pencil,
  Printer,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import {
  getFinancialAdjustmentsForOrderAction,
  getOrderAttachmentsAction,
  getOrderByIdAction,
  getPaymentsForOrderAction,
} from "@/app/(shell)/orders/actions";
import { getJobCardsAction } from "@/app/(shell)/job-cards/actions";
import { getGarmentTypesAction } from "@/app/(shell)/catalog/actions";
import {
  getCustomerByIdAction,
  getGarmentMeasurementDraftSeedAction,
} from "@/app/(shell)/customers/actions";
import { getOrderPricingBillingSettingsAction } from "@/app/(shell)/settings/billing/actions";
import {
  getCustomerFabricsAction,
  getInventoryItemsAction,
  getInventoryMovementsAction,
} from "@/app/(shell)/inventory/actions";
import { FinancialAdjustmentModal } from "@/components/orders/financial-adjustment-modal";
import { FinancialAdjustmentsList } from "@/components/orders/financial-adjustments-list";
import { OrderAttachmentsCard } from "@/components/orders/order-attachments-card";
import {
  BalanceBadge,
  formatDate,
  formatOptionalDate,
  OrderStatusEditor,
  PaymentStatusBadge,
} from "@/components/orders/orders-table";
import { PaymentHistoryList } from "@/components/orders/payment-history-list";
import { RecordPaymentModal } from "@/components/orders/record-payment-modal";
import {
  StageJobCardPrintModal,
  type StageJobCardPrintTarget,
} from "@/components/orders/stage-job-card-print-modal";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LoadingState } from "@/components/ui/loading-state";
import { measurementFieldLabel, type CatalogGarmentType } from "@/lib/catalog";
import {
  historicalGarmentValueText,
  resolveHistoricalGarmentDisplayFields,
} from "@/lib/garment-form-runtime";
import { formatCurrency } from "@/lib/currency";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import type { JobCard } from "@/lib/job-cards";
import { isReceivableOrder } from "@/lib/order-finance";
import { getOrderTaxBreakdown } from "@/lib/order-tax";
import type {
  Customer,
  CustomerFabric,
  InventoryItem,
  InventoryMovement,
  Order,
  OrderAttachment,
  OrderFinancialAdjustment,
  OrderItem,
  Payment,
} from "@/lib/types";

const MEASUREMENT_NOTES_KEY = "__measurementNotes";
const LONG_MEASUREMENT_FIELD_COUNT = 9;

function money(value: number) {
  return formatCurrency(value);
}

function customerFabricsForJobCards(cards: JobCard[], fabrics: CustomerFabric[]) {
  const jobCardNumbers = new Set(cards.map((card) => card.jobCardNumber));
  return fabrics.filter((fabric) =>
    Array.from(jobCardNumbers).some((jobCardNumber) => fabric.notes?.includes(jobCardNumber))
  );
}

function taxableAdjustmentTotal(adjustments: OrderFinancialAdjustment[]) {
  return adjustments.reduce((sum, adjustment) => {
    if (adjustment.voided) return sum;
    if (adjustment.adjustmentType === "Discount") return sum - adjustment.amount;
    if (adjustment.adjustmentType === "Extra Charge") return sum + adjustment.amount;
    return sum;
  }, 0);
}

function orderDetailsTaxSplit(
  order: Order,
  taxableTotal: number,
  settings: ShopBillingSettings
) {
  const configured = getOrderTaxBreakdown(taxableTotal, settings);
  if (configured && !configured.pricesIncludeTax) return configured;

  const taxAmount = order.totalAmount - taxableTotal;
  if (taxAmount <= 0) return null;
  const halfTax = taxAmount / 2;
  const halfRate = taxableTotal > 0 ? (halfTax / taxableTotal) * 100 : 0;
  return {
    taxableValue: taxableTotal,
    taxAmount,
    totalWithTax: order.totalAmount,
    cgstAmount: halfTax,
    sgstAmount: halfTax,
    cgstRate: halfRate,
    sgstRate: halfRate,
    pricesIncludeTax: false,
  };
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft"
    >
      <h2 className="mb-4 text-[17px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

type MeasurementDisplayEntry = {
  key: string;
  label: string;
  value: string;
};

type MeasurementSnapshotDisplay = {
  entries: MeasurementDisplayEntry[];
  notes: string;
  invalid: boolean;
};

type MeasurementDraftSeed = {
  values: Record<string, unknown>;
  fitNotes: string;
  notes: string;
};

function safeMeasurementValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[object Object]" || trimmed.toLowerCase() === "nan") {
    return "";
  }
  return trimmed;
}

function garmentKey(value: string) {
  return value.trim().toLowerCase();
}

function garmentForItem(
  item: OrderItem,
  garmentTypes: CatalogGarmentType[]
): CatalogGarmentType | undefined {
  return (
    garmentTypes.find((garment) => garment.id === item.garmentTypeId) ??
    garmentTypes.find((garment) => garmentKey(garment.name) === garmentKey(item.particular))
  );
}

function measurementSnapshotDisplay(
  item: OrderItem,
  garmentTypes: CatalogGarmentType[],
  fallbackSeed?: MeasurementDraftSeed
): MeasurementSnapshotDisplay {
  const raw = item.measurements as unknown;
  if (!raw) {
    return measurementDisplayFromRecord(
      item,
      garmentTypes,
      fallbackSeed
        ? {
            ...fallbackSeed.values,
            ...(fallbackSeed.notes.trim()
              ? { [MEASUREMENT_NOTES_KEY]: fallbackSeed.notes.trim() }
              : {}),
          }
        : undefined
    );
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { entries: [], notes: "", invalid: true };
  }

  if (item.fieldSchemaSnapshot) {
    const historicalFields = resolveHistoricalGarmentDisplayFields({
      measurements: raw as Record<string, unknown>,
      fieldSchemaSnapshot: item.fieldSchemaSnapshot,
    });
    return {
      entries: historicalFields.map((field) => ({
        key: field.code,
        label: field.unit ? `${field.label} (${field.unit})` : field.label,
        value: historicalGarmentValueText(field.value),
      })),
      notes: safeMeasurementValue((raw as Record<string, unknown>)[MEASUREMENT_NOTES_KEY]),
      invalid: false,
    };
  }

  const display = measurementDisplayFromRecord(
    item,
    garmentTypes,
    raw as Record<string, unknown>
  );
  if (
    (display.entries.length > 0 || display.notes.length > 0 || display.invalid) ||
    !fallbackSeed
  ) {
    return display;
  }

  return measurementDisplayFromRecord(item, garmentTypes, {
    ...fallbackSeed.values,
    ...(fallbackSeed.notes.trim()
      ? { [MEASUREMENT_NOTES_KEY]: fallbackSeed.notes.trim() }
      : {}),
  });
}

function measurementDisplayFromRecord(
  item: OrderItem,
  garmentTypes: CatalogGarmentType[],
  record?: Record<string, unknown>
): MeasurementSnapshotDisplay {
  if (!record) return { entries: [], notes: "", invalid: false };
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(record)) {
    if (key === MEASUREMENT_NOTES_KEY) continue;
    const displayValue = safeMeasurementValue(value);
    if (displayValue) values.set(key, displayValue);
  }

  const garment = garmentForItem(item, garmentTypes);
  const configuredKeys = garment?.measurementFieldIds ?? [];
  const orderedKeys = [
    ...configuredKeys.filter((key) => values.has(key)),
    ...Array.from(values.keys()).filter((key) => !configuredKeys.includes(key)),
  ];

  return {
    entries: orderedKeys.map((key) => ({
      key,
      label: measurementFieldLabel(key),
      value: values.get(key) ?? "",
    })),
    notes: safeMeasurementValue(record[MEASUREMENT_NOTES_KEY]),
    invalid: false,
  };
}

function MeasurementsSnapshotSection({
  item,
  garmentTypes,
  fallbackSeed,
}: {
  item: OrderItem;
  garmentTypes: CatalogGarmentType[];
  fallbackSeed?: MeasurementDraftSeed;
}) {
  const { entries, notes, invalid } = measurementSnapshotDisplay(
    item,
    garmentTypes,
    fallbackSeed
  );
  const hasMeasurements = entries.length > 0;
  const hasNotes = notes.length > 0;
  const [expanded, setExpanded] = useState(
    entries.length <= LONG_MEASUREMENT_FIELD_COUNT
  );

  useEffect(() => {
    if (!invalid) return;
    console.warn("Order item measurement snapshot could not be parsed.", {
      orderItemId: item.id,
      serialNo: item.serialNo,
    });
  }, [invalid, item.id, item.serialNo]);

  if (!hasMeasurements && !hasNotes && !invalid) return null;

  return (
    <div className="border-t border-border-soft pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-muted">
          Measurements{hasMeasurements ? ` · ${entries.length} fields` : ""}
        </p>
        {hasMeasurements && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="text-[13px] font-semibold text-primary transition-colors hover:text-primary-dark"
          >
            {expanded ? "Hide Measurements" : "View Measurements"}
          </button>
        )}
      </div>

      {invalid ? (
        <p className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-ink-muted">
          Measurement details could not be loaded.
        </p>
      ) : (
        <>
          {hasMeasurements && expanded && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {entries.map((entry) => (
                <div key={entry.key}>
                  <dt className="text-[13px] text-ink-muted">{entry.label}</dt>
                  <dd className="font-semibold text-ink">{entry.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {hasNotes && (
            <div className="mt-3 border-t border-border-soft pt-2.5">
              <p className="text-[13px] font-medium text-ink-muted">
                Measurement Notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{notes}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrderDetailsPageContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canEdit = hasPermission("orders.edit");
  const canViewPayments = hasPermission("orders.viewPayments");
  const canRecordPayment = hasPermission("orders.recordPayment");
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const canPrintJobCard = hasPermission("orders.printJobCard");

  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | undefined>(undefined);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<OrderFinancialAdjustment[]>([]);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [billingSettings, setBillingSettings] = useState<ShopBillingSettings>(
    DEFAULT_SHOP_BILLING_SETTINGS
  );
  const [garmentTypes, setGarmentTypes] = useState<CatalogGarmentType[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [customerFabrics, setCustomerFabrics] = useState<CustomerFabric[]>([]);
  const [measurementSeeds, setMeasurementSeeds] = useState<Record<string, MeasurementDraftSeed>>(
    {}
  );
  const [loaded, setLoaded] = useState(false);
  const [returningToOrders, setReturningToOrders] = useState(false);
  const [openingEdit, setOpeningEdit] = useState(false);
  const [openingPrint, setOpeningPrint] = useState<"receipt" | "job-card" | null>(null);
  const [stagePrintTarget, setStagePrintTarget] = useState<StageJobCardPrintTarget | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  async function refreshOrder() {
    const refreshed = await getOrderByIdAction(params.id);
    if (refreshed) setOrder(refreshed);
    return refreshed;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const foundOrder = await getOrderByIdAction(params.id);
      if (cancelled) return;
      if (!foundOrder) {
        setOrder(null);
        setLoaded(true);
        return;
      }
      setOrder(foundOrder);
      const [
        foundCustomer,
        foundAttachments,
        foundPayments,
        foundAdjustments,
        foundBillingSettings,
        foundGarmentTypes,
        foundMeasurementSeeds,
        foundJobCards,
        foundInventoryItems,
        foundInventoryMovements,
        foundCustomerFabrics,
      ] =
        await Promise.all([
          getCustomerByIdAction(foundOrder.customerId),
          getOrderAttachmentsAction(foundOrder.id).catch(() => []),
          canViewPayments ? getPaymentsForOrderAction(foundOrder.id) : Promise.resolve([]),
          canViewPayments
            ? getFinancialAdjustmentsForOrderAction(foundOrder.id)
            : Promise.resolve([]),
          canViewPayments
            ? getOrderPricingBillingSettingsAction().catch(
                () => DEFAULT_SHOP_BILLING_SETTINGS
              )
            : Promise.resolve(DEFAULT_SHOP_BILLING_SETTINGS),
          getGarmentTypesAction().catch(() => []),
          Promise.all(
            Array.from(new Set(foundOrder.items.map((item) => item.particular))).map(
              async (garmentType) =>
                [
                  garmentKey(garmentType),
                  await getGarmentMeasurementDraftSeedAction(
                    foundOrder.customerId,
                    garmentType
                  ),
                ] as const
            )
          )
            .then((entries) => Object.fromEntries(entries))
            .catch(() => ({} as Record<string, MeasurementDraftSeed>)),
          getJobCardsAction(new Date().toISOString().slice(0, 10))
            .then((cards) =>
              (cards ?? []).filter((card) => card.orderId === foundOrder.id)
            )
            .catch(() => []),
          getInventoryItemsAction().catch(() => []),
          getInventoryMovementsAction()
            .then((movements) =>
              (movements ?? []).filter((movement) => movement.orderId === foundOrder.id)
            )
            .catch(() => []),
          getCustomerFabricsAction()
            .then((fabrics) =>
              (fabrics ?? []).filter((fabric) => fabric.orderId === foundOrder.id)
            )
            .catch(() => []),
        ]);
      if (cancelled) return;
      setCustomer(foundCustomer);
      setAttachments(foundAttachments);
      setPayments(foundPayments);
      setAdjustments(foundAdjustments);
      setBillingSettings(foundBillingSettings);
      setGarmentTypes(foundGarmentTypes);
      setMeasurementSeeds(foundMeasurementSeeds);
      setJobCards(foundJobCards);
      setInventoryItems(foundInventoryItems ?? []);
      setInventoryMovements(foundInventoryMovements ?? []);
      setCustomerFabrics(foundCustomerFabrics ?? []);
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id, canViewPayments]);

  const inventoryItemsById = useMemo(
    () => new Map(inventoryItems.map((item) => [item.id, item])),
    [inventoryItems]
  );

  if (loaded && !order) {
    notFound();
  }

  if (!loaded || !order) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <LoadingState label="Loading order details..." />
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const customerName = customer?.name ?? order.customerSnapshot?.name ?? t("common.unknown");
  const customerPhone = customer?.phone ?? order.customerSnapshot?.phone ?? "";
  const customerArea = customer?.area ?? order.customerSnapshot?.area ?? "";
  const formattedTrialDate = formatOptionalDate(order.trialDate);
  const taxableTotal = Math.max(
    order.items.reduce((sum, item) => sum + item.amount, 0) +
      taxableAdjustmentTotal(adjustments),
    0
  );
  const taxBreakdown = orderDetailsTaxSplit(order, taxableTotal, billingSettings);

  function handlePaymentChanged(result: { order: Order; payments: Payment[] }) {
    setOrder(result.order);
    setPayments(result.payments);
  }

  function handleAdjustmentChanged(result: {
    order: Order;
    payments: Payment[];
    adjustments: OrderFinancialAdjustment[];
  }) {
    setOrder(result.order);
    setPayments(result.payments);
    setAdjustments(result.adjustments);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <button
        type="button"
        onClick={() => {
          setReturningToOrders(true);
          router.push("/orders");
        }}
        disabled={returningToOrders}
        className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-70"
      >
        <ChevronLeft className="h-4 w-4" />
        {returningToOrders ? "Opening..." : t("orders.backToOrders")}
      </button>

      <div className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[26px] font-semibold text-ink">
                {order.orderNumber}
              </h1>
              <OrderStatusEditor order={order} onStatusChange={refreshOrder} />
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {customerName}
              {customerPhone ? ` · ${customerPhone}` : ""}
              {customerArea ? ` · ${customerArea}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Link
                href={`/orders/${order.id}/edit`}
                onClick={() => setOpeningEdit(true)}
                aria-busy={openingEdit}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                {openingEdit ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
                {openingEdit ? "Opening..." : t("orders.editOrder")}
              </Link>
            )}
            {canPrintReceipt && (
              <Link
                href={`/orders/${order.id}/print/customer`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setOpeningPrint("receipt");
                  window.setTimeout(() => setOpeningPrint(null), 900);
                }}
                aria-busy={openingPrint === "receipt"}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                {openingPrint === "receipt" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Printer className="h-3.5 w-3.5" />
                )}
                {openingPrint === "receipt" ? "Opening..." : t("orders.customerReceipt")}
              </Link>
            )}
            {canPrintJobCard && (
              <button
                type="button"
                onClick={() => setStagePrintTarget({ serialNo: order.items[0]?.serialNo ?? 1 })}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface"
              >
                <FileText className="h-3.5 w-3.5" />
                Print Stage Job Card
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Summary">
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-[13px] font-medium text-ink-muted">
                  {t("orders.orderDate")}
                </p>
                <p className="mt-1 font-semibold text-ink">
                  {formatDate(order.orderDate)}
                </p>
              </div>
              <div>
                <p className="text-[13px] font-medium text-ink-muted">
                  {t("orders.deliveryDate")}
                </p>
                <p className="mt-1 font-semibold text-ink">
                  {formatDate(order.deliveryDate)}
                </p>
              </div>
              {formattedTrialDate && (
                <div>
                  <p className="text-[13px] font-medium text-ink-muted">
                    {t("orders.trialDate")}
                  </p>
                  <p className="mt-1 font-semibold text-ink">
                    {formattedTrialDate}
                  </p>
                </div>
              )}
            </div>
            {order.deliveryPromiseNote && (
              <div className="mt-4 border-t border-border-soft pt-3">
                <p className="text-[13px] font-medium text-ink-muted">
                  Delivery Promise
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                  {order.deliveryPromiseNote}
                </p>
              </div>
            )}
          </Section>

          <Section title={t("orders.items")}>
            <div className="space-y-4">
              {order.items.map((item) => {
                const itemJobCards = jobCards
                  .filter((card) => card.item.serialNo === item.serialNo)
                  .sort((a, b) => a.unitNo - b.unitNo);
                const itemJobCardIds = new Set(itemJobCards.map((card) => card.id));
                const itemStockMovements = inventoryMovements.filter(
                  (movement) =>
                    movement.jobCardId &&
                    itemJobCardIds.has(movement.jobCardId) &&
                    movement.movementType === "Stock Out"
                );
                const itemCustomerFabrics = customerFabricsForJobCards(
                  itemJobCards,
                  customerFabrics
                );
                return (
                  <article
                    key={item.serialNo}
                    className="overflow-hidden rounded-lg border border-border-soft bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft bg-primary-tint/60 px-4 py-3">
                      <div>
                        <p className="font-semibold text-ink">
                          {item.serialNo}. {item.particular}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Qty {item.qty} · Rate {money(item.rate)} · Amount{" "}
                          {money(item.amount)}
                        </p>
                      </div>
                      {item.addOns && item.addOns.length > 0 && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary">
                          {item.addOns.length} add-ons
                        </span>
                      )}
                      {canPrintJobCard && itemJobCards.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {itemJobCards.map((card) => (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() =>
                                setStagePrintTarget({
                                  serialNo: card.item.serialNo,
                                })
                              }
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Print Stage Card
                            </button>
                          ))}
                        </div>
                      )}
                      {canPrintJobCard && itemJobCards.length === 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from({ length: Math.max(1, item.qty) }, (_, unitIndex) => {
                            const unitNo = unitIndex + 1;
                            return (
                              <button
                                key={unitNo}
                                type="button"
                                onClick={() =>
                                  setStagePrintTarget({
                                    serialNo: item.serialNo,
                                  })
                                }
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Print Stage Card
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-[13px] font-medium text-ink-muted">
                            {t("orders.fabricSource")}
                          </p>
                          <p className="mt-1 text-ink">
                            {item.fabricSource ?? "Not specified"}
                          </p>
                        </div>
                        {item.fabricNotes && (
                          <div>
                            <p className="text-[13px] font-medium text-ink-muted">
                              {t("orders.fabricNotes")}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-ink">
                              {item.fabricNotes}
                            </p>
                          </div>
                        )}
                        {item.designNotes && (
                          <div>
                            <p className="text-[13px] font-medium text-ink-muted">
                              {t("orders.designNotes")}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-ink">
                              {item.designNotes}
                            </p>
                          </div>
                        )}
                      </div>

                      {(itemStockMovements.length > 0 || itemCustomerFabrics.length > 0) && (
                        <div className="border-t border-border-soft pt-3">
                          <p className="mb-2 text-[13px] font-medium text-ink-muted">
                            Fabric Usage
                          </p>
                          <div className="space-y-2 text-sm text-ink-muted">
                            {itemStockMovements.map((movement) => {
                              const stockItem = inventoryItemsById.get(movement.itemId);
                              return (
                                <div key={movement.id}>
                                  <span className="font-semibold text-ink">Shop Stock Used: </span>
                                  {stockItem?.name ?? "Stock item"}
                                  {stockItem?.color ? `, ${stockItem.color}` : ""} ·{" "}
                                  {movement.quantity} {stockItem?.unit ?? ""} ·{" "}
                                  {formatDate(movement.movementDate)}
                                </div>
                              );
                            })}
                            {itemCustomerFabrics.map((fabric) => (
                              <div key={fabric.id}>
                                <span className="font-semibold text-ink">
                                  Customer Fabric Recorded:{" "}
                                </span>
                                {fabric.fabricDescription}
                                {fabric.color ? `, ${fabric.color}` : ""} · {fabric.quantity}{" "}
                                {fabric.unit} · {formatDate(fabric.receivedDate)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.addOns && item.addOns.length > 0 && (
                        <div className="border-t border-border-soft pt-3">
                          <p className="mb-2 text-[13px] font-medium text-ink-muted">
                            Add-ons
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {item.addOns.map((addOn) => (
                              <span
                                key={addOn.key}
                                className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted"
                              >
                                {addOn.label} · {money(addOn.amount)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <MeasurementsSnapshotSection
                        item={item}
                        garmentTypes={garmentTypes}
                        fallbackSeed={measurementSeeds[garmentKey(item.particular)]}
                      />

                      {(item.alterationIssue ||
                        item.alterationRequiredChange ||
                        item.alterationChargeType ||
                        item.linkedOriginalOrderId) && (
                        <div className="border-t border-border-soft pt-3 text-sm">
                          <p className="mb-2 text-[13px] font-medium text-ink-muted">
                            Alteration Details
                          </p>
                          {item.alterationIssue && (
                            <p className="text-ink-muted">
                              Original issue:{" "}
                              <span className="text-ink">{item.alterationIssue}</span>
                            </p>
                          )}
                          {item.alterationRequiredChange && (
                            <p className="text-ink-muted">
                              Required change:{" "}
                              <span className="text-ink">
                                {item.alterationRequiredChange}
                              </span>
                            </p>
                          )}
                          {item.alterationChargeType && (
                            <p className="text-ink-muted">
                              Charge:{" "}
                              <span className="text-ink">
                                {item.alterationChargeType}
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </Section>

          <Section id="attachments" title="Attachments">
            <OrderAttachmentsCard
              order={order}
              attachments={attachments}
              canEdit={canEdit}
            />
          </Section>
        </div>

        <div className="space-y-5">
          {canViewPayments && (
            <Section title={t("orders.paymentSummary")}>
              <div className="space-y-2 text-sm">
                {taxBreakdown && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Taxable Value</span>
                      <span className="font-semibold text-ink">
                        {money(taxBreakdown.taxableValue)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">
                        CGST ({taxBreakdown.cgstRate}%)
                      </span>
                      <span className="font-semibold text-ink">
                        {money(taxBreakdown.cgstAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">
                        SGST ({taxBreakdown.sgstRate}%)
                      </span>
                      <span className="font-semibold text-ink">
                        {money(taxBreakdown.sgstAmount)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{t("common.total")}</span>
                  <span className="font-semibold text-ink">
                    {money(order.totalAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{t("common.paid")}</span>
                  <span className="font-semibold text-ink">
                    {money(order.advancePaid)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">{t("common.balance")}</span>
                  <span className="font-semibold text-ink">
                    {money(order.balance)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">
                    {t("orders.paymentStatus")}
                  </span>
                  <PaymentStatusBadge order={order} />
                </div>
                <div className="pt-1">
                  <BalanceBadge order={order} todayIso={todayIso} />
                </div>
              </div>
              {canRecordPayment && (
                <div className="mt-4 grid gap-2">
                  {isReceivableOrder(order) && (
                    <button
                      type="button"
                      onClick={() => setShowRecordModal(true)}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary-tint px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      {t("orders.recordPayment")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAdjustmentModal(true)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Adjustment
                  </button>
                </div>
              )}
            </Section>
          )}

          {canViewPayments && (
            <Section id="adjustments" title="Adjustments">
              <FinancialAdjustmentsList
                order={order}
                adjustments={adjustments}
                onVoided={handleAdjustmentChanged}
              />
            </Section>
          )}

          {canViewPayments && (
            <Section id="payments" title={t("orders.paymentHistory")}>
              <PaymentHistoryList
                order={order}
                payments={payments}
                onVoided={handlePaymentChanged}
              />
            </Section>
          )}

          <Section title="Timeline">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Created</span>
                <span className="font-medium text-ink">
                  {order.createdAt ? formatDate(order.createdAt.slice(0, 10)) : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Last updated</span>
                <span className="font-medium text-ink">
                  {order.updatedAt ? formatDate(order.updatedAt.slice(0, 10)) : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Current status</span>
                <OrderStatusEditor order={order} onStatusChange={refreshOrder} />
              </div>
            </div>
          </Section>
        </div>
      </div>

      {showRecordModal && (
        <RecordPaymentModal
          order={order}
          onClose={() => setShowRecordModal(false)}
          onRecorded={(result) => {
            handlePaymentChanged(result);
            setShowRecordModal(false);
          }}
        />
      )}

      {showAdjustmentModal && (
        <FinancialAdjustmentModal
          order={order}
          onClose={() => setShowAdjustmentModal(false)}
          onRecorded={(result) => {
            handleAdjustmentChanged(result);
            setShowAdjustmentModal(false);
          }}
        />
      )}

      {stagePrintTarget && (
        <StageJobCardPrintModal
          order={order}
          target={stagePrintTarget}
          onClose={() => setStagePrintTarget(null)}
        />
      )}
    </div>
  );
}

export default function OrderDetailsPage({ params }: { params: { id: string } }) {
  return (
    <RequirePermission permission="orders.view">
      <OrderDetailsPageContent params={params} />
    </RequirePermission>
  );
}
