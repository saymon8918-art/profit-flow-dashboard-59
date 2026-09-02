import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link2, Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, fetchIntegrations } from "@/lib/profit-first";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations & Open API — Profit First" },
      {
        name: "description",
        content:
          "Connect bank accounts and data providers to import transactions into your Profit First dashboard.",
      },
      { property: "og:title", content: "Integrations & Open API" },
      {
        property: "og:description",
        content: "Bank connections and API access for automatic transaction import.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

const PROVIDERS = [
  { key: "plaid", name: "Plaid", blurb: "Aggregated bank feeds for US and CA accounts." },
  { key: "open-banking", name: "Open Banking API", blurb: "PSD2 connections for EU banks." },
  { key: "csv", name: "CSV / Bank export", blurb: "Manual statement import as a fallback." },
];

function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const integrationsQuery = useQuery({ queryKey: ["integrations"], queryFn: fetchIntegrations });
  const integrations = integrationsQuery.data ?? [];

  const connect = useMutation({
    mutationFn: async (provider: string) => {
      const userId = await currentUserId();
      const { error } = await supabase.from("integrations").insert({
        user_id: userId,
        provider,
        label: label.trim() || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Connection requested — finish setup with your bank credentials");
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("integrations")
        .update({ status: "connected", last_synced_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Connection synced");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Connection removed");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Integrations" description="Bank connections and automatic transaction import">
      <div className="space-y-6">
        <div className="rounded-2xl border bg-card p-5">
          <Label htmlFor="label">Connection label (optional)</Label>
          <Input
            id="label"
            className="mt-2 max-w-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Main business account"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((provider) => (
            <div key={provider.key} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2">
                <Plug className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium">{provider.name}</p>
              </div>
              <p className="mt-2 min-h-10 text-xs text-muted-foreground">{provider.blurb}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => connect.mutate(provider.key)}
                disabled={connect.isPending}
              >
                <Link2 className="size-3.5" />
                Connect
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Your connections</p>
          {integrationsQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : integrations.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
              No connections yet.
            </div>
          ) : (
            integrations.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"
              >
                <div className="min-w-40">
                  <p className="text-sm font-medium capitalize">{item.provider}</p>
                  <p className="text-xs text-muted-foreground">{item.label ?? "Unnamed"}</p>
                </div>
                <span
                  className={cn(
                    "rounded-md px-2 py-1 text-xs capitalize",
                    item.status === "connected"
                      ? "bg-success/15 text-success"
                      : "bg-warning/15 text-warning",
                  )}
                >
                  {item.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.last_synced_at
                    ? `Last sync: ${new Date(item.last_synced_at).toLocaleString("en-US")}`
                    : "Never synced"}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => sync.mutate(item.id)}>
                    <RefreshCw className="size-3.5" />
                    Sync
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove.mutate(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
