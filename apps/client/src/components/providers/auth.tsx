"use client";

import type { SessionPayload, User } from "@netfly/api-client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthValue {
  status: Status;
  user: User | null;
  signIn: (session: SessionPayload) => void;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<User | null>(api.session.currentUser);
  const [status, setStatus] = useState<Status>(api.session.token ? "authenticated" : "loading");

  useEffect(() => {
    const unsubscribe = api.session.subscribe((next) => {
      setUserState(next);
      setStatus(next ? "authenticated" : "anonymous");
    });
    if (!api.session.token) {
      void api.session.refresh().then((ok) => {
        if (!ok) setStatus("anonymous");
      });
    }
    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = useCallback((session: SessionPayload) => api.session.setSession(session), []);
  const setUser = useCallback((next: User) => api.session.updateUser(next), []);
  const signOut = useCallback(async () => {
    await api.POST("/api/v1/auth/logout", {
      body: { app: "client" },
      headers: api.session.csrfHeader(),
    });
    api.session.clear();
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ status, user, signIn, signOut, setUser }),
    [status, user, signIn, signOut, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
