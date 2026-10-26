"use client";

import type { SessionPayload, User } from "@netfly/api-client";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Status = "loading" | "authenticated" | "anonymous";
type Role = "superadmin" | "content_manager" | "analyst";

interface AuthValue {
  status: Status;
  user: User | null;
  signIn: (session: SessionPayload) => void;
  signOut: () => Promise<void>;
  /** True when the staff user may perform writes in an area needing one of `roles`. */
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Routes framed inside Studio that authenticate with their own signed token (the extraction
 * preview): they never refresh the session, which would rotate it under the Studio page. */
const STANDALONE = /^\/extraction\/preview\//;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (STANDALONE.test(pathname)) return <>{children}</>;
  return <SessionAuthProvider>{children}</SessionAuthProvider>;
}

function SessionAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(api.session.currentUser);
  const [status, setStatus] = useState<Status>(api.session.token ? "authenticated" : "loading");

  useEffect(() => {
    const unsubscribe = api.session.subscribe((next) => {
      setUser(next);
      setStatus(next ? "authenticated" : "anonymous");
    });
    if (!api.session.token) {
      void api.session.refresh().then((ok) => !ok && setStatus("anonymous"));
    }
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === "anonymous" && pathname !== "/login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  const signIn = useCallback((session: SessionPayload) => api.session.setSession(session), []);
  const signOut = useCallback(async () => {
    await api.POST("/api/v1/auth/logout", {
      body: { app: "admin" },
      headers: api.session.csrfHeader(),
    });
    api.session.clear();
    router.replace("/login");
  }, [router]);
  const can = useCallback(
    (...roles: Role[]) =>
      !!user && (user.role === "superadmin" || roles.includes(user.role as Role)),
    [user],
  );

  const value = useMemo(
    () => ({ status, user, signIn, signOut, can }),
    [status, user, signIn, signOut, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
