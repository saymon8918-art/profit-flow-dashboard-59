import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, jsonSchema } from "ai";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AssistantMessage = { role: "user" | "assistant"; content: string };

type AskInput = { messages: AssistantMessage[] };

function validateInput(input: unknown): AskInput {
  const data = input as AskInput;
  if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
    throw new Error("messages are required");
  }
  const messages = data.messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (messages.length === 0) throw new Error("messages are required");
  return { messages };
}

const DIMENSIONS = [
  "date",
  "month",
  "weekday",
  "hour",
  "store_id",
  "store_location",
  "product_category",
  "product_type",
  "product_detail",
  "product_id",
] as const;

const aggSchema = jsonSchema<{
  dimensions: string[];
  start_date: string | null;
  end_date: string | null;
  category: string | null;
  location: string | null;
  product: string | null;
  order_by: "revenue" | "units" | "transactions" | "dimension";
  limit: number;
}>({
  type: "object",
  additionalProperties: false,
  required: [
    "dimensions",
    "start_date",
    "end_date",
    "category",
    "location",
    "product",
    "order_by",
    "limit",
  ],
  properties: {
    dimensions: {
      type: "array",
      items: { type: "string", enum: [...DIMENSIONS] },
      description:
        "Group-by fields. Empty array returns one overall total row. Combine at most two dimensions.",
    },
    start_date: { type: ["string", "null"], description: "Inclusive start date YYYY-MM-DD" },
    end_date: { type: ["string", "null"], description: "Inclusive end date YYYY-MM-DD" },
    category: { type: ["string", "null"], description: "Filter on product category (ILIKE, % allowed)" },
    location: { type: ["string", "null"], description: "Filter on store location (ILIKE, % allowed)" },
    product: {
      type: ["string", "null"],
      description: "Filter on product detail or type (ILIKE, % allowed)",
    },
    order_by: { type: "string", enum: ["revenue", "units", "transactions", "dimension"] },
    limit: { type: "number", description: "Max rows to return, 1-500" },
  },
});

const SYSTEM_PROMPT = `You are the data analyst assistant of a Profit First business dashboard.
You answer questions about the user's imported sales data (table sales_transactions with columns:
transaction_id, transaction_date, transaction_time, transaction_qty, store_id, store_location,
product_id, unit_price, product_category, product_type, product_detail).

Rules:
- Never guess numbers. Always call the sales_aggregate tool to get figures; it aggregates the
  WHOLE dataset in the database (millions of rows are fine) and returns only grouped summary rows,
  so you are never limited to 1000 raw rows. Never request raw rows.
- Revenue = transaction_qty * unit_price, aggregated in the database.
- Call the tool several times when a question needs several breakdowns (e.g. hour x location).
- Keep dimension combinations small and always set a sensible limit.
- Answer in the language of the user's question.
- Be concise: short markdown, bullet lists or small tables, with concrete numbers and a short insight.
- If the tool returns an empty array, say there is no data matching the question.`;

export const askSalesAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const supabase = context.supabase;

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });

    const salesAggregate = tool({
      description:
        "Aggregate the user's sales transactions in the database and return grouped totals (revenue, units, transactions).",
      inputSchema: aggSchema,
      execute: async (args) => {
        const params = {
          p_dims: Array.isArray(args.dimensions) ? args.dimensions.slice(0, 3) : [],
          p_start: args.start_date,
          p_end: args.end_date,
          p_category: args.category,
          p_location: args.location,
          p_product: args.product,
          p_order: args.order_by ?? "revenue",
          p_limit: Math.min(Math.max(Number(args.limit) || 50, 1), 500),
        };
        const { data: rows, error } = await (
          supabase.rpc as unknown as (
            fn: string,
            p: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: { message: string } | null }>
        )("sales_agg", params);
        if (error) return { error: error.message };
        return { rows };
      },
    });

    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: SYSTEM_PROMPT,
        messages: data.messages,
        tools: { sales_aggregate: salesAggregate },
        stopWhen: stepCountIs(20),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });

      const text = await result.text;
      return { text: text?.trim() || "I could not produce an answer for that question." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("402")) {
        throw new Error("AI credits are exhausted. Add credits in Lovable to keep using the assistant.");
      }
      if (message.includes("429")) {
        throw new Error("Too many requests right now. Please try again in a moment.");
      }
      throw new Error(`Assistant failed: ${message}`);
    }
  });
