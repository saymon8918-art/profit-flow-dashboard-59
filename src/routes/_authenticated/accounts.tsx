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
      { title: "Счета Profit First — настройка процентов" },
      {
        name: "description",
        content:
          "Создавайте, редактируйте и удаляйте счета Profit First и задавайте проценты распределения выручки.",
      },
      { property: "og:title", content: "Счета Profit First" },
      {
        property: "og:description",
        content: "Настройка целевых счетов и процентов распределения выручки.",
      },
    ],
  }),
  component: AccountsPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Введите название").max(80),
  description: z.string().trim().max(300).optional(),
  percentage: z.number().min(0, "Процент не может быть отрицательным").max(100, "Максимум 100%"),
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
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте данные");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Нет сессии");

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
      toast.success(form.id ? "Счёт обновлён" : "Счёт добавлен");
      setOpen(false);
      setForm(emptyForm);
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
      toast.success("Счёт удалён");
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
    <AppShell title="Счета" description="Целевые счета и проценты распределения">
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
              <p className="font-medium">Сумма процентов: {sumPct.toFixed(2)}%</p>
              <p className="text-muted-foreground">
                {balanced
                  ? "Отлично — распределение сбалансировано."
                  : "Сумма процентов по всем счетам (кроме счёта выручки) должна быть равна 100%."}
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
            Новый счёт
          </Button>
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
                  {account.description ?? "Без описания"}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(account)}>
                    <Pencil className="size-3.5" />
                    Изменить
                  </Button>
                  {account.kind !== "income" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove.mutate(account.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Удалить
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
            <DialogTitle>{form.id ? "Редактировать счёт" : "Новый счёт"}</DialogTitle>
            <DialogDescription>
              Задайте название, процент распределения и назначение счёта.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Например: Дрип-счёт"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pct">Процент распределения (%)</Label>
              <Input
                id="pct"
                inputMode="decimal"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Описание / цель</Label>
              <Textarea
                id="desc"
                maxLength={300}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Для чего нужен этот счёт"
              />
            </div>
            <div className="space-y-2">
              <Label>Цвет</Label>
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
              Отмена
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
