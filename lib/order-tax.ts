import type { ShopBillingSettings } from "@/lib/data/shop-billing-settings-db";

export interface OrderTaxBreakdown {
  taxableValue: number;
  taxAmount: number;
  totalWithTax: number;
  cgstAmount: number;
  sgstAmount: number;
  cgstRate: number;
  sgstRate: number;
  pricesIncludeTax: boolean;
}

export function getOrderTaxBreakdown(
  amount: number,
  settings: ShopBillingSettings
): OrderTaxBreakdown | null {
  const rate = Number(settings.taxRatePercent);
  const value = Math.max(Number(amount) || 0, 0);
  if (!settings.taxEnabled || rate <= 0) return null;

  const taxableValue = settings.pricesIncludeTax ? value / (1 + rate / 100) : value;
  const taxAmount = settings.pricesIncludeTax
    ? value - taxableValue
    : taxableValue * (rate / 100);
  const totalWithTax = settings.pricesIncludeTax ? value : taxableValue + taxAmount;
  const halfRate = rate / 2;

  return {
    taxableValue,
    taxAmount,
    totalWithTax,
    cgstAmount: taxAmount / 2,
    sgstAmount: taxAmount / 2,
    cgstRate: halfRate,
    sgstRate: halfRate,
    pricesIncludeTax: settings.pricesIncludeTax,
  };
}

export function orderTotalWithTax(amount: number, settings: ShopBillingSettings): number {
  return getOrderTaxBreakdown(amount, settings)?.totalWithTax ?? amount;
}
