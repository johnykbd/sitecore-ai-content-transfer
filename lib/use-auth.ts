"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "./auth-context";

export type { AuthUser } from "./auth-context";

export function useAuth() {
  return useAuthContext();
}

/** Redirects to /login when the visitor is not signed in. */
export function useRequireAuth() {
  const { user, loading, refresh } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  return { user, loading, refresh };
}
