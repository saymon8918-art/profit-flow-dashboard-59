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
      { title: "Sign in to Profit First — Business Budgeting" },
      {
        name: "description",
        content:
          "Sign in or create an account to allocate revenue with Profit First and stay on top of profit.",
      },
      { property: "og:title", content: "Sign in to Profit First" },
      {
        property: "og:description",
        content: "Access the Profit First revenue allocation dashboard.",
      },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function sendReset() {
    const parsedEmail = z.string().trim().email().safeParse(email);
    if (!parsedEmail.success) {
      toast.error("Enter your email first");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password reset link sent — check your email");
    } finally {
      setLoading(false);
    }
  }

  async function submit(mode: "signin" | "signup") {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your input");
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
      toast.success(mode === "signin" ? "Welcome back!" : "Account created");
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
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <TabsContent value="signin" className="mt-6">
              <Button className="w-full" disabled={loading} onClick={() => submit("signin")}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Sign in
              </Button>
              <button
                type="button"
                disabled={loading}
                onClick={sendReset}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot your password?
              </button>
            </TabsContent>
            <TabsContent value="signup" className="mt-6">
              <Button className="w-full" disabled={loading} onClick={() => submit("signup")}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Create account
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Signup is instant — no email confirmation required.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
