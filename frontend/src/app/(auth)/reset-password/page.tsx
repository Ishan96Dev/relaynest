import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Reset Password" };

export default function Page() {
  return (
    <AuthShell variant="reset">
      <Suspense><ResetForm /></Suspense>
    </AuthShell>
  );
}
