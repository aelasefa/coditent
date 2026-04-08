import { AppNavbar } from "@/components/app-navbar";

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppNavbar />
      {children}
    </div>
  );
}
