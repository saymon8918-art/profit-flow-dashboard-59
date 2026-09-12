import * as XLSX from "xlsx";
import { sha256 } from "js-sha256";

import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type SalesFields = {
  transaction_id: string | null;
  transaction_date: string | null; // YYYY-MM-DD
  transaction_time: string | null; // HH:MM:SS
  transaction_qty: number | null;
  store_id: string | null;
  store_location: string | null;
  product_id: string | null;
  unit_price: number | null;
  product_category: string | null;
  product_type: string | null;
  product_detail: string | null;
  extra: Record<string, string | number | boolean | null>;
};

export type SalesTransaction = SalesFields & {
  id: string;
  import_batch_id: string | null;
  row_hash: string;
  created_at: string;
  updated_at: string;
};

export type ImportBatch = {
  id: string;
  file_name: string;
  sheet_name: string | null;
  total_rows: number;
  inserted_rows: number;
  duplicate_rows: number;
  skipped_rows: number;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type SalesColumnKey = Exclude<keyof SalesFields, "extra">;

export const SALES_COLUMNS: {
  key: SalesColumnKey;
  label: string;
  type: "text" | "date" | "time" | "number";
  aliases: string[];
}[] = [
  { key: "transaction_id", label: "Transaction ID", type: "text", aliases: ["transactionid", "id", "txid", "transactionno"] },
  { key: "transaction_date", label: "Date", type: "date", aliases: ["transactiondate", "date", "saledate"] },
  { key: "transaction_time", label: "Time", type: "time", aliases: ["transactiontime", "time", "saletime"] },
  {
    key: "transaction_qty",
    label: "Qty",
    type: "number",
    aliases: ["transactionqty", "transaction", "qty", "quantity", "transactionquantity"],
  },
  { key: "store_id", label: "Store ID", type: "text", aliases: ["storeid", "store"] },
  { key: "store_location", label: "Store location", type: "text", aliases: ["storelocation", "location"] },
  { key: "product_id", label: "Product ID", type: "text", aliases: ["productid", "product", "sku"] },
  { key: "unit_price", label: "Unit price", type: "number", aliases: ["unitprice", "price"] },
  { key: "product_category", label: "Category", type: "text", aliases: ["productcategory", "category"] },
  { key: "product_type", label: "Type", type: "text", aliases: ["producttype", "type"] },
  { key: "product_detail", label: "Detail", type: "text", aliases: ["productdetail", "detail", "productname", "name"] },
];

export const EMPTY_SALES_FIELDS: SalesFields = {
  transaction_id: null,
  transaction_date: null,
  transaction_time: null,
  transaction_qty: null,
  store_id: null,
  store_location: null,
  product_id: null,
  unit_price: null,
  product_category: null,
  product_type: null,
  product_detail: null,
  extra: {},
};

/* ------------------------------------------------------------------ */
/* Normalisation helpers                                               */
/* ------------------------------------------------------------------ */

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isValidDate(y: number, m: number, d: number) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function normalizeDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !isValidDate(parsed.y, parsed.m, parsed.d)) return undefined;
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    const [, y, m, d] = match;
    return isValidDate(+y!, +m!, +d!) ? `${y}-${pad(+m!)}-${pad(+d!)}` : undefined;
  }
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
  if (match) {
    let [, a, b, y] = match as [string, string, string, string];
    if (y.length === 2) y = `20${y}`;
    // Default to M/D/Y; fall back to D/M/Y when the first part cannot be a month.
    let m = +a;
    let d = +b;
    if (m > 12 && d <= 12) [m, d] = [d, m];
    if (text.includes(".")) [d, m] = [+a, +b]; // 31.12.2024 style is day-first
    return isValidDate(+y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : undefined;
  }
  const dt = new Date(text);
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
  return undefined;
}

