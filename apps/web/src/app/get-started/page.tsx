"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { OnboardingOption } from "@/components/onboarding/onboarding-option";
import { Logo } from "@/components/ui/logo";
import {
  completeCandidateOnboarding,
  getCandidateOnboarding,
  getMe,
  saveCandidateOnboardingStep,
} from "@/lib/api";
import { removeToken } from "@/lib/auth";
import { categories } from "@/lib/categories";
import type { OnboardingState } from "@/lib/types";
import styles from "./get-started.module.css";

const TOTAL_STEPS = 6;

const singleOptions = {
  1: [
    ["ASAP", "ASAP", "I’m ready to actively apply now."],
    ["WITHIN_3_MONTHS", "Within 3 months", "I’m preparing for my next move."],
    ["WITHIN_6_MONTHS", "Within 6 months", "I’m planning ahead."],
    ["PASSIVELY_BROWSING", "Passively browsing", "I’m open to the right opportunity."],
  ],
  2: [
    ["INTERNSHIP", "Internship", "Build experience and learn on the job."],
    ["JOB", "Full-time job", "Find your next long-term role."],
    ["BOTH", "Both", "Show me internships and full-time roles."],
  ],
  4: [
    ["Casablanca", "Casablanca", ""],
    ["Rabat", "Rabat", ""],
    ["Marrakech", "Marrakech", ""],
    ["Other in Morocco", "Elsewhere in Morocco", ""],
  ],
  5: [
    ["ON_SITE", "On-site", "Work primarily from the workplace."],
    ["HYBRID", "Hybrid", "Combine on-site and remote work."],
    ["REMOTE", "Remote", "Work primarily from home or anywhere."],
    ["NO_PREFERENCE", "No preference", "Keep every work setup open."],
  ],
  6: [
    ["STUDENT", "Student", "Currently studying."],
    ["RECENT_GRADUATE", "Recent graduate", "Recently completed my studies."],
    ["ZERO_TO_ONE", "0–1 year", "Starting my professional career."],
    ["ONE_TO_THREE", "1–3 years", "Building early career experience."],
    ["THREE_TO_FIVE", "3–5 years", "Growing into experienced roles."],
    ["FIVE_PLUS", "5+ years", "Bringing established experience."],
  ],
} as const;

const copy = {
  1: ["How soon are you looking?", "We’ll tune recommendations to your current search."],
  2: ["What kind of opportunity do you want?", "Choose the path that fits your next move."],
  3: ["Which fields interest you?", "Select every area you’d like to explore."],
  4: ["Where would you like to work?", "Choose the Moroccan location that best fits your search."],
  5: ["How do you prefer to work?", "We’ll prioritize opportunities with the right setup."],
  6: ["Where are you in your career?", "This helps us recommend the right level of opportunity."],
} as const;

type Answers = {
  1: string;
  2: string;
  3: string[];
  4: string;
  5: string;
  6: string;
};

const emptyAnswers: Answers = { 1: "", 2: "", 3: [], 4: "", 5: "", 6: "" };

function answersFromState(state: OnboardingState): Answers {
  return {
    1: state.search_timeline ?? "",
    2: state.desired_opportunity_type ?? "",
    3: state.desired_fields,
    4: state.desired_location ?? "",
    5: state.preferred_work_mode ?? "",
    6: state.career_stage ?? "",
  };
}

function readableError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (!error.response) return "We could not reach CODITENT. Check your connection and try again.";
  }
  return "We could not save your answer. Please try again.";
}

