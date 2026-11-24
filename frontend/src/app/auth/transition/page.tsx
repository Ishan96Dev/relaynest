"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { AuthTransition, type AuthTransitionMode } from "@/components/auth/auth-transition";
import { safeRedirectPath } from "@/lib/safe-redirect";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();

  const rawMode = sp.get("mode");
  const mode: AuthTransitionMode =
    rawMode === "signup" || rawMode === "signout" ? rawMode : "signin";
  const name = sp.get("name");
  const email = sp.get("email");
  const next = safeRedirectPath(sp.get("next"), mode === "signout" ? "/login" : "/dashboard");

  React.useEffect(() => {
    const t = setTimeout(() => {
      router.replace(next);
    }, 1250);
    return () => clearTimeout(t);
  }, [router, next]);

  return <AuthTransition mode={mode} name={name} email={email} />;
}

export default function AuthTransitionPage() {
  return (
    <React.Suspense fallback={<AuthTransition mode="signin" />}>
      <Inner />
    </React.Suspense>
  );
}
