import { CandidateShell } from "@/components/shell/candidate-shell";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <CandidateShell>{children}</CandidateShell>;
}
