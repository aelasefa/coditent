"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput } from "@/components/ui/md-field";
import { login } from "@/lib/api";
import { saveToken } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
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
        if (!data.user.is_approved) {
          router.push("/pending-approval");
          return;
        }

        router.push("/recruiter");
        return;
      }

      router.push("/profile");
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          setErrorMessage(
            "Cannot reach backend API. Start the backend and verify NEXT_PUBLIC_API_URL in .env.local"
          );
          return;
        }

        const detailValue = error.response.data?.detail;
        const detail = typeof detailValue === "string" ? detailValue : "Login failed.";

        if (
          error.response.status === 403 &&
          detail.toLowerCase().includes("pending admin approval")
        ) {
          router.push("/pending-approval");
          return;
        }

        setErrorMessage(detail);
        return;
      }

      setErrorMessage("Login failed.");
    },
  });

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

  const isSubmitting = loginMutation.isPending;
  const isGoogleEnabled = ssoAvailability?.google ?? false;
  const isLinkedInEnabled = ssoAvailability?.linkedin ?? false;
  const socialButtonClass =
    "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium tracking-[0.01em] transition-all duration-300 ease-md active:scale-95";

  return (
    <main className="relative min-h-screen overflow-hidden bg-md-background px-4 py-8 sm:px-6 lg:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-16 top-0 h-72 w-72 rounded-full bg-md-primary/20 blur-3xl" />
        <div className="md-glow absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-md-tertiary/20 blur-3xl" />
        <div className="absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-md-secondaryContainer/45 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <section className="md-fade-up space-y-6">
          <p className="inline-flex rounded-full bg-md-secondaryContainer px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-md-onSecondaryContainer">
            Coditent workspace
          </p>
          <h1 className="max-w-xl text-4xl font-medium leading-tight sm:text-5xl">
            Sign in to your hiring control center.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-md-onSurfaceVariant sm:text-lg">
            Candidates and recruiters run in one shared workflow. Keep context, recommendations,
            and offer execution in sync.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <MdCard interactive className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Candidate profile setup</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">8 min</p>
            </MdCard>
            <MdCard interactive className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Recruiter review cycle</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">2.3h</p>
            </MdCard>
          </div>
        </section>

        <MdCard className="md-fade-up md-fade-delay-1 rounded-md-2xl border-md-outline/20 bg-md-surface p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">Welcome back</p>
            <h2 className="mt-2 text-3xl font-medium">Sign in</h2>
            <p className="mt-1 text-sm text-md-onSurfaceVariant">Use your account credentials.</p>
          </div>

          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => {
              setErrorMessage(null);
              loginMutation.mutate(values);
            })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {isGoogleEnabled ? (
                <a
                  className={`${socialButtonClass} border border-md-outline/50 text-md-foreground hover:bg-md-primary/10`}
                  href={googleSsoUrl}
                >
                  Continue with Google
                </a>
              ) : (
                <button
                  className={`${socialButtonClass} cursor-not-allowed border border-md-outline/30 text-md-onSurfaceVariant/70`}
                  disabled
                  type="button"
                >
                  Google unavailable
                </button>
              )}

              {isLinkedInEnabled ? (
                <a
                  className={`${socialButtonClass} border border-md-outline/50 text-md-foreground hover:bg-md-primary/10`}
                  href={linkedinSsoUrl}
                >
                  Continue with LinkedIn
                </a>
              ) : (
                <button
                  className={`${socialButtonClass} cursor-not-allowed border border-md-outline/30 text-md-onSurfaceVariant/70`}
                  disabled
                  type="button"
                >
                  LinkedIn unavailable
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-md-outline/30" />
              <span className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">
                or use email
              </span>
              <div className="h-px flex-1 bg-md-outline/30" />
            </div>

            <MdField error={form.formState.errors.email?.message} htmlFor="email" label="Email">
              <MdInput
                autoComplete="email"
                disabled={isSubmitting}
                id="email"
                placeholder="you@company.com"
                type="email"
                {...form.register("email")}
              />
            </MdField>

            <MdField
              error={form.formState.errors.password?.message}
              htmlFor="password"
              label="Password"
            >
              <MdInput
                autoComplete="current-password"
                disabled={isSubmitting}
                id="password"
                placeholder="At least 8 characters"
                type="password"
                {...form.register("password")}
              />
            </MdField>

            {errorMessage ? (
              <div className="rounded-md border border-rose-300 bg-rose-100/60 px-4 py-3 text-sm text-rose-800">
                {errorMessage}
              </div>
            ) : null}

            <MdButton className="w-full" disabled={isSubmitting} type="submit" variant="filled">
              {isSubmitting ? "Signing in..." : "Sign in"}
            </MdButton>

            <p className="text-center text-sm text-md-onSurfaceVariant">
              No account yet?{" "}
              <Link
                className="font-medium text-md-primary underline decoration-md-primary/40 underline-offset-4"
                href="/register"
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
