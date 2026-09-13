import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
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
import { formatDate, useDateFormat, type DateFormat } from "@/lib/date-format";
import {
  currentUserId,
  fetchInvoices,
  formatMoney,
  INVOICE_STATUSES,
} from "@/lib/profit-first";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices & Inflow — Profit First" },
      {
        name: "description",
        content:
          "Issue client invoices and track expected revenue before it reaches your income account.",
      },
      { property: "og:title", content: "Invoices & Inflow — Profit First" },
      {
        property: "og:description",
        content: "Client invoices and expected cash inflow at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoicesPage,
});

const statusTone: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  overdue: "bg-destructive/15 text-destructive",
};

function InvoicesPage() {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState("");
  const [client, setClient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("draft");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState("");
  const [dateFormat, setDateFormat] = useDateFormat();

  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const invoices = invoicesQuery.data ?? [];

  const expected = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + i.amount, 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  const create = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!client.trim()) throw new Error("Enter a client name");
      if (!value || value <= 0) throw new Error("Enter an amount greater than zero");
      const userId = await currentUserId();
      const { error } = await supabase.from("invoices").insert({
        user_id: userId,
        number: number.trim() || `INV-${Date.now().toString().slice(-6)}`,
        client_name: client.trim(),
        amount: value,
        status,
        issued_at: issuedAt,
        due_at: dueAt || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice created");
      setNumber("");
      setClient("");
      setAmount("");
      setDueAt("");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("invoices").update({ status: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice deleted");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Invoices & Inflow" description="Bill clients and track expected revenue">
      <div className="space-y-6">
        <div className="flex items-center justify-end gap-2">
          <Label className="text-xs text-muted-foreground">Date format</Label>
          <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">US — MM/DD/YYYY</SelectItem>
              <SelectItem value="cis">CIS — DD.MM.YYYY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">Expected inflow</p>
            <p className="tabular mt-2 text-2xl font-semibold">{formatMoney(expected)}</p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="tabular mt-2 text-2xl font-semibold text-success">{formatMoney(paid)}</p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="tabular mt-2 text-2xl font-semibold text-destructive">
              {formatMoney(overdue)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4" />
            New invoice
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <Label htmlFor="num">Number</Label>
              <Input
                id="num"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="INV-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-amount">Amount</Label>
              <Input
                id="inv-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="issued">Issued</Label>
              <DatePicker id="issued" value={issuedAt} onChange={setIssuedAt} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Due</Label>
              <DatePicker id="due" value={dueAt} onChange={setDueAt} />
            </div>
          </div>
          <Button className="mt-4" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create invoice
          </Button>
        </div>

        {invoicesQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No invoices yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.number}</TableCell>
                    <TableCell>{invoice.client_name}</TableCell>
                    <TableCell className="tabular font-semibold">
                      {formatMoney(invoice.amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(invoice.issued_at, dateFormat)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(invoice.due_at, dateFormat)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={invoice.status}
                        onValueChange={(value) => updateStatus.mutate({ id: invoice.id, value })}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 w-32 border-0 text-xs capitalize",
                            statusTone[invoice.status],
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVOICE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove.mutate(invoice.id)}
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
