"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SocialLoginButtons } from "@/components/social-login-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { saveToken } from "@/lib/auth";
import type { TokenResponse } from "@/lib/types";

type LoginRole = "candidate" | "recruiter";

function safeNext(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeRole, setActiveRole] = useState<LoginRole>("candidate");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await api.post<TokenResponse>("/auth/login", { email, password });
      const data = response.data;
      const nextPath = safeNext(searchParams.get("next"));

      if (data.user.role === "PLATFORM_ADMIN" || data.user.role === "ADMIN") {
        saveToken(data.token);
        router.push(nextPath ?? "/admin");
        return;
      }
      if (data.user.role === "COMPANY_USER") {
        saveToken(data.token);
        router.push(nextPath ?? "/company");
        return;
      }

      const expectedRole = activeRole === "candidate" ? "CANDIDATE" : "RECRUITER";
      if (data.user.role !== expectedRole) {
        setErrorMessage(
          activeRole === "candidate"
            ? "This account is registered as a Recruiter. Use the Recruiter tab to sign in."
            : "This account is registered as a Candidate. Use the Candidate tab to sign in."
        );
        return;
      }

      saveToken(data.token);
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
        } else if (!error.response) {
          setErrorMessage("Cannot reach server. Check connection and try again.");
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

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to your workspace.">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-secondary p-1" role="tablist" aria-label="Account type">
        {(["candidate", "recruiter"] as LoginRole[]).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={activeRole === r}
            onClick={() => {
              setActiveRole(r);
              setErrorMessage(null);
            }}
            className={activeRole === r ? "h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" : "h-10 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"}
          >
            {r === "candidate" ? "Candidate" : "Recruiter"}
          </button>
        ))}
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <SocialLoginButtons separator="or continue with email" />
        <Input
          label="Email"
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={isSubmitting}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrorMessage(null);
          }}
        />
        <div>
          <Input
            label="Password"
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Your password"
            disabled={isSubmitting}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrorMessage(null);
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="mt-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            {showPassword ? "Hide password" : "Show password"}
          </button>
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">
          {activeRole === "candidate" ? "Sign in as Candidate" : "Sign in as Recruiter"}
        </Button>
        {errorMessage ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errorMessage}
          </p>
        ) : null}
        <p className="text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href={`/register?role=${activeRole}`} className="font-semibold text-primary hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
