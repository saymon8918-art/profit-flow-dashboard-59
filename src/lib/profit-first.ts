import { supabase } from "@/integrations/supabase/client";

export type Account = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  percentage: number;
  target_percentage: number;
  kind: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AllocationItem = {
  id: string;
  allocation_id: string;
  account_id: string | null;
  account_name: string;
  percentage: number;
  amount: number;
};

export type Allocation = {
  id: string;
  revenue: number;
  note: string | null;
  occurred_at: string;
  created_at: string;
  allocation_items: AllocationItem[];
};

export const ACCOUNT_COLORS = [
  "acc-emerald",
  "acc-blue",
  "acc-amber",
  "acc-violet",
  "acc-rose",
  "acc-cyan",
  "acc-slate",
] as const;

export const DEFAULT_ACCOUNTS = [
  {
    name: "Income / Revenue",
    description: "Base account: 100% of revenue lands here before allocation.",
    percentage: 100,
    kind: "income",
    color: "acc-slate",
    sort_order: 0,
  },
  {
    name: "Profit",
    description: "Pay yourself first: the company profit reserve.",
    percentage: 5,
    kind: "allocation",
    color: "acc-emerald",
    sort_order: 1,
  },
  {
    name: "Owner's Comp",
    description: "Salary and payouts to the business owner.",
    percentage: 50,
    kind: "allocation",
    color: "acc-violet",
    sort_order: 2,
  },
  {
    name: "Taxes",
    description: "Reserve for tax obligations.",
    percentage: 15,
    kind: "allocation",
    color: "acc-blue",
    sort_order: 3,
  },
  {
    name: "Operating Expenses",
    description: "Rent, subscriptions, contractors, ads and other costs.",
    percentage: 30,
    kind: "allocation",
    color: "acc-amber",
    sort_order: 4,
  },
];

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export async function fetchAccounts(): Promise<Account[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  if (!data || data.length === 0) {
    const { data: seeded, error: seedError } = await supabase
      .from("accounts")
      .insert(DEFAULT_ACCOUNTS.map((a) => ({ ...a, user_id: userId })))
      .select("*");
    if (seedError) throw seedError;
    return (seeded ?? []).map(normalizeAccount).sort((a, b) => a.sort_order - b.sort_order);
  }

  return data.map(normalizeAccount);
}

function normalizeAccount(a: Record<string, unknown>): Account {
  return { ...(a as unknown as Account), percentage: Number(a["percentage"] ?? 0) };
}

export async function fetchAllocations(): Promise<Allocation[]> {
  const { data, error } = await supabase
    .from("allocations")
    .select("id, revenue, note, occurred_at, created_at, allocation_items(*)")
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as unknown as Allocation),
    revenue: Number((row as { revenue: number }).revenue),
    allocation_items: ((row as { allocation_items: AllocationItem[] }).allocation_items ?? []).map(
      (item) => ({
        ...item,
        amount: Number(item.amount),
        percentage: Number(item.percentage),
      }),
    ),
  }));
}

export function allocationAccounts(accounts: Account[]) {
  return accounts.filter((a) => a.kind !== "income");
}

export function totalPercentage(accounts: Account[]) {
  return allocationAccounts(accounts).reduce((sum, a) => sum + Number(a.percentage), 0);
}

export function balancesByAccount(allocations: Allocation[]) {
  const map = new Map<string, number>();
  for (const allocation of allocations) {
    for (const item of allocation.allocation_items) {
      if (!item.account_id) continue;
      map.set(item.account_id, (map.get(item.account_id) ?? 0) + Number(item.amount));
    }
  }
  return map;
}

export type Transfer = {
  id: string;
  account_id: string | null;
  account_name: string;
  amount: number;
  direction: string;
  status: string;
  note: string | null;
  transferred_at: string;
};

export type Invoice = {
  id: string;
  number: string;
  client_name: string;
  amount: number;
  status: string;
  issued_at: string;
  due_at: string | null;
  note: string | null;
};

export type TeamMember = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

export type Integration = {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  last_synced_at: string | null;
  created_at: string;
};

export const ADVANCED_ACCOUNT_PRESETS = [
  {
    name: "Materials / Subcontractors",
    description:
      "Isolate direct product or project costs (materials, subcontractors) before profit is calculated.",
    percentage: 10,
    color: "acc-cyan",
  },
  {
    name: "Vault / Emergency Fund",
    description: "Long-term savings buffer to keep the business alive through a downturn.",
    percentage: 5,
    color: "acc-rose",
  },
] as const;

export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue"] as const;
export const TEAM_ROLES = ["owner", "accountant", "cfo", "viewer"] as const;

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("No active session");
  return id;
}

export async function fetchTransfers(): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from("transfers")
    .select("id, account_id, account_name, amount, direction, status, note, transferred_at")
    .order("transferred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, number, client_name, amount, status, issued_at, due_at, note")
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({ ...i, amount: Number(i.amount) }));
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("id, email, full_name, role, status, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase
    .from("integrations")
    .select("id, provider, label, status, last_synced_at, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Groups allocations into period buckets with revenue, profit and expenses. */
export function seriesByPeriod(
  allocations: Allocation[],
  granularity: "month" | "quarter" | "year",
) {
  const buckets = new Map<string, { label: string; revenue: number; profit: number; expenses: number }>();
  for (const allocation of allocations) {
    const date = new Date(allocation.occurred_at);
    const key =
      granularity === "year"
        ? String(date.getFullYear())
        : granularity === "quarter"
          ? `${date.getFullYear()} Q${Math.floor(date.getMonth() / 3) + 1}`
          : `${date.toLocaleString("en-US", { month: "short" })} ${date.getFullYear()}`;
    const bucket = buckets.get(key) ?? { label: key, revenue: 0, profit: 0, expenses: 0 };
    bucket.revenue += allocation.revenue;
    for (const item of allocation.allocation_items) {
      const name = item.account_name.toLowerCase();
      if (name.includes("profit")) bucket.profit += Number(item.amount);
      else if (
        name.includes("expense") ||
        name.includes("opex") ||
        name.includes("material") ||
        name.includes("subcontractor")
      )
        bucket.expenses += Number(item.amount);
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()].reverse();
}
