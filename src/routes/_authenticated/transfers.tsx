import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRightLeft, CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  allocationAccounts,
  currentUserId,
  fetchAccounts,
  fetchTransfers,
  formatMoney,
} from "@/lib/profit-first";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({
    meta: [
      { title: "Transfers & Payouts — Profit First" },
      {
        name: "description",
        content:
          "Record real bank transfers between your Profit First sub-accounts on the 10th and 25th rhythm.",
      },
      { property: "og:title", content: "Transfers & Payouts — Profit First" },
      {
        property: "og:description",
        content: "Log payouts and transfers between Profit First sub-accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransfersPage,
});

function nextRhythmDate() {
  const now = new Date();
  const day = now.getDate();
  const next = new Date(now);
  if (day < 10) next.setDate(10);
  else if (day < 25) next.setDate(25);
  else {
    next.setMonth(next.getMonth() + 1);
    next.setDate(10);
  }
  return next;
}

function TransfersPage() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("completed");
  const [note, setNote] = useState("");

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const transfersQuery = useQuery({ queryKey: ["transfers"], queryFn: fetchTransfers });

  const accounts = useMemo(
    () => allocationAccounts(accountsQuery.data ?? []),
    [accountsQuery.data],
  );
  const transfers = transfersQuery.data ?? [];
  const totalTransferred = transfers
    .filter((t) => t.status === "completed")
    .reduce((s, t) => s + t.amount, 0);

  const create = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!accountId) throw new Error("Select an account");
      if (!value || value <= 0) throw new Error("Enter an amount greater than zero");
      const account = accounts.find((a) => a.id === accountId);
      const userId = await currentUserId();
      const { error } = await supabase.from("transfers").insert({
        user_id: userId,
        account_id: accountId,
        account_name: account?.name ?? "Account",
        amount: value,
        status,
        direction: "out",
        note: note.trim() || null,
        transferred_at: new Date(date).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer recorded");
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transfers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer deleted");
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Transfers & Payouts" description="Move money between your sub-accounts">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">Total transferred</p>
            <p className="tabular mt-2 text-2xl font-semibold">{formatMoney(totalTransferred)}</p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">Transfers recorded</p>
            <p className="tabular mt-2 text-2xl font-semibold">{transfers.length}</p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Next transfer day (10th / 25th)
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {nextRhythmDate().toLocaleDateString("en-US", { day: "2-digit", month: "short" })}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium">
            <ArrowRightLeft className="size-4" />
            Record a transfer
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <DatePicker id="date" value={date} onChange={setDate} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Owner payout"
              />
            </div>
          </div>
          <Button className="mt-4" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add transfer
          </Button>
        </div>

        {transfersQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No transfers recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(t.transferred_at).toLocaleDateString("en-US")}
                    </TableCell>
                    <TableCell>{t.account_name}</TableCell>
                    <TableCell className="tabular font-semibold">{formatMoney(t.amount)}</TableCell>
                    <TableCell className="capitalize">{t.status}</TableCell>
                    <TableCell className="text-muted-foreground">{t.note ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove.mutate(t.id)}
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
