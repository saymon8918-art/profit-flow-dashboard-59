import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PiggyBank, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Вход в Profit First — бюджетирование бизнеса" },
      {
        name: "description",
        content:
          "Войдите или создайте аккаунт, чтобы распределять выручку по методике Profit First и контролировать прибыль.",
      },
      { property: "og:title", content: "Вход в Profit First" },
      {
        property: "og:description",
        content: "Доступ к дашборду распределения выручки по методике Profit First.",
      },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Введите корректный e-mail").max(255),
  password: z.string().min(6, "Пароль должен быть не короче 6 символов").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(mode: "signin" | "signup") {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    setLoading(true);
    try {
      const { error } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword(parsed.data)
          : await supabase.auth.signUp({
              ...parsed.data,
              options: { emailRedirectTo: window.location.origin },
            });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(mode === "signin" ? "С возвращением!" : "Аккаунт создан");
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <PiggyBank className="size-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">Profit First</span>
        </Link>

        <div className="rounded-2xl border bg-card p-6 shadow-elevate">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <TabsContent value="signin" className="mt-6">
              <Button className="w-full" disabled={loading} onClick={() => submit("signin")}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Войти
              </Button>
            </TabsContent>
            <TabsContent value="signup" className="mt-6">
              <Button className="w-full" disabled={loading} onClick={() => submit("signup")}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Создать аккаунт
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Регистрация мгновенная — подтверждение почты не требуется.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
