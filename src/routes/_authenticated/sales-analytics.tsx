import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, CalendarDays, Clock, ShoppingBag, DollarSign } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/sales-analytics")({
  head: () => ({
    meta: [
      { title: "Sales Analytics — Profit First" },
      { name: "description", content: "Sales trends, peak hours, busiest days and product performance." },
    ],
  }),
  component: SalesAnalyticsPage,
});

/* ------------------------------------------------------------------ */
/* Data loading (pages through every row, minimal columns)             */
/* ------------------------------------------------------------------ */

type Row = {
  transaction_date: string | null;
  transaction_time: string | null;
  transaction_qty: number | null;
  unit_price: number | null;
  store_location: string | null;
  product_category: string | null;
  product_type: string | null;
  product_detail: string | null;
};

const PAGE = 1000;

async function fetchAllSales(onProgress: (loaded: number) => void): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("sales_transactions")
      .select("transaction_date, transaction_time, transaction_qty, unit_price, store_location, product_category, product_type, product_detail")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    onProgress(rows.length);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const qty = (r: Row) => (r.transaction_qty ?? 1);
const revenue = (r: Row) => (r.unit_price ?? 0) * qty(r);
const productName = (r: Row) => r.product_detail || r.product_type || "Unknown";

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y!.slice(2)}`;
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function SalesAnalyticsPage() {
  const [loaded, setLoaded] = useState(0);
  const [location, setLocation] = useState("all");
  const [category, setCategory] = useState("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-analytics"],
    queryFn: () => fetchAllSales(setLoaded),
    staleTime: 5 * 60_000,
  });

  const filterOptions = useMemo(() => {
    const locations = new Set<string>();
    const categories = new Set<string>();
    for (const r of data ?? []) {
      if (r.store_location) locations.add(r.store_location);
      if (r.product_category) categories.add(r.product_category);
    }
    return {
      locations: [...locations].sort(),
      categories: [...categories].sort(),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    return data.filter(
      (r) =>
        (location === "all" || (r.store_location ?? "") === location) &&
        (category === "all" || (r.product_category ?? "") === category),
    );
  }, [data, location, category]);

  const agg = useMemo(() => {
    if (!filtered) return null;
    const data = filtered;

    const byDay = new Map<string, { date: string; revenue: number; qty: number; count: number }>();
    const weekdays = WEEKDAYS.map((name, i) => ({ i, name, count: 0, revenue: 0, days: new Set<string>() }));
    const hours = Array.from({ length: 24 }, (_, h) => ({ h, label: `${String(h).padStart(2, "0")}:00`, count: 0, revenue: 0 }));
    const locHours = new Map<string, number[]>();
    const products = new Map<string, { name: string; count: number; qty: number; revenue: number }>();
    let totalRevenue = 0;
    let totalQty = 0;

    for (const r of data) {
      const rev = revenue(r);
      const q = qty(r);
      totalRevenue += rev;
      totalQty += q;

      if (r.transaction_date) {
        const d = byDay.get(r.transaction_date) ?? { date: r.transaction_date, revenue: 0, qty: 0, count: 0 };
        d.revenue += rev;
        d.qty += q;
        d.count += 1;
        byDay.set(r.transaction_date, d);

        const wd = new Date(`${r.transaction_date}T00:00:00`).getDay();
        weekdays[wd]!.count += 1;
        weekdays[wd]!.revenue += rev;
        weekdays[wd]!.days.add(r.transaction_date);
      }

      if (r.transaction_time) {
        const h = parseInt(r.transaction_time.slice(0, 2), 10);
        if (h >= 0 && h < 24) {
          hours[h]!.count += 1;
          hours[h]!.revenue += rev;
          const loc = r.store_location || "Unknown";
          if (!locHours.has(loc)) locHours.set(loc, new Array(24).fill(0));
          locHours.get(loc)![h]! += 1;
        }
      }

      const name = productName(r);
      const p = products.get(name) ?? { name, count: 0, qty: 0, revenue: 0 };
      p.count += 1;
      p.qty += q;
      p.revenue += rev;
      products.set(name, p);
    }

    const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    const weekdayData = weekdays.map((w) => ({
      ...w,
      avg: w.days.size ? Math.round(w.count / w.days.size) : 0,
    }));
    const busiest = weekdayData.reduce((a, b) => (b.count > a.count ? b : a), weekdayData[0]!);
    const peakHour = hours.reduce((a, b) => (b.count > a.count ? b : a), hours[0]!);

    const locations = [...locHours.keys()].sort();
    const hourByLoc = hours.map((h, i) => {
      const point: Record<string, number | string> = { label: h.label };
      for (const loc of locations) point[loc] = locHours.get(loc)![i]!;
      return point;
    });
    const peakByLoc = locations.map((loc) => {
      const arr = locHours.get(loc)!;
      let best = 0;
      arr.forEach((v, i) => { if (v > arr[best]!) best = i; });
      return { loc, hour: `${String(best).padStart(2, "0")}:00`, count: arr[best]! };
    });

    const productList = [...products.values()];
    const byCount = [...productList].sort((a, b) => b.count - a.count);
    const byRevenue = [...productList].sort((a, b) => b.revenue - a.revenue);

    return {
      daily,
      weekdayData,
      busiest,
      peakHour,
      hours,
      locations,
      hourByLoc,
      peakByLoc,
      topByCount: byCount.slice(0, 10),
      bottomByCount: byCount.filter((p) => p.count > 0).slice(-10).reverse(),
      topByRevenue: byRevenue.slice(0, 10),
      totals: { revenue: totalRevenue, qty: totalQty, rows: data.length, days: byDay.size, products: productList.length },
    };
  }, [filtered]);

  const LOC_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777"];

  return (
    <AppShell title="Sales Analytics" description="Answers based on your imported sales records">
      {isLoading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm font-medium">Loading sales data…</p>
            <Progress value={Math.min(99, (loaded / Math.max(loaded, 1)) * 100)} className="w-64" />
            <p className="text-xs text-muted-foreground">{loaded.toLocaleString("en-US")} rows loaded</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-destructive">
            {(error as Error).message}
          </CardContent>
        </Card>
      ) : !agg || agg.totals.rows === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No sales data yet. Import an Excel file on the Import page first.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {filterOptions.locations.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {filterOptions.categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(location !== "all" || category !== "all") && (
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => { setLocation("all"); setCategory("all"); }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card><CardHeader className="pb-1"><CardDescription>Total revenue</CardDescription><CardTitle className="text-2xl">{money(agg.totals.revenue)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-1"><CardDescription>Transactions</CardDescription><CardTitle className="text-2xl">{agg.totals.rows.toLocaleString("en-US")}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-1"><CardDescription>Units sold</CardDescription><CardTitle className="text-2xl">{agg.totals.qty.toLocaleString("en-US")}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-1"><CardDescription>Busiest day</CardDescription><CardTitle className="text-2xl">{agg.busiest.name}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-1"><CardDescription>Peak hour</CardDescription><CardTitle className="text-2xl">{agg.peakHour.label}</CardTitle></CardHeader></Card>
          </div>

          {/* 1. Sales over time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="size-4" /> How have sales changed over time?</CardTitle>
              <CardDescription>Daily revenue and units sold across {agg.totals.days} days</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={agg.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="rev" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <YAxis yAxisId="qty" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(v) => fmtDate(String(v))}
                    formatter={(value, name) => [name === "Revenue" ? money(Number(value)) : Number(value).toLocaleString("en-US"), name]}
                  />
                  <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                  <Line yAxisId="qty" type="monotone" dataKey="qty" name="Units" stroke="#16a34a" dot={false} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 2. Busiest weekdays */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="size-4" /> Which weekdays are busiest?</CardTitle>
                <CardDescription>Transactions per day of week · busiest: {agg.busiest.name}</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.weekdayData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tickFormatter={(v: string) => v.slice(0, 3)} tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value, name) => [Number(value).toLocaleString("en-US"), name === "avg" ? "Avg per day" : "Transactions"]} />
                    <Bar dataKey="count" name="Transactions" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 3a. Demand by hour */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="size-4" /> What time of day is demand highest?</CardTitle>
                <CardDescription>Transactions by hour · peak at {agg.peakHour.label}</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.hours}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [Number(value).toLocaleString("en-US"), "Transactions"]} />
                    <Bar dataKey="count" name="Transactions" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* 3b. Hourly trend per location */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="size-4" /> Does the trend hold across all locations?</CardTitle>
              <CardDescription>Hourly transactions per store location</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={agg.hourByLoc}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value, name) => [Number(value).toLocaleString("en-US"), name]} />
                    {agg.locations.map((loc, i) => (
                      <Line key={loc} type="monotone" dataKey={loc} stroke={LOC_COLORS[i % LOC_COLORS.length]} dot={false} strokeWidth={2} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {agg.peakByLoc.map((p, i) => (
                  <div key={p.loc} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: LOC_COLORS[i % LOC_COLORS.length] }} />
                    <span className="font-medium">{p.loc}</span>
                    <span className="text-muted-foreground">peaks at {p.hour}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 4. Best sellers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShoppingBag className="size-4" /> Which products sell most often?</CardTitle>
                <CardDescription>Top 10 by number of transactions</CardDescription>
              </CardHeader>
              <CardContent className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.topByCount} layout="vertical" margin={{ left: 120 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [Number(value).toLocaleString("en-US"), "Transactions"]} />
                    <Bar dataKey="count" name="Transactions" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 4. Highest revenue */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="size-4" /> Which products bring the most revenue?</CardTitle>
                <CardDescription>Top 10 by total revenue</CardDescription>
              </CardHeader>
              <CardContent className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.topByRevenue} layout="vertical" margin={{ left: 120 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [money(Number(value)), "Revenue"]} />
                    <Bar dataKey="revenue" name="Revenue" fill="#16a34a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* 5. Least sold + combined table */}
          <Card>
            <CardHeader>
              <CardTitle>Most vs least sold products</CardTitle>
              <CardDescription>Frequency and revenue side by side</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 text-right font-medium">Transactions</th>
                      <th className="px-3 py-2 text-right font-medium">Units</th>
                      <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td colSpan={4} className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Best sellers</td></tr>
                    {agg.topByCount.map((p) => (
                      <tr key={`top-${p.name}`} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-right">{p.count.toLocaleString("en-US")}</td>
                        <td className="px-3 py-2 text-right">{p.qty.toLocaleString("en-US")}</td>
                        <td className="px-3 py-2 text-right">{money(p.revenue)}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={4} className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Least sold</td></tr>
                    {agg.bottomByCount.map((p) => (
                      <tr key={`bottom-${p.name}`} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-right">{p.count.toLocaleString("en-US")}</td>
                        <td className="px-3 py-2 text-right">{p.qty.toLocaleString("en-US")}</td>
                        <td className="px-3 py-2 text-right">{money(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
