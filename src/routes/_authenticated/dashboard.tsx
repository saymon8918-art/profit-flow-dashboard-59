import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Check, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  allocationAccounts,
  balancesByAccount,
  fetchAccounts,
  fetchAllocations,
  formatMoney,
  totalPercentage,
  type Account,
} from "@/lib/profit-first";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Allocation Dashboard — Profit First" },
      {
        name: "description",
        content: "Account balances, revenue allocation calculator and Profit First analytics.",
      },
      { property: "og:title", content: "Allocation Dashboard — Profit First" },
      {
        property: "og:description",
        content: "Account balances, revenue allocation calculator and analytics.",
      },
    ],
  }),
  component: Dashboard,
});

type Period = "month" | "quarter" | "year";

function periodStart(period: Period) {
  const now = new Date();
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
}

function Dashboard() {
  const queryClient = useQueryClient();
  const [revenueInput, setRevenueInput] = useState("");
  const [preview, setPreview] = useState<{ revenue: number; rows: { account: Account; amount: number }[] } | null>(
    null,
  );
  const [period, setPeriod] = useState<Period>("month");

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const allocationsQuery = useQuery({ queryKey: ["allocations"], queryFn: fetchAllocations });

  const accounts = accountsQuery.data ?? [];
  const allocations = allocationsQuery.data ?? [];
  const targets = allocationAccounts(accounts);
  const sumPct = totalPercentage(accounts);
  const balances = balancesByAccount(allocations);
  const totalRevenue = allocations.reduce((s, a) => s + a.revenue, 0);

  const periodAllocations = useMemo(() => {
    const start = periodStart(period);
    return allocations.filter((a) => new Date(a.occurred_at) >= start);
  }, [allocations, period]);

  const pieData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    for (const alloc of periodAllocations) {
      for (const item of alloc.allocation_items) {
        const account = accounts.find((a) => a.id === item.account_id);
        const key = item.account_name;
        const prev = map.get(key);
        map.set(key, {
          name: key,
          value: (prev?.value ?? 0) + item.amount,
          color: `var(--${account?.color ?? "acc-slate"})`,
        });
      }
    }
    return [...map.values()].filter((d) => d.value > 0);
  }, [periodAllocations, accounts]);

  const barData = useMemo(() => {
    const map = new Map<string, { label: string; revenue: number }>();
    for (const alloc of periodAllocations) {
      const d = new Date(alloc.occurred_at);
      const label = d.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
      const prev = map.get(label);
      map.set(label, { label, revenue: (prev?.revenue ?? 0) + alloc.revenue });
    }
    return [...map.values()].reverse();
  }, [periodAllocations]);

  function calculate() {
    const revenue = Number(revenueInput.replace(/\s|,/g, ""));
    if (!Number.isFinite(revenue) || revenue <= 0) {
      toast.error("Enter a positive revenue amount");
      return;
    }
    setPreview({
      revenue,
      rows: targets.map((account) => ({
        account,
        amount: Math.round(((revenue * Number(account.percentage)) / 100) * 100) / 100,
      })),
    });
  }

  const commit = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("No active session");

      const { data: allocation, error } = await supabase
        .from("allocations")
        .insert({ user_id: userId, revenue: preview.revenue })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("allocation_items").insert(
        preview.rows.map((row) => ({
          user_id: userId,
          allocation_id: allocation.id,
          account_id: row.account.id,
          account_name: row.account.name,
          percentage: row.account.percentage,
          amount: row.amount,
        })),
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      toast.success("Allocation recorded");
      setPreview(null);
      setRevenueInput("");
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = accountsQuery.isLoading || allocationsQuery.isLoading;

  return (
    <AppShell title="Dashboard" description="Revenue allocation with the Profit First method">
      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {Math.abs(sumPct - 100) > 0.001 ? (
            <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 text-warning" />
              <div>
                <p className="font-medium">Total allocation percentage — {sumPct.toFixed(2)}%</p>
                <p className="text-muted-foreground">
                  For a correct allocation, the total across all accounts (except the income account) must
                  equal 100%.
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-card p-6 shadow-elevate lg:col-span-2">
              <div className="flex items-center gap-2">
                <Calculator className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Allocation calculator</h2>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="revenue">Incoming revenue</Label>
                  <Input
                    id="revenue"
                    inputMode="decimal"
                    placeholder="10000"
                    value={revenueInput}
                    onChange={(e) => setRevenueInput(e.target.value)}
                  />
                </div>
                <Button onClick={calculate}>Calculate and allocate</Button>
              </div>

              {preview ? (
                <div className="mt-6 space-y-2">
                  {preview.rows.map((row) => (
                    <div
                      key={row.account.id}
                      className="flex items-center justify-between rounded-lg border bg-surface px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: `var(--${row.account.color})` }}
                        />
                        <span className="font-medium">{row.account.name}</span>
                        <span className="text-muted-foreground">
                          {Number(row.account.percentage)}%
                        </span>
                      </div>
                      <span className="tabular font-semibold">{formatMoney(row.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-muted-foreground">
                      Total revenue: <span className="tabular">{formatMoney(preview.revenue)}</span>
                    </span>
                    <Button onClick={() => commit.mutate()} disabled={commit.isPending}>
                      {commit.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Record allocation
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">
                  Enter an incoming amount to see the breakdown per account.
                </p>
              )}
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-elevate">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Total revenue</h2>
              </div>
              <p className="tabular mt-4 text-3xl font-semibold tracking-tight">
                {formatMoney(totalRevenue)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {allocations.length} recorded allocations
              </p>
              <div className="mt-6 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Accounts</span>
                  <span className="tabular">{accounts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total percentage</span>
                  <span className="tabular">{sumPct.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">Account balances</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {targets.map((account) => {
                const balance = balances.get(account.id) ?? 0;
                const share = totalRevenue > 0 ? (balance / totalRevenue) * 100 : 0;
                return (
                  <div key={account.id} className="rounded-2xl border bg-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{account.name}</p>
                        {account.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {account.description}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className="rounded-md px-2 py-1 text-xs font-medium"
                        style={{
                          background: `color-mix(in oklch, var(--${account.color}) 16%, transparent)`,
                          color: `var(--${account.color})`,
                        }}
                      >
                        {Number(account.percentage)}%
                      </span>
                    </div>
                    <p className="tabular mt-4 text-2xl font-semibold tracking-tight">
                      {formatMoney(balance)}
                    </p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(share, 100)}%`,
                          background: `var(--${account.color})`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {share.toFixed(1)}% of all revenue
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {pieData.length === 0 && barData.length === 0 ? null : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Allocation for the period</h2>
                <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="quarter">Quarter</SelectItem>
                    <SelectItem value="year">Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 h-72">
                {pieData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMoney(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-sm font-semibold">Revenue for the period</h2>
              <div className="mt-4 h-72">
                {barData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} />
                      <Tooltip formatter={(v: number) => formatMoney(v)} />
                      <Bar dataKey="revenue" fill="var(--acc-blue)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
          )}

          <CashflowMiniCalendar />
        </div>
      )}
    </AppShell>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data for the selected period
    </div>
  );
}

function CashflowMiniCalendar() {
  const today = new Date();
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const paymentsQuery = useQuery({ queryKey: ["scheduled_payments"], queryFn: fetchScheduledPayments });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });

  const cells = monthGrid(month);
  const events = buildEvents(
    paymentsQuery.data ?? [],
    invoicesQuery.data ?? [],
    cells[0]!,
    cells[cells.length - 1]!,
  );
  const byDay = new Map<string, { in: number; out: number }>();
  for (const event of events) {
    const prev = byDay.get(event.date) ?? { in: 0, out: 0 };
    if (event.direction === "in") prev.in += event.amount;
    else prev.out += event.amount;
    byDay.set(event.date, prev);
  }
  const todayKey = toKey(today);

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">
            Cashflow calendar — {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
        </div>
        <Link to="/cashflow" className="text-sm font-medium text-primary hover:underline">
          Open full calendar
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-surface px-1 py-1.5 text-center text-[11px] text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((day) => {
          const key = toKey(day);
          const totals = byDay.get(key);
          const outside = day.getMonth() !== month.getMonth();
          return (
            <div
              key={key}
              title={
                totals
                  ? `In ${formatMoney(totals.in)} · Out ${formatMoney(totals.out)}`
                  : undefined
              }
              className={`flex min-h-14 flex-col items-center gap-1 bg-card py-1.5 ${
                outside ? "opacity-40" : ""
              } ${key === todayKey ? "ring-1 ring-primary ring-inset" : ""}`}
            >
              <span className="text-[11px] font-medium">{day.getDate()}</span>
              <div className="flex gap-1">
                {totals?.in ? <span className="size-1.5 rounded-full bg-success" /> : null}
                {totals?.out ? <span className="size-1.5 rounded-full bg-destructive" /> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success" /> Expected inflow
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-destructive" /> Planned outflow
        </span>
      </div>
    </div>
  );
}
