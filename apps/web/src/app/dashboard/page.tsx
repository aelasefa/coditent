"use client";

import { useMemo, useState } from "react";

type ReviewStatus = "PENDING" | "ACCEPTED" | "REJECTED";

type CandidateItem = {
  id: string;
  fullName: string;
  field: string;
  city: string;
  status: ReviewStatus;
};

type RecruiterItem = {
  id: string;
  fullName: string;
  company: string;
  email: string;
  status: ReviewStatus;
};

const initialCandidates: CandidateItem[] = [
  { id: "cand-1", fullName: "Salma Idrissi", field: "Software Engineering", city: "Casablanca", status: "PENDING" },
  { id: "cand-2", fullName: "Youssef Amrani", field: "Data Science", city: "Rabat", status: "PENDING" },
  { id: "cand-3", fullName: "Nora El Alaoui", field: "UI/UX Design", city: "Marrakech", status: "PENDING" },
];

const initialRecruiters: RecruiterItem[] = [
  { id: "rec-1", fullName: "Amine Berrada", company: "Atlas Tech", email: "amine@atlastech.ma", status: "PENDING" },
  { id: "rec-2", fullName: "Lina Othmani", company: "NorthHub", email: "lina@northhub.co", status: "PENDING" },
  { id: "rec-3", fullName: "Khalid Bennani", company: "MenaSoft", email: "khalid@menasoft.io", status: "PENDING" },
];

function badgeClass(status: ReviewStatus): string {
  if (status === "ACCEPTED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "REJECTED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function DashboardPage() {
  const [candidates, setCandidates] = useState<CandidateItem[]>(initialCandidates);
  const [recruiters, setRecruiters] = useState<RecruiterItem[]>(initialRecruiters);

  const acceptedCandidates = useMemo(
    () => candidates.filter((item) => item.status === "ACCEPTED").length,
    [candidates]
  );
  const acceptedRecruiters = useMemo(
    () => recruiters.filter((item) => item.status === "ACCEPTED").length,
    [recruiters]
  );

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Admin Dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Candidate and Recruiter Review</h1>
          <p className="mt-2 text-sm text-slate-600">
            Static preview dashboard with accept and reject actions.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Candidates accepted</p>
              <p className="mt-1 text-2xl font-semibold">{acceptedCandidates}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Recruiters accepted</p>
              <p className="mt-1 text-2xl font-semibold">{acceptedRecruiters}</p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Candidates</h2>
          <div className="mt-4 space-y-3">
            {candidates.map((candidate) => (
              <article
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={candidate.id}
              >
                <div>
                  <p className="font-semibold">{candidate.fullName}</p>
                  <p className="text-sm text-slate-600">{candidate.field} · {candidate.city}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(candidate.status)}`}>
                    {candidate.status}
                  </span>
                  <button
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                    onClick={() =>
                      setCandidates((current) =>
                        current.map((item) =>
                          item.id === candidate.id ? { ...item, status: "ACCEPTED" } : item
                        )
                      )
                    }
                    type="button"
                  >
                    Accept
                  </button>
                  <button
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                    onClick={() =>
                      setCandidates((current) =>
                        current.map((item) =>
                          item.id === candidate.id ? { ...item, status: "REJECTED" } : item
                        )
                      )
                    }
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Recruiters</h2>
          <div className="mt-4 space-y-3">
            {recruiters.map((recruiter) => (
              <article
                className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={recruiter.id}
              >
                <div>
                  <p className="font-semibold">{recruiter.fullName}</p>
                  <p className="text-sm text-slate-600">{recruiter.company} · {recruiter.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(recruiter.status)}`}>
                    {recruiter.status}
                  </span>
                  <button
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                    onClick={() =>
                      setRecruiters((current) =>
                        current.map((item) =>
                          item.id === recruiter.id ? { ...item, status: "ACCEPTED" } : item
                        )
                      )
                    }
                    type="button"
                  >
                    Accept
                  </button>
                  <button
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                    onClick={() =>
                      setRecruiters((current) =>
                        current.map((item) =>
                          item.id === recruiter.id ? { ...item, status: "REJECTED" } : item
                        )
                      )
                    }
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
