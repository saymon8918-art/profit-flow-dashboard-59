import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Database, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  computeRowHash,
  EMPTY_SALES_FIELDS,
  fetchSalesPage,
  formatDuplicateError,
  normalizeDate,
  normalizeNumber,
  normalizeText,
  normalizeTime,
  PAGE_SIZE,
  SALES_COLUMNS,
  type SalesFields,
  type SalesTransaction,
} from "@/lib/sales-data";

export const Route = createFileRoute("/_authenticated/sales")({
  validateSearch: (search: Record<string, unknown>): { batch?: string } =>
    typeof search["batch"] === "string" ? { batch: search["batch"] } : {},
  head: () => ({
    meta: [
      { title: "Sales Records — Profit First" },
      {
        name: "description",
        content: "Browse, search, edit and delete every imported sales transaction.",
      },
      { property: "og:title", content: "Sales Records — Profit First" },
      {
        property: "og:description",
        content: "All imported sales data with full add, edit and delete controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesPage,
});

type FormState = Record<keyof Omit<SalesFields, "extra">, string> & { extra: string };

function toForm(row?: SalesTransaction | null): FormState {
  const src = row ?? EMPTY_SALES_FIELDS;
  const form = {} as FormState;
  SALES_COLUMNS.forEach((c) => {
    const v = src[c.key];
    form[c.key] = v === null || v === undefined ? "" : String(v);
  });
  form.extra = Object.keys(src.extra ?? {}).length ? JSON.stringify(src.extra, null, 2) : "";
  return form;
}

function fromForm(form: FormState): SalesFields {
  const fields: SalesFields = { ...EMPTY_SALES_FIELDS, extra: {} };
  for (const c of SALES_COLUMNS) {
    const raw = form[c.key];
    if (c.type === "date") {
      const v = normalizeDate(raw);
      if (v === undefined) throw new Error(`Invalid date "${raw}"`);
      fields.transaction_date = v;
    } else if (c.type === "time") {
      const v = normalizeTime(raw);
      if (v === undefined) throw new Error(`Invalid time "${raw}"`);
      fields.transaction_time = v;
    } else if (c.type === "number") {
      const v = normalizeNumber(raw);
      if (v === undefined) throw new Error(`Invalid number in ${c.label}`);
      if (c.key === "transaction_qty") fields.transaction_qty = v;
      else fields.unit_price = v;
    } else {
      (fields as Record<string, unknown>)[c.key] = normalizeText(raw);
    }
  }
  if (form.extra.trim()) {
    try {
      const parsed = JSON.parse(form.extra) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      fields.extra = parsed as SalesFields["extra"];
    } catch {
      throw new Error("Extra fields must be a valid JSON object");
    }
  }
  if (SALES_COLUMNS.every((c) => fields[c.key] === null) && !Object.keys(fields.extra).length) {
    throw new Error("Fill in at least one field");
  }
  return fields;
}

function SalesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { batch } = Route.useSearch();
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SalesTransaction | null | "new">(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const salesQuery = useQuery({
    queryKey: ["sales", page, search, batch ?? null],
    queryFn: () => fetchSalesPage({ page, search, batchId: batch ?? null }),
    placeholderData: keepPreviousData,
  });
  const rows = salesQuery.data?.rows ?? [];
  const total = salesQuery.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Sales Records" description="Every imported transaction — search, edit, add or delete">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search product, category, store, transaction ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          {batch ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPage(0);
                navigate({ to: "/sales", search: {} });
              }}
            >
              <X className="size-3.5" />
              Showing one import — clear filter
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/import">
                <Database className="size-4" />
                Import Excel
              </Link>
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              Add record
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {salesQuery.isLoading ? "Loading…" : `${total.toLocaleString("en-US")} records`}
          {salesQuery.isFetching && !salesQuery.isLoading ? " · refreshing…" : ""}
        </p>

        {salesQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            {search || batch ? "Nothing matches this filter." : "No records yet — import an Excel file to get started."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {SALES_COLUMNS.map((c) => (
                    <TableHead key={c.key} className="whitespace-nowrap">
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.id}>
                    {SALES_COLUMNS.map((c) => (
                      <TableCell
                        key={c.key}
                        className={c.type === "number" ? "tabular-nums whitespace-nowrap" : "max-w-56 truncate"}
                      >
                        {c.key === "transaction_id"
                          ? (page * PAGE_SIZE + idx + 1).toLocaleString("en-US")
                          : formatCell(row[c.key], c.type)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(row)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove.mutate(row.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page + 1} of {pageCount.toLocaleString("en-US")}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <RecordDialog
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        record={editing}
        onClose={() => setEditing(null)}
      />
    </AppShell>
  );
}

function formatCell(value: string | number | null, type: "text" | "date" | "time" | "number") {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (type === "number") return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (type === "time") return String(value).slice(0, 8);
  return String(value);
}

function RecordDialog({
  record,
  onClose,
}: {
  record: SalesTransaction | null | "new";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const open = record !== null;
  const [form, setForm] = useState<FormState>(() => toForm(record === "new" ? null : record));

  const save = useMutation({
    mutationFn: async () => {
      const fields = fromForm(form);
      const row_hash = computeRowHash(fields);
      if (record === "new" || record === null) {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) throw new Error("No active session");
        const { error } = await supabase
          .from("sales_transactions")
          .insert({ ...fields, row_hash, user_id: userId });
        if (error) throw new Error(formatDuplicateError(error.message));
      } else {
        const { error } = await supabase
          .from("sales_transactions")
          .update({ ...fields, row_hash })
          .eq("id", record.id);
        if (error) throw new Error(formatDuplicateError(error.message));
      }
    },
    onSuccess: () => {
      toast.success(record === "new" ? "Record added" : "Record updated");
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record === "new" ? "Add record" : "Edit record"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {SALES_COLUMNS.map((c) => (
            <div key={c.key} className="space-y-2">
              <Label htmlFor={`f-${c.key}`}>{c.label}</Label>
              <Input
                id={`f-${c.key}`}
                type={c.type === "date" ? "date" : c.type === "time" ? "time" : "text"}
                step={c.type === "time" ? 1 : undefined}
                inputMode={c.type === "number" ? "decimal" : undefined}
                value={form[c.key]}
                onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="f-extra">Extra columns (JSON, optional)</Label>
            <Textarea
              id="f-extra"
              rows={3}
              className="font-mono text-xs"
              value={form.extra}
              onChange={(e) => setForm((f) => ({ ...f, extra: e.target.value }))}
              placeholder='{"note": "…"}'
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
