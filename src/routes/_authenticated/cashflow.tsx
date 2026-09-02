import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  balancesByAccount,
  currentUserId,
  fetchAccounts,
  fetchAllocations,
  fetchInvoices,
  formatMoney,
} from "@/lib/profit-first";
import {
  applyPaymentRecords,
  buildEvents,
  fetchPaymentRecords,
  fetchScheduledPayments,
  forecastBalance,
  monthGrid,
  projectAccountBalances,
  PAYMENT_CATEGORIES,
  RECURRENCES,
  toKey,
  type CalendarEvent,
} from "@/lib/cashflow";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/cashflow")({
  head: () => ({
    meta: [
      { title: "Cashflow Calendar — Profit First" },
      {
        name: "description",
        content:
          "Payment calendar with recurring expenses, expected client inflow and a 30-day cash gap forecast.",
      },
      { property: "og:title", content: "Cashflow Calendar — Profit First" },
      {
        property: "og:description",
        content: "Plan recurring outflows, expected invoices and spot cash gaps early.",
      },
    ],
  }),
  component: CashflowPage,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CashflowPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<"month" | "week">("month");
  const [weekAnchor, setWeekAnchor] = useState(() => {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  });
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => toKey(new Date()));
  const [form, setForm] = useState({
    name: "",
    amount: "",
    category: "rent",
    direction: "out",
    recurrence: "monthly",
    day_of_month: "1",
    start_date: toKey(new Date()),
    account_id: "",
  });


  const paymentsQuery = useQuery({ queryKey: ["scheduled_payments"], queryFn: fetchScheduledPayments });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const allocationsQuery = useQuery({ queryKey: ["allocations"], queryFn: fetchAllocations });
  const recordsQuery = useQuery({ queryKey: ["payment_records"], queryFn: fetchPaymentRecords });

  const payments = paymentsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const allocations = allocationsQuery.data ?? [];
  const records = recordsQuery.data ?? [];
  const paidKeys = useMemo(() => new Set(records.map((r) => r.event_key)), [records]);

  const cells = useMemo(() => {
    if (view === "month") return monthGrid(month);
    return Array.from(
      { length: 7 },
      (_, i) => new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() + i),
    );
  }, [month, view, weekAnchor]);

  const weekEnd = useMemo(
    () => new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() + 6),
    [weekAnchor],
  );

  const events = useMemo(() => {
    if (cells.length === 0) return [];
    return buildEvents(payments, invoices, cells[0]!, cells[cells.length - 1]!);
  }, [payments, invoices, cells]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    }
    return map;
  }, [events]);

  const opexAccount = accounts.find((a) => {
    const n = a.name.toLowerCase();
    return n.includes("opex") || n.includes("operating");
  });
  const currentBalances = useMemo(
    () => applyPaymentRecords(balancesByAccount(allocations), records, accounts),
    [allocations, records, accounts],
  );
  const opexBalance = opexAccount ? (currentBalances.get(opexAccount.id) ?? 0) : 0;

  const forecast = useMemo(() => {
    const today = new Date();
    const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
    const forecastEvents = buildEvents(payments, invoices, today, horizon).filter(
      (e) => !paidKeys.has(e.id),
    );
    return forecastBalance(opexBalance, forecastEvents, 30);
  }, [payments, invoices, opexBalance, paidKeys]);

  // Multi-account projection from today up to the end of the visible range (min. 30 days ahead).
  const projection = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const gridEnd = cells[cells.length - 1] ?? today;
    const minEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
    const end = gridEnd > minEnd ? gridEnd : minEnd;
    const projEvents = buildEvents(payments, invoices, today, end).filter(
      (e) => !paidKeys.has(e.id),
    );
    return projectAccountBalances(accounts, currentBalances, projEvents, today, end);
  }, [accounts, currentBalances, payments, invoices, cells, paidKeys]);

  const projectionByDate = useMemo(
    () => new Map(projection.map((day) => [day.date, day])),
    [projection],
  );

  const selectedDay = projectionByDate.get(selectedDate);
  const selectedEvents = events.filter((e) => e.date === selectedDate);

  const lowestPoint = forecast.reduce(
    (min, p) => (p.balance < min.balance ? p : min),
    forecast[0] ?? { label: "", date: "", balance: 0 },
  );

  const firstGapDay = projection.find((d) => d.deficits.length > 0);

  const monthTotals = events.reduce(
    (acc, e) => {
      if (e.direction === "in") acc.in += e.amount;
      else acc.out += e.amount;
      return acc;
    },
    { in: 0, out: 0 },
  );


  const create = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount.replace(/\s|,/g, ""));
      if (!form.name.trim()) throw new Error("Enter a name");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive amount");
      const user_id = await currentUserId();
      const { error } = await supabase.from("scheduled_payments").insert({
        user_id,
        name: form.name.trim(),
        amount,
        category: form.category,
        direction: form.direction,
        recurrence: form.recurrence,
        day_of_month: Math.min(Math.max(Number(form.day_of_month) || 1, 1), 31),
        start_date: form.start_date,
        account_id: form.direction === "out" && form.account_id ? form.account_id : null,
      });
      if (error) throw error;
    },

    onSuccess: () => {
      toast.success("Scheduled payment added");
      setOpen(false);
      setForm({ ...form, name: "", amount: "" });
      queryClient.invalidateQueries({ queryKey: ["scheduled_payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPayment = useMutation({
    mutationFn: async (event: CalendarEvent) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("payment_records").insert({
        user_id,
        event_key: event.id,
        scheduled_payment_id: event.scheduledPaymentId ?? null,
        invoice_id: event.invoiceId ?? null,
        account_id: event.accountId ?? null,
        name: event.label,
        category: event.category,
        direction: event.direction,
        amount: event.amount,
        occurred_on: event.date,
      });
      if (error) throw error;
      if (event.invoiceId) {
        await supabase.from("invoices").update({ status: "paid" }).eq("id", event.invoiceId);
      }
    },
    onSuccess: () => {
      toast.success("Payment marked as completed");
      queryClient.invalidateQueries({ queryKey: ["payment_records"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undoPayment = useMutation({
    mutationFn: async (eventKey: string) => {
      const record = records.find((r) => r.event_key === eventKey);
      const { error } = await supabase.from("payment_records").delete().eq("event_key", eventKey);
      if (error) throw error;
      if (record?.invoice_id) {
        await supabase.from("invoices").update({ status: "sent" }).eq("id", record.invoice_id);
      }
    },
    onSuccess: () => {
      toast.success("Marked as not paid");
      queryClient.invalidateQueries({ queryKey: ["payment_records"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: ["scheduled_payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment_records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = paymentsQuery.isLoading || invoicesQuery.isLoading || accountsQuery.isLoading;
  const todayKey = toKey(new Date());

  return (
    <AppShell
      title="Cashflow Calendar"
      description="Planned outflows, expected inflow and a 30-day cash gap forecast"
    >
      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Expected inflow (view)" value={formatMoney(monthTotals.in)} tone="success" />
            <SummaryCard label="Planned outflow (view)" value={formatMoney(monthTotals.out)} tone="danger" />
            <SummaryCard
              label="Lowest OpEx balance (30d)"
              value={formatMoney(lowestPoint.balance)}
              tone={lowestPoint.balance < 0 ? "danger" : "default"}
            />
          </div>

          {lowestPoint.balance < 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 text-destructive" />
              <div>
                <p className="font-medium">Projected cash gap on {lowestPoint.label}</p>
                <p className="text-muted-foreground">
                  The Operating Expenses account is forecast to drop to {formatMoney(lowestPoint.balance)}.
                  Move a payment date or top the account up.
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">
                  {view === "month"
                    ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" })
                    : `${weekAnchor.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={view} onValueChange={(v) => setView(v as "month" | "week")}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={view === "month" ? "Previous month" : "Previous week"}
                  onClick={() =>
                    view === "month"
                      ? setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                      : setWeekAnchor(
                          new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() - 7),
                        )
                  }
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={view === "month" ? "Next month" : "Next week"}
                  onClick={() =>
                    view === "month"
                      ? setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                      : setWeekAnchor(
                          new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() + 7),
                        )
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4" />
                      Scheduled payment
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New scheduled payment</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="sp-name">Name</Label>
                        <Input
                          id="sp-name"
                          placeholder="Office rent"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sp-amount">Amount</Label>
                        <Input
                          id="sp-amount"
                          inputMode="decimal"
                          placeholder="1200"
                          value={form.amount}
                          onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sp-day">Day of month</Label>
                        <Input
                          id="sp-day"
                          inputMode="numeric"
                          value={form.day_of_month}
                          onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={form.category}
                          onValueChange={(v) => setForm({ ...form, category: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Direction</Label>
                        <Select
                          value={form.direction}
                          onValueChange={(v) => setForm({ ...form, direction: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="out">Outflow</SelectItem>
                            <SelectItem value="in">Inflow</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Recurrence</Label>
                        <Select
                          value={form.recurrence}
                          onValueChange={(v) => setForm({ ...form, recurrence: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RECURRENCES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sp-start">Start date</Label>
                        <Input
                          id="sp-start"
                          type="date"
                          value={form.start_date}
                          onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        />
                      </div>
                      {form.direction === "out" ? (
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Charged to account</Label>
                          <Select
                            value={form.account_id || "auto"}
                            onValueChange={(v) => setForm({ ...form, account_id: v === "auto" ? "" : v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto (match by category)</SelectItem>
                              {accounts
                                .filter((a) => a.kind !== "income")
                                .map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            This expense reduces the projected balance of the selected account.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground sm:col-span-2">
                          Inflow is split across your allocation accounts by their percentages.
                        </p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button onClick={() => create.mutate()} disabled={create.isPending}>
                        {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                        Add payment
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-sm">
              {WEEKDAYS.map((d, i) => {
                const isWeekend = i >= 5;
                return (
                  <div
                    key={d}
                    className={cn(
                      "px-2 py-2.5 text-center text-sm font-semibold",
                      isWeekend ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground",
                    )}
                  >
                    {d}
                  </div>
                );
              })}
              {cells.map((day) => {
                const key = toKey(day);
                const dayEvents = byDay.get(key) ?? [];
                const outside = view === "month" && day.getMonth() !== month.getMonth();
                const projected = projectionByDate.get(key);
                const gap = (projected?.deficits.length ?? 0) > 0;
                const isWeekendDay = day.getDay() === 0 || day.getDay() === 6;
                const totals = dayEvents.reduce(
                  (acc, e) => {
                    if (paidKeys.has(e.id)) return acc;
                    if (e.direction === "in") acc.in += e.amount;
                    else acc.out += e.amount;
                    return acc;
                  },
                  { in: 0, out: 0 },
                );
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setSelectedDate(key)}
                    className={cn(
                      "min-h-24 bg-card p-2 text-left align-top transition-colors hover:bg-surface",
                      view === "week" && "min-h-36",
                      outside && "bg-card/50 text-muted-foreground",
                      gap && "bg-destructive/10",
                      key === todayKey && "ring-1 ring-primary ring-inset",
                      key === selectedDate && "ring-2 ring-primary ring-inset",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-base font-semibold",
                          isWeekendDay && !outside && "text-primary",
                        )}
                      >
                        {view === "week"
                          ? day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
                          : day.getDate()}
                      </span>
                      {gap ? (
                        <AlertTriangle
                          className="size-3 text-destructive"
                          aria-label="Projected cash gap"
                        />
                      ) : null}
                    </div>
                    {totals.in > 0 || totals.out > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] font-semibold">
                        {totals.in > 0 ? (
                          <span className="tabular text-success">+{formatMoney(totals.in)}</span>
                        ) : null}
                        {totals.out > 0 ? (
                          <span className="tabular text-destructive">−{formatMoney(totals.out)}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, view === "week" ? 6 : 3).map((event) => {
                        const paid = paidKeys.has(event.id);
                        return (
                          <div
                            key={event.id}
                            title={`${event.label} · ${formatMoney(event.amount)}${paid ? " · completed" : ""}`}
                            className={cn(
                              "truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
                              paid
                                ? "bg-muted text-muted-foreground line-through"
                                : event.direction === "in"
                                  ? "bg-success/15 text-success"
                                  : "bg-destructive/15 text-destructive",
                            )}
                          >
                            {paid ? "✓" : event.direction === "in" ? "▲" : "▼"} {event.label}
                            {view === "week" ? ` · ${formatMoney(event.amount)}` : ""}
                          </div>
                        );
                      })}
                      {dayEvents.length > (view === "week" ? 6 : 3) ? (
                        <p className="text-[10px] text-muted-foreground">
                          +{dayEvents.length - (view === "week" ? 6 : 3)} more
                        </p>
                      ) : null}
                    </div>
                  </button>
                );

              })}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Projected account balances</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inflow is split by allocation percentages; expenses reduce their linked account.
                </p>
              </div>
              <Input
                type="date"
                aria-label="Projection date"
                className="w-44"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            {!selectedDay ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Pick a date from today onwards to see the projected balances.
              </p>
            ) : (
              <>
                {selectedDay.deficits.length > 0 ? (
                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                    <div>
                      <p className="font-medium">Potential cash gap on this date</p>
                      <p className="text-muted-foreground">
                        Not enough money projected on:{" "}
                        {selectedDay.deficits
                          .map((id) => accounts.find((a) => a.id === id)?.name ?? "account")
                          .join(", ")}
                        .
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {accounts
                    .filter((a) => a.kind !== "income")
                    .map((account) => {
                      const value = selectedDay.balances[account.id] ?? 0;
                      return (
                        <div
                          key={account.id}
                          className={cn(
                            "rounded-xl border bg-surface p-4",
                            value < 0 && "border-destructive/50 bg-destructive/10",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ background: `var(--${account.color})` }}
                            />
                            <p className="truncate text-xs text-muted-foreground">{account.name}</p>
                          </div>
                          <p
                            className={cn(
                              "tabular mt-2 text-lg font-semibold",
                              value < 0 && "text-destructive",
                            )}
                          >
                            {formatMoney(value)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            now {formatMoney(currentBalances.get(account.id) ?? 0)}
                          </p>
                        </div>
                      );
                    })}
                </div>

                <div className="mt-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                    Movements on this date
                  </h3>
                  {selectedEvents.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No planned movements.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {selectedEvents.map((event) => {
                        const paid = paidKeys.has(event.id);
                        return (
                          <div
                            key={event.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-2 text-sm"
                          >
                            <span className={cn("truncate", paid && "text-muted-foreground line-through")}>
                              {event.label}
                            </span>
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "tabular font-semibold",
                                  paid
                                    ? "text-muted-foreground"
                                    : event.direction === "in"
                                      ? "text-success"
                                      : "text-destructive",
                                )}
                              >
                                {event.direction === "in" ? "+" : "−"}
                                {formatMoney(event.amount)}
                              </span>
                              {paid ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => undoPayment.mutate(event.id)}
                                  disabled={undoPayment.isPending}
                                >
                                  <Undo2 className="size-4" />
                                  Undo
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => confirmPayment.mutate(event)}
                                  disabled={confirmPayment.isPending}
                                >
                                  <Check className="size-4" />
                                  Mark as paid
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {firstGapDay ? (
              <p className="mt-5 text-xs text-muted-foreground">
                First projected shortfall:{" "}
                <button
                  type="button"
                  className="font-medium text-destructive underline underline-offset-2"
                  onClick={() => setSelectedDate(firstGapDay.date)}
                >
                  {firstGapDay.date}
                </button>
              </p>
            ) : null}
          </div>



          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-sm font-semibold">30-day cash gap forecast — Operating Expenses</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Starting balance {formatMoney(opexBalance)}
              {opexAccount ? ` · ${opexAccount.name}` : " · no OpEx account found"}
            </p>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecast}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={4} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={80} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--acc-blue)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-sm font-semibold">Completed payments</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Confirmed movements already applied to your account balances.
            </p>
            {records.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing confirmed yet. Pick a date above and mark a payment as paid.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{record.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {record.occurred_on} ·{" "}
                        {record.direction === "in"
                          ? "split across allocation accounts"
                          : (accounts.find((a) => a.id === record.account_id)?.name ?? "auto account")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "tabular font-semibold",
                          record.direction === "in" ? "text-success" : "text-destructive",
                        )}
                      >
                        {record.direction === "in" ? "+" : "−"}
                        {formatMoney(record.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Undo payment"
                        onClick={() => undoPayment.mutate(record.event_key)}
                        disabled={undoPayment.isPending}
                      >
                        <Undo2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-sm font-semibold">Recurring items</h2>
            {payments.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No scheduled payments yet. Add rent, subscriptions, payroll and tax deadlines to see them
                on the calendar.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{payment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_CATEGORIES.find((c) => c.value === payment.category)?.label ??
                          payment.category}{" "}
                        ·{" "}
                        {RECURRENCES.find((r) => r.value === payment.recurrence)?.label ??
                          payment.recurrence}{" "}
                        · day {payment.day_of_month}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "tabular font-semibold",
                          payment.direction === "in" ? "text-success" : "text-destructive",
                        )}
                      >
                        {payment.direction === "in" ? "+" : "−"}
                        {formatMoney(payment.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => remove.mutate(payment.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "danger";
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-2 text-2xl font-semibold tracking-tight",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
