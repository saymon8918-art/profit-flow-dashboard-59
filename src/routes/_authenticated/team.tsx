import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, fetchTeamMembers, TEAM_ROLES } from "@/lib/profit-first";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Users & Access Control — Profit First" },
      {
        name: "description",
        content:
          "Invite your accountant or CFO and control who can view your Profit First dashboard.",
      },
      { property: "og:title", content: "Users & Access Control" },
      {
        property: "og:description",
        content: "Manage team access to your Profit First budgeting dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("accountant");

  const teamQuery = useQuery({ queryKey: ["team_members"], queryFn: fetchTeamMembers });
  const members = teamQuery.data ?? [];

  const invite = useMutation({
    mutationFn: async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter a valid email");
      const userId = await currentUserId();
      const { error } = await supabase.from("team_members").insert({
        user_id: userId,
        email: email.trim().toLowerCase(),
        full_name: name.trim() || null,
        role,
        status: "invited",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team member invited");
      setEmail("");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("team_members").update({ role: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team_members"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team member removed");
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Users & Access" description="Invite your accountant, CFO or bookkeeper">
      <div className="space-y-6">
        <div className="rounded-2xl border bg-card p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium">
            <UserPlus className="size-4" />
            Invite a team member
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accountant@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" onClick={() => invite.mutate()} disabled={invite.isPending}>
            {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Send invite
          </Button>
        </div>

        {teamQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            You are the only user right now.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.email}</TableCell>
                    <TableCell>{member.full_name ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={member.role}
                        onValueChange={(value) => updateRole.mutate({ id: member.id, value })}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {member.status}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove.mutate(member.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
