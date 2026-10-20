"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { useAction, useConfirm } from "@/components/ui/actions";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";

type Role = "superadmin" | "content_manager" | "analyst";
const ROLES: Array<{ value: Role; label: string; description: string }> = [
  {
    value: "superadmin",
    label: "Super admin",
    description: "Everything, including settings, staff and the audit log.",
  },
  {
    value: "content_manager",
    label: "Content manager",
    description: "Catalog, media, home layout and viewer accounts.",
  },
  { value: "analyst", label: "Analyst", description: "Read-only dashboards, catalog and users." },
];

export default function StaffPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/staff")),
  });
  const [form, setForm] = useState({
    username: "",
    full_name: "",
    role: "content_manager" as Role,
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["staff"] });

  const confirm = useConfirm();
  const [changing, setChanging] = useState<number | null>(null);
  const add = useAction(
    async () => {
      setErrors({});
      try {
        await unwrap(api.POST("/api/v1/admin/staff", { body: form }));
      } catch (e) {
        if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
        throw e;
      }
      const message = `@${form.username} now has ${form.role.replace("_", " ")} access`;
      setForm({ username: "", full_name: "", role: "content_manager", password: "" });
      refresh();
      return message;
    },
    { success: (m) => m },
  );
  const changeRole = useAction(
    async (id: number, role: Role) => {
      setChanging(id);
      try {
        await unwrap(
          api.PATCH("/api/v1/admin/staff/{id}", { params: { path: { id } }, body: { role } }),
        );
        refresh();
      } finally {
        setChanging(null);
      }
    },
    { success: "Role updated" },
  );
  const revoke = (id: number, name: string) =>
    confirm({
      title: `Remove staff access for @${name}?`,
      body: "Their viewer account stays; they are signed out of the studio.",
      confirmLabel: "Remove access",
      destructive: true,
      success: `@${name} is no longer staff`,
      action: async () => {
        await unwrap(api.DELETE("/api/v1/admin/staff/{id}", { params: { path: { id } } }));
        refresh();
      },
    });

  return (
    <>
      <PageHeader
        title="Staff & roles"
        description="Who can use the studio, and what they can do."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          {staff.isPending ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <ul className="divide-line divide-y">
              {staff.data?.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="bg-accent/15 text-accent grid size-8 place-items-center rounded-full text-[12px] font-semibold">
                    {s.full_name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {s.full_name}{" "}
                      {s.id === me?.id && <span className="text-muted text-[12px]">(you)</span>}
                    </p>
                    <p className="text-muted text-[12px]">
                      @{s.username}
                      {s.last_seen ? ` · active ${new Date(s.last_seen).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Select
                    value={s.role}
                    disabled={changing !== null || s.id === me?.id}
                    onChange={(e) => void changeRole.run(s.id, e.target.value as Role)}
                    aria-label={`Role for ${s.username}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={s.id === me?.id}
                    aria-label={`Remove ${s.username}`}
                    onClick={() => revoke(s.id, s.username)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 font-medium">
              <ShieldCheck className="text-accent size-4" /> Add staff
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void add.run();
              }}
            >
              <div>
                <Label htmlFor="st-u" hint="Existing accounts are promoted">
                  Username
                </Label>
                <Input
                  id="st-u"
                  value={form.username}
                  invalid={!!errors.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.trim() })}
                />
                {errors.username && (
                  <p className="mt-1 text-[12px] text-red-500">{errors.username}</p>
                )}
              </div>
              <div>
                <Label htmlFor="st-n">Full name</Label>
                <Input
                  id="st-n"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="st-p" hint="Only for new accounts">
                  Password
                </Label>
                <Input
                  id="st-p"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  invalid={!!errors.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                {errors.password && (
                  <p className="mt-1 text-[12px] text-red-500">{errors.password}</p>
                )}
              </div>
              <div>
                <Label htmlFor="st-r">Role</Label>
                <Select
                  id="st-r"
                  className="w-full"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="submit"
                variant="primary"
                loading={add.pending}
                disabled={!form.username}
              >
                Grant access
              </Button>
            </form>
          </Card>
          <Card className="space-y-2 p-4 text-[12.5px]">
            {ROLES.map((r) => (
              <p key={r.value}>
                <span className="font-medium">{r.label}:</span>{" "}
                <span className="text-muted">{r.description}</span>
              </p>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
