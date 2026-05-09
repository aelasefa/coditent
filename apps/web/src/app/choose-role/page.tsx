"use client";

import { useRouter } from "next/navigation";
import axios from "axios";
import { useState } from "react";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { completeOauthRegistration } from "@/lib/api";
import { saveToken } from "@/lib/auth";

const roles = [
  {
    id: "candidate" as const,
    title: "Continue as Candidate",
    description: "Build your profile and get AI-matched to the best roles.",
  },
  {
    id: "recruiter" as const,
    title: "Continue as Recruiter",
    description: "Post roles, review talent, and manage your pipeline.",
  },
];

export default function ChooseRolePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSelect(role: "candidate" | "recruiter") {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(role);
    setErrorMessage(null);

    try {
      const data = await completeOauthRegistration({ role });
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
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401) {
          setErrorMessage("Session expired. Please sign in again.");
          return;
        }

        const detail = error.response?.data?.detail;
        setErrorMessage(typeof detail === "string" ? detail : "Unable to complete registration.");
        return;
      }

      const fallbackMessage = "Unable to complete registration.";
      if (error instanceof Error) {
        const status = (error as { status?: number }).status;
        if (status === 401) {
          setErrorMessage("Session expired. Please sign in again.");
          return;
        }
        if (error.message === "Invalid role selected") {
          setErrorMessage("Invalid role selected");
          return;
        }
        if (error.message === "OAuth session missing") {
          setErrorMessage("OAuth session missing");
          return;
        }
        setErrorMessage(error.message || fallbackMessage);
        return;
      }

      setErrorMessage(fallbackMessage);
    } finally {
      setIsSubmitting(null);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-md-background px-4 py-10 sm:px-6 lg:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-16 top-8 h-72 w-72 rounded-full bg-md-primary/20 blur-3xl" />
        <div className="md-glow absolute right-0 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-md-tertiary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-md-secondaryContainer/45 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">One more step</p>
          <h1 className="mt-2 text-3xl font-medium sm:text-4xl">Choose your role</h1>
          <p className="mt-2 text-base text-md-onSurfaceVariant">
            Select how you want to use Coditent so we can tailor the experience.
          </p>
        </div>

        <div className="grid w-full gap-4 md:grid-cols-2">
          {roles.map((role) => (
            <MdCard key={role.id} className="flex h-full flex-col gap-4 p-6">
              <div>
                <h2 className="text-xl font-semibold text-md-onSurface">{role.title}</h2>
                <p className="mt-2 text-sm text-md-onSurfaceVariant">{role.description}</p>
              </div>
              <MdButton
                className="mt-auto"
                disabled={Boolean(isSubmitting)}
                onClick={() => handleSelect(role.id)}
                variant="filled"
              >
                {isSubmitting === role.id ? "Finishing setup..." : role.title}
              </MdButton>
            </MdCard>
          ))}
        </div>

        {errorMessage ? (
          <div className="w-full rounded-md border border-rose-300 bg-rose-100/60 px-4 py-3 text-sm text-rose-800">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </main>
  );
}
