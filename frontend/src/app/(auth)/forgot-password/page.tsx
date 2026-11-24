import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Forgot Password" };

export default function Page() {
  return (
    <AuthShell variant="recover">
      <Suspense><ForgotForm /></Suspense>
    </AuthShell>
  );
}
