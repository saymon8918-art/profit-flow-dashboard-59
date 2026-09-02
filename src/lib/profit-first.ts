import { supabase } from "@/integrations/supabase/client";

export type Account = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  percentage: number;
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
    name: "Выручка / Доходы",
    description: "Базовый счёт: сюда поступает 100% выручки перед распределением.",
    percentage: 100,
    kind: "income",
    color: "acc-slate",
    sort_order: 0,
  },
  {
    name: "Прибыль",
    description: "Сначала плати себе: резерв прибыли компании.",
    percentage: 5,
    kind: "allocation",
    color: "acc-emerald",
    sort_order: 1,
  },
  {
    name: "Вознаграждение владельца",
    description: "Зарплата и выплаты собственнику бизнеса.",
    percentage: 50,
    kind: "allocation",
    color: "acc-violet",
    sort_order: 2,
  },
  {
    name: "Налоги",
    description: "Резерв под налоговые обязательства.",
    percentage: 15,
    kind: "allocation",
    color: "acc-blue",
    sort_order: 3,
  },
  {
    name: "Операционные расходы",
    description: "Аренда, подписки, подрядчики, реклама и прочие затраты.",
    percentage: 30,
    kind: "allocation",
    color: "acc-amber",
    sort_order: 4,
  },
];

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
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
