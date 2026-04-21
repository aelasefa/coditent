"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput, MdSelect } from "@/components/ui/md-field";
import { register } from "@/lib/api";
import { saveToken } from "@/lib/auth";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(2, "Name is required"),
  role: z.enum(["candidate", "recruiter"]),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        const detail = typeof detailValue === "string" ? detailValue : "Registration failed.";
        setErrorMessage(detail);
        return;
      }

      setErrorMessage("Registration failed.");
    },
  });

  const isSubmitting = registerMutation.isPending;

  return (
    <main className="relative min-h-screen overflow-hidden bg-md-background px-4 py-8 sm:px-6 lg:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-20 top-8 h-72 w-72 rounded-full bg-md-primary/20 blur-3xl" />
        <div className="md-glow absolute right-0 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-md-tertiary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-md-secondaryContainer/45 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <section className="md-fade-up space-y-6">
          <p className="inline-flex rounded-full bg-md-secondaryContainer px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-md-onSecondaryContainer">
            Join Coditent
          </p>
          <h1 className="max-w-xl text-4xl font-medium leading-tight sm:text-5xl">
            Build one profile. Move faster through the hiring cycle.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-md-onSurfaceVariant sm:text-lg">
            Create your workspace as a candidate or recruiter and keep recommendations, offers, and
            conversations in one expressive interface.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <MdCard interactive className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Recommendations generated</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">In minutes</p>
            </MdCard>
            <MdCard interactive className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Recruiter publishing flow</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">One form</p>
            </MdCard>
          </div>
        </section>

        <MdCard className="md-fade-up md-fade-delay-1 rounded-md-2xl border-md-outline/20 bg-md-surface p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">
              New account
            </p>
            <h2 className="mt-2 text-3xl font-medium">Create account</h2>
            <p className="mt-1 text-sm text-md-onSurfaceVariant">Set your role and start your workspace.</p>
          </div>

          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => {
              setErrorMessage(null);
              registerMutation.mutate({
                ...values,
                role: values.role === "candidate" ? "CANDIDATE" : "RECRUITER",
              });
            })}
          >
            <MdField error={form.formState.errors.full_name?.message} htmlFor="full_name" label="Full name">
              <MdInput
                autoComplete="name"
                disabled={isSubmitting}
                id="full_name"
                placeholder="Your name"
                {...form.register("full_name")}
              />
            </MdField>

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
                autoComplete="new-password"
                disabled={isSubmitting}
                id="password"
                placeholder="At least 8 characters"
                type="password"
                {...form.register("password")}
              />
            </MdField>

            <MdField error={form.formState.errors.role?.message} htmlFor="role" label="Role">
              <MdSelect disabled={isSubmitting} id="role" {...form.register("role")}>
                <option value="candidate">Candidate</option>
                <option value="recruiter">Recruiter</option>
              </MdSelect>
            </MdField>

            {errorMessage ? (
              <div className="rounded-md border border-rose-300 bg-rose-100/60 px-4 py-3 text-sm text-rose-800">
                {errorMessage}
              </div>
            ) : null}

            <MdButton className="w-full" disabled={isSubmitting} type="submit" variant="filled">
              {isSubmitting ? "Creating account..." : "Create account"}
            </MdButton>

            <p className="text-center text-sm text-md-onSurfaceVariant">
              Already registered?{" "}
              <Link
                className="font-medium text-md-primary underline decoration-md-primary/40 underline-offset-4"
                href="/login"
              >
                Sign in
              </Link>
            </p>
          </form>
        </MdCard>
      </div>
    </main>
  );
}
