"use client";

import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { Card, Empty } from "@/components/ui/primitives";

/** Video extraction is for content managers and superadmins (the API refuses analysts too). */
export function RoleGate({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can("content_manager")) {
    return (
      <Card>
        <Empty icon={<ShieldAlert className="size-8" />} title="Content managers only">
          Ask a superadmin if you need to check sites for videos.
        </Empty>
      </Card>
    );
  }
  return <>{children}</>;
}
