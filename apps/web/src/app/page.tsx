import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold">Coditent MVP</h1>
      <p className="text-slate-600">Frontend connecte a l API backend pour candidats et recruteurs.</p>
      <div className="flex flex-wrap gap-3">
        <Link className="rounded bg-slate-900 px-4 py-2 text-white" href="/login">
          Login
        </Link>
        <Link className="rounded border border-slate-300 px-4 py-2" href="/register">
          Register
        </Link>
        <Link className="rounded border border-slate-300 px-4 py-2" href="/dashboard">
          Candidate Dashboard
        </Link>
        <Link className="rounded border border-slate-300 px-4 py-2" href="/recruiter">
          Recruiter Area
        </Link>
      </div>
    </main>
  );
}
