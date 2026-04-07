"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
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
      saveToken(data.token);
      if (data.user.role === "RECRUITER") {
        router.push("/recruiter");
        return;
      }
      router.push("/dashboard");
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="text-sm text-slate-600">Access your Coditent account</p>
      </div>

      <form
        className="space-y-4 rounded border border-slate-200 bg-white p-4"
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
          <p className="text-xs text-red-600">{form.formState.errors.email?.message}</p>
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
          <p className="text-xs text-red-600">{form.formState.errors.password?.message}</p>
        </div>

        {loginMutation.isError ? (
          <p className="text-sm text-red-600">Login failed. Check your credentials.</p>
        ) : null}

        <button
          className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
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
