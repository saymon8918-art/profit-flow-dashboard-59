import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCOUNT_COLORS,
  fetchAccounts,
  totalPercentage,
  type Account,
} from "@/lib/profit-first";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Profit First Accounts — Percentage Setup" },
      {
        name: "description",
        content:
          "Create, edit and delete Profit First accounts and set revenue allocation percentages.",
      },
      { property: "og:title", content: "Profit First Accounts" },
      {
        property: "og:description",
        content: "Configure target accounts and revenue allocation percentages.",
      },
    ],
  }),
  component: AccountsPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z.string().trim().max(300).optional(),
  percentage: z.number().min(0, "Percentage cannot be negative").max(100, "Maximum is 100%"),
  color: z.string(),
});

type FormState = {
  id?: string;
  name: string;
  description: string;
  percentage: string;
  color: string;
  kind: string;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  percentage: "",
  color: "acc-cyan",
  kind: "allocation",
};

function AccountsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const accounts = accountsQuery.data ?? [];
  const sumPct = totalPercentage(accounts);
  const balanced = Math.abs(sumPct - 100) < 0.001;

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        name: form.name,
        description: form.description,
        percentage: Number(form.percentage),
        color: form.color,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Please check your input");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("No active session");

      const payload = {
        name: parsed.data.name,
        description: parsed.data.description || null,
        percentage: parsed.data.percentage,
        color: parsed.data.color,
      };

      if (form.id) {
        const { error } = await supabase.from("accounts").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts").insert({
          ...payload,
          user_id: userId,
          kind: "allocation",
          sort_order: accounts.length,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Account updated" : "Account added");
      setOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPreset = useMutation({
    mutationFn: async (name: string) => {
      const preset = ADVANCED_ACCOUNT_PRESETS.find((p) => p.name === name);
      if (!preset) throw new Error("Unknown preset");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("No active session");
      const { error } = await supabase.from("accounts").insert({
        user_id: userId,
        name: preset.name,
        description: preset.description,
        percentage: preset.percentage,
        color: preset.color,
        kind: "allocation",
        sort_order: accounts.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account added");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({

    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account deleted");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(account: Account) {
    setForm({
      id: account.id,
      name: account.name,
      description: account.description ?? "",
      percentage: String(Number(account.percentage)),
      color: account.color,
      kind: account.kind,
    });
    setOpen(true);
  }

  return (
    <AppShell title="Accounts" description="Target accounts and allocation percentages">
      <div className="space-y-6">
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-xl border p-4 text-sm",
            balanced ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10",
          )}
        >
          <div className="flex items-start gap-3">
            {balanced ? (
              <CheckCircle2 className="mt-0.5 size-4 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 text-warning" />
            )}
            <div>
              <p className="font-medium">Total percentage: {sumPct.toFixed(2)}%</p>
              <p className="text-muted-foreground">
                {balanced
                  ? "Great — your allocation is balanced."
                  : "The percentages of all accounts (except the income account) must add up to 100%."}
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            New account
          </Button>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Advanced Profit First accounts</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add specialised sub-accounts recommended for product, project and cash-buffer heavy
            businesses.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ADVANCED_ACCOUNT_PRESETS.map((preset) => {
              const exists = accounts.some((a) => a.name === preset.name);
              return (
                <Button
                  key={preset.name}
                  size="sm"
                  variant="outline"
                  disabled={exists || addPreset.isPending}
                  onClick={() => addPreset.mutate(preset.name)}
                >
                  <Plus className="size-3.5" />
                  {preset.name}
                  {exists ? " (added)" : ""}
                </Button>
              );
            })}
          </div>
        </div>


        {accountsQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: `var(--${account.color})` }}
                    />
                    <p className="text-sm font-medium">{account.name}</p>
                  </div>
                  <span className="tabular text-sm font-semibold">
                    {Number(account.percentage)}%
                  </span>
                </div>
                <p className="mt-2 min-h-10 text-xs text-muted-foreground">
                  {account.description ?? "No description"}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(account)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  {account.kind !== "income" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove.mutate(account.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit account" : "New account"}</DialogTitle>
            <DialogDescription>
              Set the name, allocation percentage and purpose of the account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Drip account"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pct">Allocation percentage (%)</Label>
              <Input
                id="pct"
                inputMode="decimal"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description / purpose</Label>
              <Textarea
                id="desc"
                maxLength={300}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this account is for"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => setForm({ ...form, color })}
                    className={cn(
                      "size-7 rounded-full border-2 transition-transform",
                      form.color === color ? "scale-110 border-foreground" : "border-transparent",
                    )}
                    style={{ background: `var(--${color})` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
