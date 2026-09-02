import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { fetchAllocations, formatMoney, seriesByPeriod } from "@/lib/profit-first";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Reports — Profit First" },
      {
        name: "description",
        content: "Track revenue, net profit and expense dynamics across months, quarters and years.",
      },
      { property: "og:title", content: "Analytics & Reports — Profit First" },
      {
        property: "og:description",
        content: "Revenue, profit and expense trends for your business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

const GRANULARITIES = [
  { key: "month", label: "Monthly" },
  { key: "quarter", label: "Quarterly" },
  { key: "year", label: "Yearly" },
] as const;

function AnalyticsPage() {
  const [granularity, setGranularity] = useState<"month" | "quarter" | "year">("month");
  const allocationsQuery = useQuery({ queryKey: ["allocations"], queryFn: fetchAllocations });
  const allocations = allocationsQuery.data ?? [];

  const series = useMemo(
    () => seriesByPeriod(allocations, granularity),
    [allocations, granularity],
  );

  const totals = series.reduce(
    (acc, s) => ({
      revenue: acc.revenue + s.revenue,
      profit: acc.profit + s.profit,
      expenses: acc.expenses + s.expenses,
    }),
    { revenue: 0, profit: 0, expenses: 0 },
  );

  const margin = totals.revenue ? (totals.profit / totals.revenue) * 100 : 0;

  return (
    <AppShell title="Analytics & Reports" description="Revenue, profit and expense dynamics">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {GRANULARITIES.map((g) => (
            <Button
              key={g.key}
              size="sm"
              variant={granularity === g.key ? "default" : "outline"}
              onClick={() => setGranularity(g.key)}
            >
              {g.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total revenue", value: formatMoney(totals.revenue), tone: "text-foreground" },
            { label: "Net profit reserve", value: formatMoney(totals.profit), tone: "text-success" },
            { label: "Expenses", value: formatMoney(totals.expenses), tone: "text-warning" },
            { label: "Profit margin", value: `${margin.toFixed(1)}%`, tone: "text-foreground" },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border bg-card p-5">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={cn("tabular mt-2 text-2xl font-semibold", card.tone)}>{card.value}</p>
            </div>
          ))}
        </div>

        {allocationsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : series.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No data yet. Record an allocation on the dashboard to see trends here.
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5">
              <p className="mb-4 text-sm font-medium">Revenue trend</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="var(--acc-blue)"
                      fill="var(--acc-blue)"
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <p className="mb-4 text-sm font-medium">Profit vs expenses</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend />
                    <Bar dataKey="profit" name="Net profit" fill="var(--acc-emerald)" radius={4} />
                    <Bar dataKey="expenses" name="Expenses" fill="var(--acc-amber)" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
