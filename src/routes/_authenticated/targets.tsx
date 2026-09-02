import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Target } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { allocationAccounts, fetchAccounts } from "@/lib/profit-first";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({
    meta: [
      { title: "Target Percentages (CAP / TAP) — Profit First" },
      {
        name: "description",
        content:
          "Set current allocation percentages (CAP) and target allocation percentages (TAP) and track progress.",
      },
      { property: "og:title", content: "Target Percentages (CAP / TAP)" },
      {
        property: "og:description",
        content: "Plan your path from current to target allocation percentages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TargetsPage,
});

function TargetsPage() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const accounts = allocationAccounts(accountsQuery.data ?? []);
  const [draft, setDraft] = useState<Record<string, { cap: string; tap: string }>>({});

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const a of accounts) {
        if (!next[a.id]) {
          next[a.id] = {
            cap: String(Number(a.percentage)),
            tap: String(Number(a.target_percentage)),
          };
        }
      }
      return next;
    });
  }, [accounts]);

  const capSum = accounts.reduce((s, a) => s + Number(draft[a.id]?.cap ?? a.percentage), 0);
  const tapSum = accounts.reduce((s, a) => s + Number(draft[a.id]?.tap ?? a.target_percentage), 0);
  const capBalanced = Math.abs(capSum - 100) < 0.001;
  const tapBalanced = Math.abs(tapSum - 100) < 0.001;

  const save = useMutation({
    mutationFn: async () => {
      for (const account of accounts) {
        const values = draft[account.id];
        if (!values) continue;
        const cap = Number(values.cap);
        const tap = Number(values.tap);
        if (Number.isNaN(cap) || Number.isNaN(tap)) throw new Error("Percentages must be numbers");
        const { error } = await supabase
          .from("accounts")
          .update({ percentage: cap, target_percentage: tap })
          .eq("id", account.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Target percentages saved");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Target Percentages"
      description="Current (CAP) and target (TAP) allocation percentages"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: "Current allocation total (CAP)", sum: capSum, ok: capBalanced },
            { label: "Target allocation total (TAP)", sum: tapSum, ok: tapBalanced },
          ].map((box) => (
            <div
              key={box.label}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-4 text-sm",
                box.ok ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10",
              )}
            >
              {box.ok ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <AlertTriangle className="size-4 text-warning" />
              )}
              <div>
                <p className="font-medium">
                  {box.label}: {box.sum.toFixed(2)}%
                </p>
                <p className="text-muted-foreground">
                  {box.ok ? "Balanced at 100%." : "Percentages should add up to 100%."}
                </p>
              </div>
            </div>
          ))}
        </div>

        {accountsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const values = draft[account.id] ?? {
                cap: String(Number(account.percentage)),
                tap: String(Number(account.target_percentage)),
              };
              const cap = Number(values.cap) || 0;
              const tap = Number(values.tap) || 0;
              const progress = tap === 0 ? 100 : Math.min(100, (cap / tap) * 100);
              return (
                <div key={account.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex min-w-48 items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: `var(--${account.color})` }}
                      />
                      <p className="text-sm font-medium">{account.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">CAP %</span>
                      <Input
                        className="w-24"
                        inputMode="decimal"
                        aria-label={`${account.name} current percentage`}
                        value={values.cap}
                        onChange={(e) =>
                          setDraft({ ...draft, [account.id]: { ...values, cap: e.target.value } })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">TAP %</span>
                      <Input
                        className="w-24"
                        inputMode="decimal"
                        aria-label={`${account.name} target percentage`}
                        value={values.tap}
                        onChange={(e) =>
                          setDraft({ ...draft, [account.id]: { ...values, tap: e.target.value } })
                        }
                      />
                    </div>
                    <div className="min-w-40 flex-1">
                      <Progress value={progress} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tap === 0
                          ? "No target set"
                          : `${progress.toFixed(0)}% of the way to target`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
          Save percentages
        </Button>
      </div>
    </AppShell>
  );
}
