import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllocations, formatMoney } from "@/lib/profit-first";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Allocation History — Profit First" },
      {
        name: "description",
        content: "Table of recorded revenue allocations with date filtering.",
      },
      { property: "og:title", content: "Allocation History — Profit First" },
      {
        property: "og:description",
        content: "All income and account allocations with a date filter.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const allocationsQuery = useQuery({ queryKey: ["allocations"], queryFn: fetchAllocations });
  const allocations = allocationsQuery.data ?? [];

  const filtered = useMemo(() => {
    return allocations.filter((a) => {
      const date = new Date(a.occurred_at);
      if (from && date < new Date(from)) return false;
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (date > end) return false;
      }
      return true;
    });
  }, [allocations, from, to]);

  const totalRevenue = filtered.reduce((s, a) => s + a.revenue, 0);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("allocations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="History" description="Recorded income and allocations">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <Label htmlFor="from">From date</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To date</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Reset
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">
            Total for the period:{" "}
            <span className="tabular font-semibold text-foreground">
              {formatMoney(totalRevenue)}
            </span>
          </div>
        </div>

        {allocationsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No allocations recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Allocation by account</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(allocation.occurred_at).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="tabular font-semibold whitespace-nowrap">
                      {formatMoney(allocation.revenue)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {allocation.allocation_items.map((item) => (
                          <span
                            key={item.id}
                            className="rounded-md bg-muted px-2 py-1 text-xs whitespace-nowrap"
                          >
                            {item.account_name} · {formatMoney(item.amount)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label="Delete"
                        onClick={() => remove.mutate(allocation.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
