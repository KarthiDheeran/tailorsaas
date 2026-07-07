"use client";

import Link from "next/link";
import {
  ShoppingBag,
  Truck,
  AlertTriangle,
  CalendarClock,
  Wallet,
  IndianRupee,
  Plus,
} from "lucide-react";
import { getDashboardData } from "@/lib/dashboard";
import { StatCard } from "@/components/dashboard/stat-card";
import { TodaysDeliveries } from "@/components/dashboard/todays-deliveries";
import { OverdueOrdersList } from "@/components/dashboard/overdue-orders-list";
import { TrialQueue } from "@/components/dashboard/trial-queue";
import { PaymentPending } from "@/components/dashboard/payment-pending";

const STAT_ICONS = [
  ShoppingBag,
  Truck,
  AlertTriangle,
  CalendarClock,
  Wallet,
  IndianRupee,
];

export default function DashboardPage() {
  // ISO (UTC) date string — consistent between server and client renders,
  // matching the todayIso convention already used in orders-table.tsx.
  const todayIso = new Date().toISOString().slice(0, 10);
  const data = getDashboardData(todayIso);

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted">
            What needs attention today
          </p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" />
          New Order
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {data.stats.map((stat, i) => (
          <StatCard key={stat.label} stat={stat} icon={STAT_ICONS[i]} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodaysDeliveries orders={data.todaysDeliveries} />
          <OverdueOrdersList orders={data.overdueOrders} />
        </div>
        <div className="space-y-6">
          <TrialQueue orders={data.trialQueue} />
          <PaymentPending orders={data.paymentPending} />
        </div>
      </div>
    </div>
  );
}
