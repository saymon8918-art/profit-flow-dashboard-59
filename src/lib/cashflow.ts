import { supabase } from "@/integrations/supabase/client";
import type { Invoice } from "@/lib/profit-first";

export type ScheduledPayment = {
  id: string;
  account_id: string | null;
  name: string;
  category: string;
  direction: string;
  amount: number;
  recurrence: string;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  note: string | null;
};

export const PAYMENT_CATEGORIES = [
  { value: "rent", label: "Rent" },
  { value: "subscription", label: "Subscription / Service" },
  { value: "payroll", label: "Payroll / Owner's Comp" },
  { value: "taxes", label: "Taxes" },
  { value: "other", label: "Other" },
] as const;

export const RECURRENCES = [
  { value: "once", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;

export type CalendarEvent = {
  id: string;
  date: string; // yyyy-mm-dd
  label: string;
  amount: number;
  direction: "in" | "out";
  kind: "scheduled" | "invoice";
  category: string;
  accountId?: string | null;
};


export function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseKey(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export async function fetchScheduledPayments(): Promise<ScheduledPayment[]> {
  const { data, error } = await supabase
    .from("scheduled_payments")
    .select(
      "id, account_id, name, category, direction, amount, recurrence, day_of_month, start_date, end_date, note",
    )
    .order("day_of_month", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
}

/** Expands recurring payments + invoice due dates into dated events inside [from, to]. */
export function buildEvents(
  payments: ScheduledPayment[],
  invoices: Invoice[],
  from: Date,
  to: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const payment of payments) {
    const start = parseKey(payment.start_date);
    const end = payment.end_date ? parseKey(payment.end_date) : null;
    const direction = payment.direction === "in" ? "in" : "out";

    const push = (date: Date, index: number) => {
      if (date < from || date > to) return;
      if (date < start) return;
      if (end && date > end) return;
      events.push({
        id: `${payment.id}-${index}`,
        date: toKey(date),
        label: payment.name,
        amount: payment.amount,
        direction,
        kind: "scheduled",
        category: payment.category,
        accountId: payment.account_id,
      });

    };

    if (payment.recurrence === "once") {
      push(start, 0);
      continue;
    }
    const step = payment.recurrence === "yearly" ? 12 : payment.recurrence === "quarterly" ? 3 : 1;
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    let index = 0;
    while (cursor <= to) {
      const monthsFromStart =
        (cursor.getFullYear() - start.getFullYear()) * 12 + (cursor.getMonth() - start.getMonth());
      if (monthsFromStart >= 0 && monthsFromStart % step === 0) {
        const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        const day = Math.min(payment.day_of_month || 1, lastDay);
        push(new Date(cursor.getFullYear(), cursor.getMonth(), day), index);
      }
      cursor.setMonth(cursor.getMonth() + 1);
      index += 1;
    }
  }

  for (const invoice of invoices) {
    if (invoice.status === "paid" || !invoice.due_at) continue;
    const due = parseKey(invoice.due_at);
    if (due < from || due > to) continue;
    events.push({
      id: `invoice-${invoice.id}`,
      date: toKey(due),
      label: `${invoice.number} · ${invoice.client_name}`,
      amount: invoice.amount,
      direction: "in",
      kind: "invoice",
      category: "invoice",
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/** 30-day running balance projection for the operating expenses account. */
export function forecastBalance(startingBalance: number, events: CalendarEvent[], days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let balance = startingBalance;
  const points: { label: string; date: string; balance: number }[] = [];

  for (let i = 0; i < days; i += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const key = toKey(day);
    for (const event of events.filter((e) => e.date === key)) {
      balance += event.direction === "in" ? event.amount : -event.amount;
    }
    points.push({
      label: day.toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
      date: key,
      balance: Math.round(balance * 100) / 100,
    });
  }
  return points;
}

export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  }
  return cells;
}
