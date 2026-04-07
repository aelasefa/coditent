"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { register } from "@/lib/api";
import { saveToken } from "@/lib/auth";

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(2, "Name is required"),
  role: z.enum(["candidate", "recruiter"]),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      full_name: "",
      role: "candidate",
    },
  });

  const registerMutation = useMutation({
    mutationFn: register,
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
        <h1 className="text-2xl font-semibold">Register</h1>
        <p className="text-sm text-slate-600">Create your Coditent account</p>
      </div>

      <form
        className="space-y-4 rounded border border-slate-200 bg-white p-4"
        onSubmit={form.handleSubmit((values) =>
          registerMutation.mutate({
            ...values,
            role: values.role === "candidate" ? "CANDIDATE" : "RECRUITER",
          })
        )}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="full_name">
            Full name
          </label>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            id="full_name"
            {...form.register("full_name")}
          />
          <p className="text-xs text-red-600">{form.formState.errors.full_name?.message}</p>
        </div>

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

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="role">
            Role
          </label>
          <select
            className="w-full rounded border border-slate-300 px-3 py-2"
            id="role"
            {...form.register("role")}
          >
            <option value="candidate">Candidate</option>
            <option value="recruiter">Recruiter</option>
          </select>
        </div>

        {registerMutation.isError ? (
          <p className="text-sm text-red-600">Registration failed. Try another email.</p>
        ) : null}

        <button
          className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={registerMutation.isPending}
          type="submit"
        >
          {registerMutation.isPending ? "Loading..." : "Create account"}
        </button>
      </form>

      <p className="text-sm text-slate-600">
        Already have an account?{" "}
        <Link className="font-medium text-slate-900" href="/login">
          Login
        </Link>
      </p>
    </main>
  );
}