export function normalizeTime(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  if (typeof value === "number") {
    const fraction = value - Math.floor(value);
    const total = Math.round(fraction * 86400) % 86400;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?$/i);
  if (!match) {
    const dt = new Date(text);
    if (!Number.isNaN(dt.getTime()) && /\d:\d/.test(text)) {
      return `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
    }
    return undefined;
  }
  let h = +match[1]!;
  const m = +match[2]!;
  const s = match[3] ? +match[3] : 0;
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  if (h > 23 || m > 59 || s > 59) return undefined;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function normalizeNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = String(value)
    .trim()
    .replace(/[\s$€£₴]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** Deterministic fingerprint of a record — identical content => identical hash. */
export function computeRowHash(fields: SalesFields) {
  const parts = SALES_COLUMNS.map((c) => {
    const v = fields[c.key];
    if (v === null || v === undefined) return "";
    return typeof v === "number" ? String(Number(v.toFixed(6))) : String(v).trim().toLowerCase();
  });
  const extraKeys = Object.keys(fields.extra ?? {}).sort();
  const extra = extraKeys.map((k) => `${k}=${String(fields.extra[k] ?? "")}`).join("\u001e");
  return sha256([...parts, extra].join("\u001f"));
}

/* ------------------------------------------------------------------ */
/* Workbook parsing                                                    */
/* ------------------------------------------------------------------ */

export type ParsedRow = SalesFields & { row_hash: string };

export type ParseResult = {
  sheetName: string;
  headers: string[];
  mapping: Record<string, SalesColumnKey | "extra">;
  totalRows: number;
  rows: ParsedRow[];
  duplicatesInFile: number;
  invalidRows: { line: number; reason: string }[];
};

function detectMapping(headers: string[]) {
  const mapping: Record<string, SalesColumnKey | "extra"> = {};
  const used = new Set<SalesColumnKey>();
  headers.forEach((header) => {
    const norm = normalizeHeader(header);
    if (!norm) return;
    const match = SALES_COLUMNS.find(
      (c) => !used.has(c.key) && (normalizeHeader(c.key) === norm || c.aliases.includes(norm)),
    );
    if (match) {
      used.add(match.key);
      mapping[header] = match.key;
    } else {
      mapping[header] = "extra";
    }
  });
  return mapping;
}

export async function parseSalesWorkbook(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets");
  const sheet = workbook.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  if (matrix.length < 2) throw new Error("The sheet has no data rows");

  const headers = (matrix[0] ?? []).map((h, i) => normalizeText(h) ?? `column_${i + 1}`);
  const mapping = detectMapping(headers);
  const mappedKeys = new Set(Object.values(mapping));
  if (![...mappedKeys].some((k) => k !== "extra")) {
    throw new Error("None of the columns were recognised. Check the header row.");
  }

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  const invalidRows: { line: number; reason: string }[] = [];
  let duplicatesInFile = 0;

  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (raw.every((v) => v === null || v === undefined || v === "")) continue;
    const fields: SalesFields = { ...EMPTY_SALES_FIELDS, extra: {} };
    let problem: string | null = null;

    headers.forEach((header, i) => {
      const target = mapping[header];
      const value = raw[i];
      if (!target) return;
      if (target === "extra") {
        const t = normalizeText(value);
        if (t !== null) fields.extra[header] = typeof value === "number" ? value : t;
        return;
      }
      const column = SALES_COLUMNS.find((c) => c.key === target)!;
      if (column.type === "date") {
        const v = normalizeDate(value);
        if (v === undefined) problem ??= `Unreadable date "${String(value)}"`;
        fields.transaction_date = v ?? null;
      } else if (column.type === "time") {
        const v = normalizeTime(value);
        if (v === undefined) problem ??= `Unreadable time "${String(value)}"`;
        fields.transaction_time = v ?? null;
      } else if (column.type === "number") {
        const v = normalizeNumber(value);
        if (v === undefined) problem ??= `Unreadable number "${String(value)}" in ${column.label}`;
        if (column.key === "transaction_qty") fields.transaction_qty = v ?? null;
        else fields.unit_price = v ?? null;
      } else {
        (fields as Record<string, unknown>)[column.key] = normalizeText(value);
      }
    });

    if (problem) {
      invalidRows.push({ line: r + 1, reason: problem });
      continue;
    }
    const row_hash = computeRowHash(fields);
    if (seen.has(row_hash)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(row_hash);
    rows.push({ ...fields, row_hash });
  }

  return {
    sheetName,
    headers,
    mapping,
    totalRows: matrix.length - 1,
    rows,
    duplicatesInFile,
    invalidRows,
  };
}

/* ------------------------------------------------------------------ */
/* Import into the database                                            */
/* ------------------------------------------------------------------ */

const BATCH_SIZE = 500;
const CONCURRENCY = 3;

export type ImportProgress = { processed: number; total: number; inserted: number };

async function insertChunk(chunk: ParsedRow[], userId: string, batchId: string, attempt = 0): Promise<number> {
  const payload = chunk.map((row) => ({ ...row, user_id: userId, import_batch_id: batchId }));
  const { data, error } = await supabase
    .from("sales_transactions")
    .upsert(payload, { onConflict: "user_id,row_hash", ignoreDuplicates: true })
    .select("id");
  if (error) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      return insertChunk(chunk, userId, batchId, attempt + 1);
    }
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}

export async function importParsedRows(
  file: File,
  parsed: ParseResult,
  onProgress: (p: ImportProgress) => void,
) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("No active session");

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      user_id: userId,
      file_name: file.name,
      sheet_name: parsed.sheetName,
      total_rows: parsed.totalRows,
      skipped_rows: parsed.invalidRows.length,
      status: "processing",
    })
    .select("id")
    .single();
  if (batchError || !batch) throw new Error(batchError?.message ?? "Could not create import");

  const chunks: ParsedRow[][] = [];
  for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
    chunks.push(parsed.rows.slice(i, i + BATCH_SIZE));
  }

  let processed = 0;
  let inserted = 0;
  let next = 0;
  let failure: Error | null = null;

  async function worker() {
    while (next < chunks.length && !failure) {
      const chunk = chunks[next++]!;
      try {
        const added = await insertChunk(chunk, userId!, batch!.id);
        inserted += added;
        processed += chunk.length;
        onProgress({ processed, total: parsed.rows.length, inserted });
      } catch (e) {
        failure = e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const duplicates = parsed.duplicatesInFile + (processed - inserted);
  await supabase
    .from("import_batches")
    .update({
      inserted_rows: inserted,
      duplicate_rows: duplicates,
      status: failure ? "failed" : "completed",
      error_message: failure ? (failure as Error).message : null,
    })
    .eq("id", batch.id);

  if (failure) throw failure;
  return { inserted, duplicates, skipped: parsed.invalidRows.length, batchId: batch.id };
}

/* ------------------------------------------------------------------ */
/* Queries for the records page                                        */
/* ------------------------------------------------------------------ */

export async function fetchImportBatches(): Promise<ImportBatch[]> {
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, file_name, sheet_name, total_rows, inserted_rows, duplicate_rows, skipped_rows, status, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export const PAGE_SIZE = 50;

export async function fetchSalesPage(params: { page: number; search: string; batchId: string | null }) {
  let query = supabase
    .from("sales_transactions")
    .select("*", { count: "exact" })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .order("transaction_time", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(params.page * PAGE_SIZE, params.page * PAGE_SIZE + PAGE_SIZE - 1);

  if (params.batchId) query = query.eq("import_batch_id", params.batchId);

  const term = params.search.replace(/["\\]/g, "").trim();
  if (term) {
    const pattern = `"*${term}*"`;
    query = query.or(
      [
        "transaction_id",
        "store_id",
        "store_location",
        "product_id",
        "product_category",
        "product_type",
        "product_detail",
      ]
        .map((c) => `${c}.ilike.${pattern}`)
        .join(","),
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({
    ...r,
    transaction_qty: r.transaction_qty === null ? null : Number(r.transaction_qty),
    unit_price: r.unit_price === null ? null : Number(r.unit_price),
    extra: (r.extra ?? {}) as SalesFields["extra"],
  })) as SalesTransaction[];
  return { rows, count: count ?? 0 };
}

export function formatDuplicateError(message: string) {
  return message.includes("sales_transactions_user_row_hash_key") || message.includes("duplicate key")
    ? "An identical record already exists — nothing was saved."
    : message;
}
