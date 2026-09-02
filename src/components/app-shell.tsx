import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Wallet,
  History,
  LogOut,
  PiggyBank,
  Menu,
  BarChart3,
  ArrowRightLeft,
  FileText,
  Target,
  Plug,
  Users,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Money management",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/analytics", label: "Analytics & Reports", icon: BarChart3 },
      { to: "/transfers", label: "Transfers & Payouts", icon: ArrowRightLeft },
      { to: "/invoices", label: "Invoices & Inflow", icon: FileText },
      { to: "/cashflow", label: "Cashflow Calendar", icon: CalendarDays },
      { to: "/history", label: "History", icon: History },
    ],
  },
  {
    label: "Setup & automation",
    items: [
      { to: "/accounts", label: "Accounts", icon: Wallet },
      { to: "/targets", label: "Target percentages", icon: Target },
      { to: "/integrations", label: "Integrations", icon: Plug },
      { to: "/team", label: "Users & Access", icon: Users },
    ],
  },
] as const;


export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
            {group.label}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );


  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col overflow-y-auto border-r bg-sidebar p-4 lg:flex">
        <Link to="/dashboard" className="mb-8 flex items-center gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PiggyBank className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Profit First</span>
        </Link>
        {nav}
        <div className="mt-auto">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
              {description ? (
                <p className="truncate text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
          <div className={cn("border-t px-4 py-3 lg:hidden", open ? "block" : "hidden")}>
            {nav}
            <Button variant="ghost" className="mt-1 w-full justify-start gap-3" onClick={signOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
