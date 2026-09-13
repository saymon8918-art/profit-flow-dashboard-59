import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Bot, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askSalesAssistant, type AssistantMessage } from "@/lib/assistant.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Profit First" },
      {
        name: "description",
        content: "Ask questions about your sales data and get answers computed from your full database.",
      },
    ],
  }),
  component: AssistantPage,
});

const STORAGE_KEY = "sales-assistant-conversation";

const SUGGESTIONS = [
  "How did sales change over time?",
  "Which weekdays are the busiest?",
  "At what time of day is demand highest, and is it the same in every location?",
  "Which products sell most often and which bring the most revenue?",
  "Which products sell the least?",
];

function loadMessages(): AssistantMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AssistantMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function AssistantPage() {
  const ask = useServerFn(askSalesAssistant);
  const [messages, setMessages] = useState<AssistantMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* storage full or unavailable */
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    const next: AssistantMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const result = await ask({ data: { messages: next } });
      setMessages([...next, { role: "assistant", content: result.text }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      toast.error(message);
      setMessages(next);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell
      title="AI Assistant"
      description="Ask anything about your sales data — answers are computed over your whole database."
    >
      <div className="mx-auto flex h-[calc(100vh-11rem)] w-full max-w-3xl flex-col gap-4">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bot className="size-4 text-primary" />
                  Ask about your sales data
                </div>
                <p className="text-sm text-muted-foreground">
                  Questions are answered with aggregated figures calculated directly in the database, so
                  the full dataset is used — not just the first rows.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {messages.map((message, idx) => (
            <div
              key={idx}
              className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}
            >
              {message.role === "assistant" ? (
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </span>
              ) : null}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {message.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
              {message.role === "user" ? (
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="size-4" />
                </span>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="size-4" />
              </span>
              Analyzing your data…
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            placeholder="e.g. Which product brought the most revenue last month?"
            className="min-h-[52px] resize-none"
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearChat}
            disabled={loading || messages.length === 0}
            aria-label="Clear conversation"
          >
            <Trash2 className="size-4" />
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
