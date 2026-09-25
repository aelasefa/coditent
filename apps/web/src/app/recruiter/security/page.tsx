import Link from "next/link";
import { TwoFactorSecurity } from "@/components/security/two-factor-security";

export default function RecruiterSecurityPage() {
  return (
    <main className="min-h-screen bg-md-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/recruiter" className="text-sm font-medium text-primary hover:underline">← Recruiter workspace</Link>
          <h1 className="mt-4 text-3xl font-semibold text-foreground">Security</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage sign-in protection for your account.</p>
        </div>
        <TwoFactorSecurity />
      </div>
    </main>
  );
}
