import { CandidateShell } from "@/components/shell/candidate-shell";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <CandidateShell>{children}</CandidateShell>;
}