export default function GetStartedPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getMe(), getCandidateOnboarding()])
      .then(([user, state]) => {
        if (!active) return;
        if (user.role !== "CANDIDATE") {
          router.replace(user.role === "COMPANY_USER" ? "/company/invitations" : user.role.includes("ADMIN") ? "/admin" : "/recruiter");
          return;
        }
        if (state.onboarding_completed) {
          router.replace("/dashboard");
          return;
        }
        setAnswers(answersFromState(state));
        setStep(Math.min(7, Math.max(1, state.onboarding_step)));
        setIsLoading(false);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(readableError(requestError));
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [router]);

  const fieldOptions = useMemo(
    () => categories.filter((category) => category.slug !== "all"),
    []
  );
  const currentAnswer = step <= TOTAL_STEPS ? answers[step as keyof Answers] : null;
  const canContinue = Array.isArray(currentAnswer) ? currentAnswer.length > 0 : Boolean(currentAnswer);

  function selectSingle(value: string) {
    setAnswers((current) => ({ ...current, [step]: value }));
    setError(null);
  }

  function toggleField(value: string) {
    setAnswers((current) => ({
      ...current,
      3: current[3].includes(value)
        ? current[3].filter((field) => field !== value)
        : [...current[3], value],
    }));
    setError(null);
  }

  async function continueFlow() {
    if (step > TOTAL_STEPS || !canContinue || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const state = await saveCandidateOnboardingStep(step, answers[step as keyof Answers]);
      setAnswers(answersFromState(state));
      setStep(Math.min(7, state.onboarding_step));
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function finish() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const completedState = await completeCandidateOnboarding();
      queryClient.setQueryData(["candidate-onboarding"], completedState);
      router.push("/dashboard/recommendations");
    } catch (requestError) {
      setError(readableError(requestError));
      setIsSaving(false);
    }
  }

  function logout() {
    removeToken();
    router.push("/login");
  }

  const heading = step <= TOTAL_STEPS ? copy[step as keyof typeof copy][0] : "You’re all set";
  const subtitle = step <= TOTAL_STEPS
    ? copy[step as keyof typeof copy][1]
    : "Your preferences are ready. We can now surface opportunities that fit your goals.";

  return (
    <main className={styles.page}>
      <div className={styles.background} aria-hidden="true" />
      <div className={styles.content}>
        <a href="#onboarding-question" className={styles.skipLink}>Skip to onboarding question</a>
        <header className={styles.header}>
          <Link href="/" aria-label="Coditent home"><Logo size="md" /></Link>
          <button type="button" className={styles.logout} onClick={logout}>Sign out</button>
        </header>

        <section className={styles.shell} aria-busy={isLoading || isSaving}>
          <div className={styles.panel}>
            {isLoading ? (
              <div className={styles.loading} role="status">Loading your progress…</div>
            ) : (
              <>
                <div className={styles.progressRow}>
                  <span>{step <= TOTAL_STEPS ? `Step ${step} of ${TOTAL_STEPS}` : "Profile ready"}</span>
                  <span>{step <= TOTAL_STEPS ? `${Math.round((step / TOTAL_STEPS) * 100)}%` : "100%"}</span>
                </div>
                <div className={styles.progressTrack} aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (step / TOTAL_STEPS) * 100)}%` }} />
                </div>

                <div key={step} className={styles.question} id="onboarding-question">
                  <p className={styles.eyebrow}>Shape your next opportunity</p>
                  <h1 className={styles.title}>{heading}</h1>
                  <p className={styles.subtitle}>{subtitle}</p>

                  {step <= TOTAL_STEPS ? (
                    <div
                      className={step === 3 || step === 6 ? styles.optionGrid : styles.options}
                      role={step === 3 ? "group" : "radiogroup"}
                      aria-label={heading}
                    >
                      {step === 3
                        ? fieldOptions.map((category) => (
                            <OnboardingOption
                              key={category.slug}
                              title={category.label}
                              description={category.desc}
                              selected={answers[3].includes(category.slug)}
                              multiple
                              onSelect={() => toggleField(category.slug)}
                            />
                          ))
                        : singleOptions[step as keyof typeof singleOptions].map(([value, label, description]) => (
                            <OnboardingOption
                              key={value}
                              title={label}
                              description={description || undefined}
                              selected={answers[step as keyof Answers] === value}
                              onSelect={() => selectSingle(value)}
                            />
                          ))}
                    </div>
                  ) : (
                    <div className={styles.summary}>
                      <p><span>Opportunity</span>{answers[2] === "BOTH" ? "Internships and full-time roles" : answers[2] === "JOB" ? "Full-time roles" : "Internships"}</p>
                      <p><span>Location</span>{answers[4]}</p>
                      <p><span>Fields</span>{answers[3].map((slug) => fieldOptions.find((item) => item.slug === slug)?.label ?? slug).join(", ")}</p>
                    </div>
                  )}
                </div>

                {error ? <p className={styles.error} role="alert">{error}</p> : null}

                <div className={styles.actions}>
                  {step > 1 && step <= TOTAL_STEPS ? (
                    <button type="button" className={styles.backButton} onClick={() => { setStep((value) => value - 1); setError(null); }} disabled={isSaving}>
                      Back
                    </button>
                  ) : <span />}
                  {step <= TOTAL_STEPS ? (
                    <button type="button" className={styles.continueButton} onClick={continueFlow} disabled={!canContinue || isSaving}>
                      {isSaving ? "Saving…" : step === TOTAL_STEPS ? "Review choices" : "Continue"}<span aria-hidden> →</span>
                    </button>
                  ) : (
                    <button type="button" className={styles.continueButton} onClick={finish} disabled={isSaving}>
                      {isSaving ? "Preparing…" : "Find opportunities"}<span aria-hidden> →</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
