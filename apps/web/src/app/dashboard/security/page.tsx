import { TwoFactorSecurity } from "@/components/security/two-factor-security";
import { PageContainer, PageHeader } from "@/components/shell/page-container";

export default function CandidateSecurityPage() {
  return (
    <PageContainer>
      <PageHeader title="Security" description="Manage sign-in protection for your account." />
      <div className="mt-6 max-w-3xl"><TwoFactorSecurity /></div>
    </PageContainer>
  );
}
