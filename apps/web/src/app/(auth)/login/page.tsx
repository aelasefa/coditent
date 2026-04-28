"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { useState } from "react";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput } from "@/components/ui/md-field";
import { api } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import type { TokenResponse } from "@/lib/types";

type LoginRole = "candidate" | "recruiter";

const roleContent: Record<
  LoginRole,
  {
    badge: string;
    heading: string;
    subtext: string;
    stat1Label: string;
    stat1Value: string;
    stat2Label: string;
    stat2Value: string;
    submitLabel: string;
  }
> = {
  candidate: {
    badge: "CANDIDATE PORTAL",
    heading: "Find your next opportunity.",
    subtext: "Get AI-matched to the best jobs and internships in Morocco.",
    stat1Label: "Profile setup time",
    stat1Value: "8 min",
    stat2Label: "AI match accuracy",
    stat2Value: "94%",
    submitLabel: "Sign in as Candidate",
  },
  recruiter: {
    badge: "RECRUITER PORTAL",
    heading: "Sign in to your hiring control center.",
    subtext: "Candidates and recruiters run in one shared workflow.",
    stat1Label: "Candidate profile setup",
    stat1Value: "8 min",
    stat2Label: "Recruiter review cycle",
    stat2Value: "2.3h",
    submitLabel: "Sign in as Recruiter",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeRole, setActiveRole] = useState<LoginRole>("candidate");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeContent = roleContent[activeRole];
  const socialButtonClass =
    "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium tracking-[0.01em] transition-all duration-300 ease-md active:scale-95";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await api.post<TokenResponse>("/auth/login", {
        email,
        password,
      });

      const data = response.data;
      const nextParam = searchParams.get("next");
      const nextPath =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : null;

      if (data.user.role === "ADMIN") {
        saveToken(data.token);
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        router.push(nextPath ?? "/admin");
        return;
      }

      const expectedRole = activeRole === "candidate" ? "CANDIDATE" : "RECRUITER";

      if (data.user.role !== expectedRole) {
        if (activeRole === "candidate") {
          setErrorMessage(
            "This account is registered as a Recruiter. Please use the Recruiter tab to sign in."
          );
        } else {
          setErrorMessage(
            "This account is registered as a Candidate. Please use the Candidate tab to sign in."
          );
        }
        return;
      }

      saveToken(data.token);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (nextPath) {
        router.push(nextPath);
        return;
      }

      router.push(data.user.role === "RECRUITER" ? "/recruiter" : "/dashboard");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const detail = String(error.response?.data?.detail ?? "").toLowerCase();
        if (status === 400 || status === 401 || detail.includes("invalid")) {
          setErrorMessage("Invalid email or password.");
        } else {
          setErrorMessage("Something went wrong. Please try again.");
        }
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRoleChange(nextRole: LoginRole) {
    setActiveRole(nextRole);
    setErrorMessage(null);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-md-background px-4 py-8 sm:px-6 lg:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-16 top-0 h-72 w-72 rounded-full bg-md-primary/20 blur-3xl" />
        <div className="md-glow absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-md-tertiary/20 blur-3xl" />
        <div className="absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-md-secondaryContainer/45 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 md:grid-cols-[1.05fr_0.95fr] md:gap-12">
        <section className="md-fade-up hidden space-y-6 md:block">
          <p className="inline-flex rounded-full bg-md-secondaryContainer px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-md-onSecondaryContainer">
            {activeContent.badge}
          </p>
          <h1 className="max-w-xl text-4xl font-medium leading-tight sm:text-5xl">
            {activeContent.heading}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-md-onSurfaceVariant sm:text-lg">
            {activeContent.subtext}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <MdCard interactive className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">{activeContent.stat1Label}</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">{activeContent.stat1Value}</p>
            </MdCard>
            <MdCard interactive className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">{activeContent.stat2Label}</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">{activeContent.stat2Value}</p>
            </MdCard>
          </div>
        </section>

        <MdCard className="md-fade-up md-fade-delay-1 w-full max-w-md justify-self-center rounded-md-2xl border-md-outline/20 bg-md-surface p-6 sm:p-8 md:justify-self-end">
          <div className="mb-6" role="tablist" aria-label="Select login role">
            <div className="grid w-full grid-cols-2 rounded-xl bg-black/20 p-1">
              <button
                aria-selected={activeRole === "candidate"}
                className={`h-11 rounded-lg text-sm font-medium transition-colors ${
                  activeRole === "candidate"
                    ? "bg-[#7C3AED] text-white"
                    : "bg-transparent text-zinc-400"
                }`}
                onClick={() => handleRoleChange("candidate")}
                role="tab"
                type="button"
              >
                Candidate
              </button>
              <button
                aria-selected={activeRole === "recruiter"}
                className={`h-11 rounded-lg text-sm font-medium transition-colors ${
                  activeRole === "recruiter"
                    ? "bg-[#7C3AED] text-white"
                    : "bg-transparent text-zinc-400"
                }`}
                onClick={() => handleRoleChange("recruiter")}
                role="tab"
                type="button"
              >
                Recruiter
              </button>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className={`${socialButtonClass} cursor-not-allowed border border-md-outline/30 text-md-onSurfaceVariant/70`}
                disabled
                title="Coming soon"
                type="button"
              >
                Continue with Google
              </button>

              <button
                className={`${socialButtonClass} cursor-not-allowed border border-md-outline/30 text-md-onSurfaceVariant/70`}
                disabled
                title="Coming soon"
                type="button"
              >
                Continue with LinkedIn
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-md-outline/30" />
              <span className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">
                OR USE EMAIL
              </span>
              <div className="h-px flex-1 bg-md-outline/30" />
            </div>

            <MdField htmlFor="email" label="Email">
              <MdInput
                autoComplete="email"
                disabled={isSubmitting}
                id="email"
                placeholder="you@company.com"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorMessage(null);
                }}
              />
            </MdField>

            <MdField htmlFor="password" label="Password">
              <MdInput
                autoComplete="current-password"
                disabled={isSubmitting}
                id="password"
                placeholder="At least 8 characters"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrorMessage(null);
                }}
              />
            </MdField>

            <MdButton
              aria-disabled={isSubmitting}
              className="w-full"
              disabled={isSubmitting}
              type="submit"
              variant="filled"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Signing in...
                </span>
              ) : (
                activeContent.submitLabel
              )}
            </MdButton>

            {errorMessage ? (
              <p className="text-sm text-[#EF4444]" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <p className="text-center text-sm text-md-onSurfaceVariant">
              No account yet?{" "}
              <Link
                className="font-medium text-md-primary underline decoration-md-primary/40 underline-offset-4"
                href={`/register?role=${activeRole}`}
              >
                Create one
              </Link>
            </p>
          </form>
        </MdCard>
      </div>
    </main>
  );
}
