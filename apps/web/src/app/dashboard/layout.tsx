import { CandidateShell } from "@/components/shell/candidate-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <CandidateShell>{children}</CandidateShell>;
}
