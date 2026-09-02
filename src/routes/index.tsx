import { createFileRoute, Link } from "@tanstack/react-router";
import { PiggyBank, Percent, LineChart, ShieldCheck, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Profit First — дашборд бюджетирования бизнеса" },
      {
        name: "description",
        content:
          "Распределяйте выручку по счетам прибыли, налогов и расходов по методике Profit First. Калькулятор распределения, балансы счетов и аналитика.",
      },
      { property: "og:title", content: "Profit First — дашборд бюджетирования" },
      {
        property: "og:description",
        content:
          "Калькулятор распределения выручки, счета Profit First, история операций и графики.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Percent,
    title: "Счета и проценты",
    text: "5 стандартных счетов Profit First плюс любые кастомные — с валидацией суммы процентов.",
  },
  {
    icon: PiggyBank,
    title: "Калькулятор распределения",
    text: "Введите поступившую выручку и мгновенно получите суммы по каждому счёту.",
  },
  {
    icon: LineChart,
    title: "Аналитика",
    text: "Балансы, история распределений и диаграммы за месяц, квартал или год.",
  },
  {
    icon: ShieldCheck,
    title: "Приватность данных",
    text: "Каждый пользователь видит только свои счета, настройки и транзакции.",
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
          <Link to="/auth">Войти</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center sm:pt-24">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Сначала плати себе
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Бюджетирование бизнеса по методике Profit First
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          Разложите каждую поступившую сумму по счетам прибыли, вознаграждения, налогов и расходов —
          автоматически, прозрачно и в одном дашборде.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              Начать бесплатно <ArrowRight className="size-4" />
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
