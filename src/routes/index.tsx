import { createFileRoute, Link } from "@tanstack/react-router";
import { PiggyBank, Percent, LineChart, ShieldCheck, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Profit First — Business Budgeting Dashboard" },
      {
        name: "description",
        content:
          "Allocate revenue to profit, tax and expense accounts with the Profit First method. Allocation calculator, account balances and analytics.",
      },
      { property: "og:title", content: "Profit First — Budgeting Dashboard" },
      {
        property: "og:description",
        content:
          "Revenue allocation calculator, Profit First accounts, transaction history and charts.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Percent,
    title: "Accounts and percentages",
    text: "Five default Profit First accounts plus any custom ones — with percentage validation.",
  },
  {
    icon: PiggyBank,
    title: "Allocation calculator",
    text: "Enter incoming revenue and instantly see the amount for each account.",
  },
  {
    icon: LineChart,
    title: "Analytics",
    text: "Balances, allocation history and charts for a month, quarter or year.",
  },
  {
    icon: ShieldCheck,
    title: "Data privacy",
    text: "Every user sees only their own accounts, settings and transactions.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PiggyBank className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Profit First</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center sm:pt-24">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Pay yourself first
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Business budgeting with the Profit First method
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          Split every incoming payment across profit, owner's pay, tax and expense accounts —
          automatically, transparently, in one dashboard.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              Get started free <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-surface">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <f.icon className="size-5 text-muted-foreground" />
              <h2 className="mt-4 text-sm font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
