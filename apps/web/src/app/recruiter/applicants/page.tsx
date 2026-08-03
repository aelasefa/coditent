"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { LogoutButton } from "@/components/logout-button";
import { CandidateProfilePanel } from "@/components/candidate-profile-panel";
import { MdCard } from "@/components/ui/md-card";
import { getOffers, updateApplicationStatus } from "@/lib/api";
import type { Application, ApplicationStatus, Offer } from "@/lib/types";
import styles from "./applicants.module.css";

const STATUS_FLOW: ApplicationStatus[] = [
  "PENDING",
  "REVIEWED",
  "ACCEPTED",
  "REJECTED",
];

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDING: "Pending",
  REVIEWED: "Reviewed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

interface ApplicantsByOffer {
  offer: Offer;
  applications: Application[];
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export default function RecruiterApplicantsPage() {
  const queryClient = useQueryClient();
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  const offersQuery = useQuery({
    queryKey: ["offers"],
    queryFn: getOffers,
  });

  const myOffers = useMemo(
    () => (offersQuery.data ?? []).slice(0, 50),
    [offersQuery.data]
  );

  useEffect(() => {
    if (selectedOfferId === null && myOffers.length > 0) {
      setSelectedOfferId(myOffers[0].id);
    }
  }, [selectedOfferId, myOffers]);

  return (
    <main className={styles.shell}>
      <div aria-hidden className={styles.glowLayer}>
        <div className={styles.glowLeft} />
        <div className={styles.glowRight} />
      </div>

      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>RECRUITER WORKSPACE</p>
            <h1 className={styles.title}>Applicants</h1>
            <p className={styles.subtitle}>
              Review candidates who applied to your offers and update their status.
            </p>
            <div className={styles.headerActions}>
              <Link href="/recruiter" className={styles.actionLink}>
                My offers
              </Link>
              <Link href="/recruiter/offers/new" className={styles.actionLink}>
                New offer
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>

        {offersQuery.isLoading ? (
          <MdCard className={styles.noticeCard}>Loading your offers...</MdCard>
        ) : null}

        {!offersQuery.isLoading && offersQuery.isError ? (
          <MdCard className={styles.noticeCard}>
            Could not load offers right now. Please retry.
          </MdCard>
        ) : null}

        {!offersQuery.isLoading && !offersQuery.isError && myOffers.length === 0 ? (
          <MdCard className={styles.noticeCard}>
            You have not published any offers yet.{" "}
            <Link href="/recruiter/offers/new" className={styles.inlineLink}>
              Publish your first offer
            </Link>
            .
          </MdCard>
        ) : null}

        {myOffers.length > 0 ? (
          <OffersTabs
            offers={myOffers}
            selectedOfferId={selectedOfferId}
            onSelect={(id) => setSelectedOfferId(id)}
          />
        ) : null}

        {selectedOfferId ? (
          <ApplicantsPanel offerId={selectedOfferId} />
        ) : null}
      </div>
    </main>
  );

  function OffersTabs({
    offers,
    selectedOfferId,
    onSelect,
  }: {
    offers: Offer[];
    selectedOfferId: string | null;
    onSelect: (id: string) => void;
  }) {
    return (
      <div className={styles.offersTabs}>
        {offers.map((offer) => {
          const isActive = offer.id === selectedOfferId;
          return (
            <button
              key={offer.id}
              className={`${styles.offerTab} ${isActive ? styles.offerTabActive : ""}`}
              onClick={() => onSelect(offer.id)}
              type="button"
            >
              <span className={styles.offerTabTitle}>{offer.title}</span>
              <span className={styles.offerTabMeta}>
                {offer.company} · {offer.region}
              </span>
              {!offer.active ? (
                <span className={styles.offerTabPaused}>Paused</span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  function ApplicantsPanel({ offerId }: { offerId: string }) {
    const applicationsQuery = useQuery({
      queryKey: ["offer-applications", offerId],
      queryFn: () => import("@/lib/api").then((m) => m.getOfferApplications(offerId)),
      enabled: Boolean(offerId),
    });

    const updateMutation = useMutation({
      mutationFn: ({
        applicationId,
        status,
      }: {
        applicationId: string;
        status: ApplicationStatus;
      }) => updateApplicationStatus(applicationId, { status }),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["offer-applications", offerId],
        });
      },
    });

    const applications = applicationsQuery.data ?? [];

    return (
      <div className={styles.panel}>
        {applicationsQuery.isLoading ? (
          <MdCard className={styles.noticeCard}>Loading applicants...</MdCard>
        ) : null}

        {!applicationsQuery.isLoading &&
        applicationsQuery.isError ? (
          <MdCard className={styles.noticeCard}>
            Could not load applicants for this offer.
          </MdCard>
        ) : null}

        {!applicationsQuery.isLoading &&
        !applicationsQuery.isError &&
        applications.length === 0 ? (
          <MdCard className={styles.noticeCard}>
            No applicants for this offer yet.
          </MdCard>
        ) : null}

        {applications.map((application, index) => {
          const candidate = application.candidate;
          return (
            <div
              key={application.id}
              className={styles.applicantRow}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className={styles.applicantTop}>
                <div className={styles.applicantAvatar}>
                  {candidate?.full_name
                    ? candidate.full_name
                        .split(/\s+/)
                        .map((part) => part.charAt(0))
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : "?"}
                </div>
                <div className={styles.applicantInfo}>
                  <p className={styles.applicantName}>
                    {candidate?.full_name ?? "Unknown candidate"}
                  </p>
                  <p className={styles.applicantEmail}>{candidate?.email ?? "—"}</p>
                  {application.cover_letter ? (
                    <p className={styles.coverLetter}>{application.cover_letter}</p>
                  ) : null}
                  <p className={styles.appliedDate}>
                    Applied {formatDate(application.applied_at)}
                  </p>
                  {application.recruiter_note ? (
                    <p className={styles.notePreview}>
                      <span>Note:</span> {application.recruiter_note}
                    </p>
                  ) : null}
                </div>
                <div className={styles.statusActions}>
                  {STATUS_FLOW.map((status) => {
                    const isActive = application.status === status;
                    return (
                      <button
                        key={status}
                        className={`${styles.statusBtn} ${
                          isActive ? styles[`statusBtn_${status}`] : ""
                        }`}
                        disabled={
                          updateMutation.isPending || application.status === status
                        }
                        onClick={() =>
                          updateMutation.mutate({
                            applicationId: application.id,
                            status,
                          })
                        }
                        type="button"
                      >
                        {STATUS_LABEL[status]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <details className={styles.profileDetails}>
                <summary className={styles.profileToggle}>
                  View candidate profile
                </summary>
                <CandidateProfilePanel
                  profile={application.candidate_profile}
                  candidateName={candidate?.full_name}
                  candidateEmail={candidate?.email}
                />
              </details>
            </div>
          );
        })}
      </div>
    );
  }
}
