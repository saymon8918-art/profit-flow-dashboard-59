import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchImportBatches,
  importParsedRows,
  parseSalesWorkbook,
  SALES_COLUMNS,
  type ImportProgress,
  type ParseResult,
} from "@/lib/sales-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import Excel — Profit First" },
      {
        name: "description",
        content:
          "Upload large Excel sales exports (100,000+ rows) with automatic duplicate detection.",
      },
      { property: "og:title", content: "Import Excel — Profit First" },
      {
        property: "og:description",
        content: "Lossless Excel import with duplicate detection for sales transactions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportPage,
});

type Stage =
  | { kind: "idle" }
  | { kind: "parsing"; file: File }
  | { kind: "ready"; file: File; parsed: ParseResult }
  | { kind: "importing"; file: File; parsed: ParseResult; progress: ImportProgress }
  | { kind: "done"; file: File; inserted: number; duplicates: number; skipped: number };

function ImportPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  const batchesQuery = useQuery({ queryKey: ["import-batches"], queryFn: fetchImportBatches });
  const batches = batchesQuery.data ?? [];

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      toast.error("Please choose an Excel (.xlsx / .xls) or CSV file");
      return;
    }
    setStage({ kind: "parsing", file });
    try {
      const parsed = await parseSalesWorkbook(file);
      setStage({ kind: "ready", file, parsed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file");
      setStage({ kind: "idle" });
    }
  }

  async function startImport() {
    if (stage.kind !== "ready") return;
    const { file, parsed } = stage;
    setStage({
      kind: "importing",
      file,
      parsed,
      progress: { processed: 0, total: parsed.rows.length, inserted: 0 },
    });
    try {
      const result = await importParsedRows(file, parsed, (progress) =>
        setStage((s) => (s.kind === "importing" ? { ...s, progress } : s)),
      );
      setStage({ kind: "done", file, ...result });
      toast.success(`Imported ${result.inserted.toLocaleString("en-US")} new records`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setStage({ kind: "ready", file, parsed });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    }
  }

  const removeBatch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("import_batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Import and its records removed");
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = stage.kind === "parsing" || stage.kind === "importing";

  return (
    <AppShell title="Import Excel" description="Upload sales exports — duplicates are detected automatically">
      <div className="space-y-6">
        <div
          className={cn(
            "rounded-2xl border-2 border-dashed bg-card p-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) void handleFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <FileSpreadsheet className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Drop an Excel file here or choose one</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Expected columns: transaction_date, transaction_time, transaction_qty, store_id,
            store_location, product_id, unit_price, product_category, product_type,
            product_detail. Extra columns are kept too.
          </p>
          <Button className="mt-4" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="size-4" />
            Choose file
          </Button>
        </div>

        {stage.kind === "parsing" ? (
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-5 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Reading {stage.file.name}… large files can take a few seconds.
          </div>
        ) : null}

        {stage.kind === "ready" || stage.kind === "importing" ? (
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{stage.file.name}</p>
                <p className="text-xs text-muted-foreground">Sheet: {stage.parsed.sheetName}</p>
              </div>
              {stage.kind === "ready" ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStage({ kind: "idle" })}>
                    Cancel
                  </Button>
                  <Button onClick={startImport} disabled={stage.parsed.rows.length === 0}>
                    <Upload className="size-4" />
                    Import {stage.parsed.rows.length.toLocaleString("en-US")} rows
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Stat label="Rows in file" value={stage.parsed.totalRows} />
              <Stat label="Unique rows to import" value={stage.parsed.rows.length} />
              <Stat label="Duplicates inside file" value={stage.parsed.duplicatesInFile} tone="warning" />
              <Stat label="Unreadable rows" value={stage.parsed.invalidRows.length} tone="destructive" />
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Column mapping</p>
              <div className="flex flex-wrap gap-2">
                {stage.parsed.headers.map((header) => {
                  const target = stage.parsed.mapping[header];
                  const column = SALES_COLUMNS.find((c) => c.key === target);
                  return (
                    <span
                      key={header}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs",
                        column ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {header} → {column ? column.label : "extra"}
                    </span>
                  );
                })}
              </div>
            </div>

            {stage.parsed.invalidRows.length > 0 ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <p className="font-medium text-destructive">
                  {stage.parsed.invalidRows.length} row(s) could not be read and will be skipped:
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {stage.parsed.invalidRows.slice(0, 5).map((r) => (
                    <li key={r.line}>
                      Line {r.line}: {r.reason}
                    </li>
                  ))}
                  {stage.parsed.invalidRows.length > 5 ? <li>…</li> : null}
                </ul>
              </div>
            ) : null}

            {stage.kind === "importing" ? (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving to the database… keep this page open
                  </span>
                  <span className="tabular">
                    {stage.progress.processed.toLocaleString("en-US")} /{" "}
                    {stage.progress.total.toLocaleString("en-US")}
                  </span>
                </div>
                <Progress
                  value={stage.progress.total ? (stage.progress.processed / stage.progress.total) * 100 : 0}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  New records so far: {stage.progress.inserted.toLocaleString("en-US")} · already in
                  database: {(stage.progress.processed - stage.progress.inserted).toLocaleString("en-US")}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {stage.kind === "done" ? (
          <div className="rounded-2xl border border-success/40 bg-success/5 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" />
              Import finished — {stage.file.name}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="New records saved" value={stage.inserted} tone="success" />
              <Stat label="Duplicates skipped" value={stage.duplicates} tone="warning" />
              <Stat label="Unreadable rows skipped" value={stage.skipped} tone="destructive" />
            </div>
            <div className="mt-4 flex gap-2">
              <Button asChild>
                <Link to="/sales">View records</Link>
              </Button>
              <Button variant="outline" onClick={() => setStage({ kind: "idle" })}>
                Import another file
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm font-medium">Import history</p>
          {batchesQuery.isLoading ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : batches.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
              No imports yet.
            </div>
          ) : (
            batches.map((batch) => (
              <div key={batch.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
                <div className="min-w-48">
                  <p className="text-sm font-medium">{batch.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(batch.created_at).toLocaleString("en-US")}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-md px-2 py-1 text-xs capitalize",
                    batch.status === "completed"
                      ? "bg-success/15 text-success"
                      : batch.status === "failed"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning",
                  )}
                >
                  {batch.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {batch.inserted_rows.toLocaleString("en-US")} saved ·{" "}
                  {batch.duplicate_rows.toLocaleString("en-US")} duplicates ·{" "}
                  {batch.skipped_rows.toLocaleString("en-US")} skipped · {batch.total_rows.toLocaleString("en-US")} in file
                </span>
                {batch.error_message ? (
                  <span className="text-xs text-destructive">{batch.error_message}</span>
                ) : null}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/sales" search={{ batch: batch.id }}>
                      View rows
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this import and all records that came with it?")) {
                        removeBatch.mutate(batch.id);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "destructive";
}) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-xl font-semibold",
          tone === "success" && value > 0 && "text-success",
          tone === "warning" && value > 0 && "text-warning",
          tone === "destructive" && value > 0 && "text-destructive",
        )}
      >
        {value.toLocaleString("en-US")}
      </p>
    </div>
  );
}
