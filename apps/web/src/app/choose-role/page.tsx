"use client";

import { useRouter } from "next/navigation";
import axios from "axios";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { completeOauthRegistration } from "@/lib/api";
import { saveToken } from "@/lib/auth";

const roles = [
  {
    id: "candidate" as const,
    title: "Continue as Candidate",
    description: "Build your profile and get matched to roles.",
  },
  {
    id: "recruiter" as const,
    title: "Continue as Recruiter",
    description: "Post roles, review talent, and manage pipeline.",
  },
];

export default function ChooseRolePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSelect(role: "candidate" | "recruiter") {
    if (isSubmitting) return;
    setIsSubmitting(role);
    setErrorMessage(null);
    try {
      const data = await completeOauthRegistration({ role });
      if (window.opener && !window.opener.closed) {
        router.replace(
          `/auth/sso/callback?registration=new#token=${encodeURIComponent(data.token)}`
        );
        return;
      }
      saveToken(data.token);
      if (data.user.role === "RECRUITER") {
        if (!data.user.is_approved) {
          router.push("/pending-approval");
          return;
        }
        router.push("/recruiter");
        return;
      }
      router.push("/get-started");
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
      setErrorMessage(error instanceof Error ? error.message || "Unable to complete registration." : "Unable to complete registration.");
    } finally {
      setIsSubmitting(null);
    }
  }

  return (
    <AuthLayout title="Choose your role" subtitle="Select how you use CODITENT so workspace opens correctly.">
      <div className="grid gap-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardContent>
              <p className="ct-card-title">{role.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
              <Button className="mt-3 w-full" loading={isSubmitting === role.id} disabled={Boolean(isSubmitting)} onClick={() => handleSelect(role.id)}>
                {role.title}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {errorMessage ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {errorMessage}
        </p>
      ) : null}
    </AuthLayout>
  );
}
