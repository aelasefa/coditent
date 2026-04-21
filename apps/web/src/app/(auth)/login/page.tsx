"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { login } from "@/lib/api";
import { saveToken } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ssoAvailability, setSsoAvailability] = useState<{
    google: boolean;
    linkedin: boolean;
  } | null>(null);
  const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const googleSsoUrl = `${apiBaseUrl}/auth/sso/google/start`;
  const linkedinSsoUrl = `${apiBaseUrl}/auth/sso/linkedin/start`;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setErrorMessage(null);
      saveToken(data.token);
      if (data.user.role === "RECRUITER") {
        router.push("/recruiter");
        return;
      }
      if (data.user.role === "ADMIN") {
        router.push("/dashboard");
        return;
      }
      router.push("/profile");
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          setErrorMessage(
            "Cannot reach backend API. Start backend and check NEXT_PUBLIC_API_URL in .env.local"
          );
          return;
        }

        const detail = error.response.data?.detail;
        setErrorMessage(typeof detail === "string" ? detail : "Login failed.");
        return;
      }

      setErrorMessage("Login failed.");
    },
  });

  const isSubmitting = loginMutation.isPending;
  const inputClassName =
    "w-full rounded-xl border border-slate-300/90 bg-slate-50/85 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition duration-150 focus:border-slate-900 focus:bg-white focus:ring-4 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-70";
  const panelFont = {
    fontFamily: '"Sora", "Avenir Next", "Trebuchet MS", sans-serif',
  };
  const displayFont = {
    fontFamily: '"Fraunces", "Iowan Old Style", "Times New Roman", serif',
  };
  const isGoogleEnabled = ssoAvailability?.google ?? false;
  const isLinkedInEnabled = ssoAvailability?.linkedin ?? false;

  useEffect(() => {
    let isMounted = true;

    async function loadSsoAvailability() {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/sso/providers`);
        if (!response.ok) {
          throw new Error("Failed to load SSO providers");
        }

        const data = (await response.json()) as {
          google?: boolean;
          linkedin?: boolean;
        };

        if (!isMounted) {
          return;
        }

        setSsoAvailability({
          google: Boolean(data.google),
          linkedin: Boolean(data.linkedin),
        });
      } catch {
        if (isMounted) {
          setSsoAvailability({ google: false, linkedin: false });
        }
      }
    }

    loadSsoAvailability();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4efe8] px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-6 h-64 w-64 rounded-full bg-[#ffd5a5] blur-3xl" />
        <div className="absolute -bottom-16 right-0 h-72 w-72 rounded-full bg-[#bbd7ff] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.95),transparent_42%),radial-gradient(circle_at_84%_84%,rgba(255,255,255,0.88),transparent_45%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:32px_32px] opacity-35" />
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
        <section className="auth-intro space-y-6 lg:pr-10">
          <p
            className="inline-flex items-center rounded-full border border-slate-300 bg-white/75 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-600"
            style={panelFont}
          >
            Coditent control desk
          </p>
          <h1
            className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl"
            style={displayFont}
          >
            Start where hiring decisions happen.
          </h1>
          <p className="max-w-xl text-base leading-7 text-slate-700 sm:text-lg" style={panelFont}>
            Keep candidates, recommendations, and offers in one calm workspace built for busy
            recruiters and teams.
          </p>
          <div className="grid gap-3 text-sm sm:grid-cols-2" style={panelFont}>
            <div className="rounded-2xl border border-slate-200/90 bg-white/75 px-4 py-3 text-slate-700 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.55)]">
              Candidate insights ready before standup
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-white/75 px-4 py-3 text-slate-700 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.55)]">
              Offer tracking without tab switching
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-white/75 px-4 py-3 text-slate-700 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.55)] sm:col-span-2">
              Secure role-based access for recruiters and candidates
            </div>
          </div>
        </section>

        <section className="auth-card overflow-hidden rounded-[28px] border border-slate-200 bg-white/90 shadow-[0_34px_84px_-50px_rgba(15,23,42,0.8)] backdrop-blur">
          <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500" style={panelFont}>
              Welcome back
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900" style={displayFont}>
              Sign in
            </h2>
            <p className="mt-1 text-sm text-slate-600" style={panelFont}>
              Use your work email and password.
            </p>
          </div>

          <form
            className="space-y-5 px-6 py-6 sm:px-8 sm:py-8"
            onSubmit={form.handleSubmit((values) => {
              setErrorMessage(null);
              loginMutation.mutate(values);
            })}
          >
            <div className="grid gap-2 sm:grid-cols-2" style={panelFont}>
              {isGoogleEnabled ? (
                <a
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                  href={googleSsoUrl}
                >
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M21.82 12.23c0-.7-.06-1.4-.2-2.07H12v3.92h5.51a4.71 4.71 0 0 1-2.04 3.1v2.57h3.3c1.94-1.78 3.05-4.4 3.05-7.52z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 22c2.75 0 5.06-.91 6.75-2.48l-3.3-2.57a6.08 6.08 0 0 1-9.05-3.19H3v2.65A10 10 0 0 0 12 22z"
                      fill="#34A853"
                    />
                    <path
                      d="M6.4 13.76a5.97 5.97 0 0 1 0-3.52V7.59H3a10 10 0 0 0 0 8.82l3.4-2.65z"
                      fill="#FBBC04"
                    />
                    <path
                      d="M12 6.04c1.5 0 2.85.52 3.9 1.52l2.92-2.92A9.75 9.75 0 0 0 12 2a10 10 0 0 0-9 5.59l3.4 2.65A6 6 0 0 1 12 6.04z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </a>
              ) : (
                <button
                  className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-400"
                  disabled
                  type="button"
                >
                  Google unavailable
                </button>
              )}

              {isLinkedInEnabled ? (
                <a
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                  href={linkedinSsoUrl}
                >
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M4.98 3.5A2.48 2.48 0 1 0 5 8.46a2.48 2.48 0 0 0-.02-4.96zM3 9h4v12H3zM10 9h3.83v1.7h.05c.53-1 1.84-2.05 3.8-2.05 4.06 0 4.82 2.68 4.82 6.17V21h-4v-5.35c0-1.28-.02-2.93-1.79-2.93-1.79 0-2.06 1.4-2.06 2.84V21h-4z"
                      fill="#0A66C2"
                    />
                  </svg>
                  Continue with LinkedIn
                </a>
              ) : (
                <button
                  className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-medium text-slate-400"
                  disabled
                  type="button"
                >
                  LinkedIn unavailable
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs uppercase tracking-[0.14em] text-slate-500" style={panelFont}>
                or sign in with email
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="email" style={panelFont}>
                Email
              </label>
              <input
                autoComplete="email"
                className={inputClassName}
                disabled={isSubmitting}
                id="email"
                placeholder="you@company.com"
                type="email"
                {...form.register("email")}
              />
              {form.formState.errors.email?.message ? (
                <p className="text-xs text-rose-600" style={panelFont}>
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700" htmlFor="password" style={panelFont}>
                Password
              </label>
              <input
                autoComplete="current-password"
                className={inputClassName}
                disabled={isSubmitting}
                id="password"
                placeholder="Enter at least 8 characters"
                type="password"
                {...form.register("password")}
              />
              {form.formState.errors.password?.message ? (
                <p className="text-xs text-rose-600" style={panelFont}>
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            {errorMessage ? (
              <p
                aria-live="polite"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                style={panelFont}
              >
                {errorMessage}
              </p>
            ) : null}

            <button
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              style={panelFont}
              type="submit"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>

            <p className="text-center text-sm text-slate-600" style={panelFont}>
              No account yet?{" "}
              <Link className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900" href="/register">
                Create one here
              </Link>
            </p>
          </form>
        </section>
      </div>

      <style jsx>{`
        .auth-intro {
          animation: reveal-up 560ms cubic-bezier(0.16, 1, 0.3, 1) 60ms both;
        }

        .auth-card {
          animation: reveal-up 640ms cubic-bezier(0.16, 1, 0.3, 1) 170ms both;
        }

        @keyframes reveal-up {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.995);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </main>
  );
}
