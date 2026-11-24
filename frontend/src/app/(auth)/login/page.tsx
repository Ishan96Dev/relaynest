import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Log In" };

export default function Page() {
  return (
    <AuthShell variant="default">
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
