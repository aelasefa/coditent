import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function PendingApprovalPage() {
  return (
    <AuthLayout
      title="Recruiter account pending approval"
      subtitle="Admin approval unlocks offer management and recruiter tools. This usually happens quickly."
    >
      <div className="flex flex-col gap-2">
        <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Back to sign in
        </Link>
        <Link href="/" className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-secondary">
          Return home
        </Link>
      </div>
    </AuthLayout>
  );
}
