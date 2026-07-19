"use server";

import { getServerCallerPermissions } from "@/lib/auth/require-server-permission";
import { hasAnyPermission, hasPermission, type Permission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

const GROUP_LIMIT = 5;
const CANDIDATE_LIMIT = 20;

export type GlobalSearchGroup = "Customers" | "Orders" | "Job Cards" | "Staff";

export interface GlobalSearchResult {
  id: string;
  type: "customer" | "order" | "job-card" | "staff";
  group: GlobalSearchGroup;
  title: string;
  subtitle: string;
  href: string;
}

export interface GlobalSearchPayload {
  results: Record<GlobalSearchGroup, GlobalSearchResult[]>;
}

const EMPTY_RESULTS: GlobalSearchPayload = {
  results: {
    Customers: [],
    Orders: [],
    "Job Cards": [],
    Staff: [],
  },
};

interface CustomerSearchRow {
  id: string;
  customer_number: string;
  name: string;
  phone: string;
  area: string;
}

interface OrderSearchRow {
  id: string;
  order_number: string;
  customer_snapshot: { name?: string; phone?: string; area?: string } | null;
  created_at: string | null;
  order_items?: { particular: string; qty: number }[];
}

interface OrderItemSearchRow {
  order_id: string;
}

interface JobCardSearchRow {
  id: string;
  job_card_number: string;
  order_id: string;
  order_number: string;
  customer_snapshot: { name?: string; phone?: string; area?: string } | null;
  garment_type: string;
  assigned_staff_id: string | null;
  created_at: string | null;
}

interface StaffSearchRow {
  id: string;
  name: string;
  phone: string;
  role: string;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function compactPhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function uniqById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function score(fields: string[], query: string, identifier?: string, createdAt?: string | null) {
  const q = normalize(query);
  const phoneQ = compactPhone(query);
  const id = normalize(identifier);
  let base = 0;

  if (id && id === q) base = 400;
  else if (id && id.startsWith(q)) base = 300;

  for (const field of fields) {
    const value = normalize(field);
    const phone = compactPhone(field);
    if (!value && !phone) continue;
    if (value === q || (phoneQ && phone === phoneQ)) base = Math.max(base, 250);
    else if (value.startsWith(q) || (phoneQ && phone.startsWith(phoneQ))) base = Math.max(base, 180);
    else if (value.includes(q) || (phoneQ && phone.includes(phoneQ))) base = Math.max(base, 100);
  }

  const recency = createdAt ? Math.min(Date.parse(createdAt) / 100000000000, 9) : 0;
  return base + recency;
}

function sortRanked<T>(
  rows: T[],
  query: string,
  getFields: (row: T) => string[],
  getIdentifier?: (row: T) => string,
  getCreatedAt?: (row: T) => string | null | undefined
) {
  return rows
    .map((row) => ({
      row,
      rank: score(
        getFields(row),
        query,
        getIdentifier?.(row),
        getCreatedAt?.(row)
      ),
    }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map((entry) => entry.row)
    .slice(0, GROUP_LIMIT);
}

function itemSummary(items: { particular: string; qty: number }[] | undefined) {
  const summary = (items ?? [])
    .slice(0, 3)
    .map((item) => `${item.particular} x${item.qty}`)
    .join(", ");
  return summary || "No items";
}

async function safeRows<T>(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) return [];
  return ((data as T[]) ?? []);
}

async function searchCustomers(admin: ReturnType<typeof createAdminClient>, query: string) {
  const pattern = `%${query}%`;
  const [byName, byPhone, byArea, byNumber] = await Promise.all([
    safeRows<CustomerSearchRow>(
      admin.from("customers").select("id, customer_number, name, phone, area").ilike("name", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<CustomerSearchRow>(
      admin.from("customers").select("id, customer_number, name, phone, area").ilike("phone", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<CustomerSearchRow>(
      admin.from("customers").select("id, customer_number, name, phone, area").ilike("area", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<CustomerSearchRow>(
      admin.from("customers").select("id, customer_number, name, phone, area").ilike("customer_number", pattern).limit(CANDIDATE_LIMIT)
    ),
  ]);

  return sortRanked(
    uniqById([...byName, ...byPhone, ...byArea, ...byNumber]),
    query,
    (row) => [row.name, row.phone, row.area],
    (row) => row.customer_number
  ).map<GlobalSearchResult>((row) => ({
    id: row.id,
    type: "customer",
    group: "Customers",
    title: row.name,
    subtitle: [row.phone, row.area].filter(Boolean).join(" · "),
    href: `/customers/${row.id}`,
  }));
}

async function searchOrders(admin: ReturnType<typeof createAdminClient>, query: string) {
  const pattern = `%${query}%`;
  const select = "id, order_number, customer_snapshot, created_at, order_items!order_items_order_id_fkey(particular, qty)";
  const [byNumber, byCustomerName, byCustomerPhone, matchingItems] = await Promise.all([
    safeRows<OrderSearchRow>(
      admin.from("orders").select(select).ilike("order_number", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<OrderSearchRow>(
      admin.from("orders").select(select).filter("customer_snapshot->>name", "ilike", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<OrderSearchRow>(
      admin.from("orders").select(select).filter("customer_snapshot->>phone", "ilike", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<OrderItemSearchRow>(
      admin.from("order_items").select("order_id").ilike("particular", pattern).limit(CANDIDATE_LIMIT)
    ),
  ]);
  const itemOrderIds = Array.from(new Set(matchingItems.map((row) => row.order_id))).slice(0, CANDIDATE_LIMIT);
  const byGarment = itemOrderIds.length
    ? await safeRows<OrderSearchRow>(
        admin.from("orders").select(select).in("id", itemOrderIds).limit(CANDIDATE_LIMIT)
      )
    : [];

  return sortRanked(
    uniqById([...byNumber, ...byCustomerName, ...byCustomerPhone, ...byGarment]),
    query,
    (row) => [
      row.customer_snapshot?.name ?? "",
      row.customer_snapshot?.phone ?? "",
      ...(row.order_items ?? []).map((item) => item.particular),
    ],
    (row) => row.order_number,
    (row) => row.created_at
  ).map<GlobalSearchResult>((row) => ({
    id: row.id,
    type: "order",
    group: "Orders",
    title: row.order_number,
    subtitle: `${row.customer_snapshot?.name ?? "Unknown"} · ${itemSummary(row.order_items)}`,
    href: `/orders/${row.id}`,
  }));
}

async function searchJobCards(
  admin: ReturnType<typeof createAdminClient>,
  query: string,
  permissions: Permission[]
) {
  const pattern = `%${query}%`;
  const canViewStaff = hasPermission(permissions, "staff.view");
  const [staffMatches, staffList] = canViewStaff
    ? await Promise.all([
        safeRows<StaffSearchRow>(
          admin.from("staff").select("id, name, phone, role").ilike("name", pattern).limit(CANDIDATE_LIMIT)
        ),
        safeRows<StaffSearchRow>(
          admin.from("staff").select("id, name, phone, role").limit(200)
        ),
      ])
    : [[], []];
  const staffById = new Map(staffList.map((staff) => [staff.id, staff]));
  const staffIds = staffMatches.map((staff) => staff.id).slice(0, CANDIDATE_LIMIT);
  const select = "id, job_card_number, order_id, order_number, customer_snapshot, garment_type, assigned_staff_id, created_at";
  const [byNumber, byOrder, byCustomerName, byCustomerPhone, byGarment, byStaff] = await Promise.all([
    safeRows<JobCardSearchRow>(
      admin.from("job_cards").select(select).ilike("job_card_number", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<JobCardSearchRow>(
      admin.from("job_cards").select(select).ilike("order_number", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<JobCardSearchRow>(
      admin.from("job_cards").select(select).filter("customer_snapshot->>name", "ilike", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<JobCardSearchRow>(
      admin.from("job_cards").select(select).filter("customer_snapshot->>phone", "ilike", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<JobCardSearchRow>(
      admin.from("job_cards").select(select).ilike("garment_type", pattern).limit(CANDIDATE_LIMIT)
    ),
    staffIds.length
      ? safeRows<JobCardSearchRow>(
          admin.from("job_cards").select(select).in("assigned_staff_id", staffIds).limit(CANDIDATE_LIMIT)
        )
      : Promise.resolve([]),
  ]);

  return sortRanked(
    uniqById([...byNumber, ...byOrder, ...byCustomerName, ...byCustomerPhone, ...byGarment, ...byStaff]),
    query,
    (row) => [
      row.order_number,
      row.customer_snapshot?.name ?? "",
      row.customer_snapshot?.phone ?? "",
      row.garment_type,
      staffById.get(row.assigned_staff_id ?? "")?.name ?? "",
    ],
    (row) => row.job_card_number,
    (row) => row.created_at
  ).map<GlobalSearchResult>((row) => {
    const worker = staffById.get(row.assigned_staff_id ?? "")?.name ?? "Unassigned";
    return {
      id: row.id,
      type: "job-card",
      group: "Job Cards",
      title: row.job_card_number,
      subtitle: `${row.garment_type} · ${row.order_number} · ${worker}`,
      href: `/job-cards?view=${row.id}`,
    };
  });
}

async function searchStaff(admin: ReturnType<typeof createAdminClient>, query: string, canManageStaff: boolean) {
  const pattern = `%${query}%`;
  const [byName, byPhone, byRole] = await Promise.all([
    safeRows<StaffSearchRow>(
      admin.from("staff").select("id, name, phone, role").ilike("name", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<StaffSearchRow>(
      admin.from("staff").select("id, name, phone, role").ilike("phone", pattern).limit(CANDIDATE_LIMIT)
    ),
    safeRows<StaffSearchRow>(
      admin.from("staff").select("id, name, phone, role").ilike("role", pattern).limit(CANDIDATE_LIMIT)
    ),
  ]);

  return sortRanked(
    uniqById([...byName, ...byPhone, ...byRole]),
    query,
    (row) => [row.name, row.phone, row.role]
  ).map<GlobalSearchResult>((row) => ({
    id: row.id,
    type: "staff",
    group: "Staff",
    title: row.name,
    subtitle: `${row.role} · ${row.phone}`,
    href: canManageStaff ? `/staff/${row.id}/edit` : "/staff",
  }));
}

export async function globalSearchAction(query: string): Promise<GlobalSearchPayload> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return EMPTY_RESULTS;

  const server = createServerClient();
  const permissions = await getServerCallerPermissions(server);
  if (!permissions) return EMPTY_RESULTS;

  const admin = createAdminClient();
  const canViewCustomers = hasPermission(permissions, "customers.view");
  const canViewOrders = hasPermission(permissions, "orders.view");
  const canViewJobCards = hasAnyPermission(permissions, ["orders.view", "staff.view"]);
  const canViewStaff = hasPermission(permissions, "staff.view");
  const canManageStaff = hasPermission(permissions, "staff.manage");

  const [customers, orders, jobCards, staff] = await Promise.all([
    canViewCustomers ? searchCustomers(admin, trimmed) : Promise.resolve([]),
    canViewOrders ? searchOrders(admin, trimmed) : Promise.resolve([]),
    canViewJobCards ? searchJobCards(admin, trimmed, permissions) : Promise.resolve([]),
    canViewStaff ? searchStaff(admin, trimmed, canManageStaff) : Promise.resolve([]),
  ]);

  return {
    results: {
      Customers: customers,
      Orders: orders,
      "Job Cards": jobCards,
      Staff: staff,
    },
  };
}
