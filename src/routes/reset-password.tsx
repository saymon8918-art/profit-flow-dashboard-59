import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Profit First" },
      {
        name: "description",
        content: "Choose a new password for your Profit First budgeting account.",
      },
      { property: "og:title", content: "Set a new password — Profit First" },
      {
        property: "og:description",
        content: "Choose a new password for your Profit First budgeting account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated");
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <PiggyBank className="size-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">Profit First</span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-elevate">
          <h1 className="text-lg font-semibold tracking-tight">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open this page from the reset link in your email.
          </p>
          <div className="mt-6 space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button className="mt-6 w-full" disabled={loading} onClick={submit}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Update password
          </Button>
        </div>
      </div>
    </div>
  );
}
