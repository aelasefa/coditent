"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must not exceed 128 characters"),
  full_name: z.string().min(2, "Name is required").max(100, "Name must not exceed 100 characters"),
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
  const selectedRole = form.watch("role");

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
                  registerMutation.mutate({ ...values, role: values.role === "candidate" ? "CANDIDATE" : "RECRUITER" });
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
                    placeholder="At least 8 characters"
                    helper="Use at least 8 characters."
                    disabled={isSubmitting}
                    error={form.formState.errors.password?.message}
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
                </div>

                <fieldset className={styles.roleFieldset} disabled={isSubmitting}>
                  <legend>I am joining as</legend>
                  <div className={styles.roleOptions}>
                    <label className={selectedRole === "candidate" ? styles.roleOptionActive : styles.roleOption}>
                      <input type="radio" value="candidate" {...form.register("role")} />
                      <span className={styles.roleContent}>
                        <strong>Candidate</strong>
                        <small>Find opportunities and show your skills.</small>
                      </span>
                    </label>
                    <label className={selectedRole === "recruiter" ? styles.roleOptionActive : styles.roleOption}>
                      <input type="radio" value="recruiter" {...form.register("role")} />
                      <span className={styles.roleContent}>
                        <strong>Recruiter</strong>
                        <small>Discover talent and manage hiring.</small>
                      </span>
                    </label>
                  </div>
                  <p className={styles.roleHelper}>Company team access is available by invitation.</p>
                  {form.formState.errors.role?.message ? <p role="alert" className={styles.fieldError}>{form.formState.errors.role.message}</p> : null}
                </fieldset>

                {errorMessage ? (
                  <p id="registration-error" role="alert" className={authStyles.error}>
                    {errorMessage}
                  </p>
                ) : null}
                <Button type="submit" loading={isSubmitting} className={authStyles.submitButton}>
                  Create {selectedRole === "recruiter" ? "recruiter" : "candidate"} account
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
