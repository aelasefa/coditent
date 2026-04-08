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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Login</h1>
        <p className="mt-1 text-sm text-slate-600">Access your Coditent account</p>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={form.handleSubmit((values) => loginMutation.mutate(values))}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            id="email"
            type="email"
            {...form.register("email")}
          />
          <p className="min-h-5 text-xs text-red-600">{form.formState.errors.email?.message}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            id="password"
            type="password"
            {...form.register("password")}
          />
          <p className="min-h-5 text-xs text-red-600">{form.formState.errors.password?.message}</p>
        </div>

        {loginMutation.isError ? (
          <p className="text-sm text-red-600">Login failed. Check your credentials.</p>
        ) : null}

        <button
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={loginMutation.isPending}
          type="submit"
        >
          {loginMutation.isPending ? "Loading..." : "Login"}
        </button>
      </form>

      <p className="text-sm text-slate-600">
        No account?{" "}
        <Link className="font-medium text-slate-900" href="/register">
          Register
        </Link>
      </p>
    </main>
  );
}
