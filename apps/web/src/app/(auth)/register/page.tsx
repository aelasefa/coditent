"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Suspense, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SocialLoginButtons } from "@/components/social-login-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { register } from "@/lib/api";
import authStyles from "../login/login-page.module.css";
import styles from "./register-page.module.css";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[0-9]/, "Password must include a number")
    .regex(/[^A-Za-z0-9\s]/, "Password must include a symbol"),
  full_name: z.string().min(2, "Name is required").max(100, "Name must not exceed 100 characters"),
});

const passwordRequirements = [
  { label: "At least 12 characters", test: (value: string) => value.length >= 12 },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One number", test: (value: string) => /[0-9]/.test(value) },
  { label: "One symbol", test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
] as const;

type RegisterValues = z.infer<typeof registerSchema>;

function RegisterInner() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", full_name: "" },
  });

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      // No account or token exists yet: verify the emailed code first.
      setErrorMessage(null);
      router.push(
        `/verify-email?email=${encodeURIComponent(data.email)}` +
        `&registration_id=${encodeURIComponent(data.registration_id)}`
      );
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
  const password = form.watch("password");
  return (
    <main className={`${authStyles.page} ${styles.page}`}>
      <video
        className={styles.backgroundVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/images/auth/sign-in-background.png"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source
          src="/images/auth/login-background-hd.mp4?v=2"
          type="video/mp4"
        />
      </video>

      <div className={styles.signupContent}>
      <a href="#auth-form" className={authStyles.skipLink}>Skip to registration form</a>
      <header className={authStyles.header}>
        <Link href="/" aria-label="Coditent home">
          <Logo size="md" />
        </Link>
        <Link href="/offers/all" className={authStyles.headerLink}>
          Browse opportunities <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <div className={`${authStyles.shell} ${styles.shell}`}>
        <section className={authStyles.formColumn} aria-labelledby="sign-up-title">
          <div className={`${authStyles.formInner} ${styles.formInner}`}>
            <p className={authStyles.eyebrow}>Begin here</p>
            <h1 id="sign-up-title" className={authStyles.title}>Build your <em>professional path.</em></h1>
            <p className={authStyles.subtitle}>Create one account for opportunities, your profile, and every application step.</p>

            <div id="auth-form" className={authStyles.formArea}>
              <form
                className={`${authStyles.form} ${styles.form}`}
                onSubmit={form.handleSubmit((values) => {
                  setErrorMessage(null);
                  registerMutation.mutate(values);
                })}
              >
                <SocialLoginButtons className={authStyles.socialLogin} separator="or continue with email" />

                <div className={styles.fieldGrid}>
                  <Input
                    label="Full name"
                    id="full_name"
                    autoComplete="name"
                    placeholder="Your name"
                    disabled={isSubmitting}
                    error={form.formState.errors.full_name?.message}
                    className={authStyles.input}
                    {...form.register("full_name")}
                  />
                  <Input
                    label="Email"
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={isSubmitting}
                    error={form.formState.errors.email?.message}
                    className={authStyles.input}
                    {...form.register("email")}
                  />
                </div>

                <div>
                  <Input
                    label="Password"
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    disabled={isSubmitting}
                    error={form.formState.errors.password?.message}
                    aria-describedby="password-requirements"
                    className={authStyles.input}
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className={authStyles.passwordToggle}
                  >
                    {showPassword ? "Hide password" : "Show password"}
                  </button>
                  <ul id="password-requirements" className={styles.passwordRequirements} aria-label="Password requirements">
                    {passwordRequirements.map((requirement) => {
                      const isMet = requirement.test(password);
                      return (
                        <li key={requirement.label} className={isMet ? styles.requirementMet : styles.requirementPending}>
                          <span aria-hidden="true">{isMet ? "✓" : "○"}</span>
                          {requirement.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <p className={styles.accountNote}>
                  This creates a candidate account. Company owners, HR managers, and recruiters join through an invitation from their administrator.
                </p>

                {errorMessage ? (
                  <p id="registration-error" role="alert" className={authStyles.error}>
                    {errorMessage}
                  </p>
                ) : null}
                <Button type="submit" loading={isSubmitting} className={authStyles.submitButton}>
                  Create candidate account
                </Button>
                <p className={authStyles.registerPrompt}>
                  Already registered? <Link href="/login">Sign in</Link>
                </p>
              </form>
            </div>
          </div>
        </section>
      </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}
