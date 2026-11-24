import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign Up" };

export default function Page() {
  return (
    <AuthShell variant="signup">
      <Suspense><SignupForm /></Suspense>
    </AuthShell>
  );
}
