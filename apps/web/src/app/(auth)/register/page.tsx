"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Suspense, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SocialLoginButtons } from "@/components/social-login-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { register } from "@/lib/api";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(2, "Name is required"),
  role: z.enum(["candidate", "recruiter"]),
});

type RegisterValues = z.infer<typeof registerSchema>;

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") === "recruiter" ? "recruiter" : "candidate";
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", full_name: "", role: initialRole },
  });

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      // No account or token exists yet: verify the emailed code first.
      setErrorMessage(null);
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        if (!error.response) {
          setErrorMessage("Cannot reach server. Check connection and try again.");
          return;
        }
        const detailValue = error.response.data?.detail;
        setErrorMessage(typeof detailValue === "string" ? detailValue : "Registration failed.");
        return;
      }
      setErrorMessage("Registration failed.");
    },
  });

  const isSubmitting = registerMutation.isPending;

  return (
    <AuthLayout title="Create account" subtitle="One account for opportunities, profile and applications.">
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          setErrorMessage(null);
          registerMutation.mutate({ ...values, role: values.role === "candidate" ? "CANDIDATE" : "RECRUITER" });
        })}
      >
        <SocialLoginButtons separator="or continue with email" />
        <Input label="Full name" id="full_name" autoComplete="name" placeholder="Your name" disabled={isSubmitting} error={form.formState.errors.full_name?.message} {...form.register("full_name")} />
        <Input label="Email" id="email" type="email" autoComplete="email" placeholder="you@example.com" disabled={isSubmitting} error={form.formState.errors.email?.message} {...form.register("email")} />
        <div>
          <Input
            label="Password"
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            disabled={isSubmitting}
            error={form.formState.errors.password?.message}
            {...form.register("password")}
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
        <Select label="I am joining as" id="role" disabled={isSubmitting} error={form.formState.errors.role?.message} {...form.register("role")} helper="Candidates find work. Recruiters hire. Company team access comes only by invitation.">
          <option value="candidate">Looking for opportunities</option>
          <option value="recruiter">Hiring talent</option>
        </Select>
        {errorMessage ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {errorMessage}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}
