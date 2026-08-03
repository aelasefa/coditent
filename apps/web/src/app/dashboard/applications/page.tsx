"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { LogoutButton } from "@/components/logout-button";
import { OfferCard } from "@/components/offer-card";
import { MdCard } from "@/components/ui/md-card";
import { getMyApplications, withdrawApplication } from "@/lib/api";
import type { Application, ApplicationStatus } from "@/lib/types";
import styles from "./applications.module.css";

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; tone: string }
> = {
  PENDING: { label: "Pending", tone: "tonePending" },
  REVIEWED: { label: "Reviewed", tone: "toneReviewed" },
  ACCEPTED: { label: "Accepted", tone: "toneAccepted" },
  REJECTED: { label: "Rejected", tone: "toneRejected" },
  WITHDRAWN: { label: "Withdrawn", tone: "toneWithdrawn" },
};

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

export default function MyApplicationsPage() {
  const queryClient = useQueryClient();

  const applicationsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: getMyApplications,
  });

  const withdrawMutation = useMutation({
    mutationFn: withdrawApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    },
  });

  const applications = applicationsQuery.data ?? [];

  function handleWithdraw(application: Application) {
    if (withdrawMutation.isPending) {
      return;
    }
    withdrawMutation.mutate(application.id);
  }

  return (
    <main className={styles.shell}>
      <div aria-hidden className={styles.glowLayer}>
        <div className={styles.glowLeft} />
        <div className={styles.glowRight} />
      </div>

      <div className={styles.splitLayout}>
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <p className={styles.eyebrow}>CANDIDATE WORKSPACE</p>
            <h1 className={styles.pageTitle}>My applications</h1>
            <p className={styles.pageSub}>
              Track every offer you applied to and stay on top of recruiter feedback.
            </p>
            <div className={styles.headerActions}>
              <Link href="/dashboard/recommendations" className={styles.actionLink}>
                Browse offers
              </Link>
              <Link href="/dashboard/profile" className={styles.actionLink}>
                Profile
              </Link>
              <LogoutButton />
            </div>
          </div>

          <div className={styles.statsStrip}>
            <div className={styles.statItem}>
              <span className={styles.statNum}>{applications.length}</span>
              <span className={styles.statDesc}>total applications</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statNum}>
                {applications.filter((item) => item.status === "ACCEPTED").length}
              </span>
              <span className={styles.statDesc}>accepted</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statNum}>
                {applications.filter((item) => item.status === "PENDING").length}
              </span>
              <span className={styles.statDesc}>in review</span>
            </div>
          </div>
        </aside>

        <div className={styles.rightPanel}>
          {applicationsQuery.isLoading ? (
            <div className={styles.skeletonList}>
              {[1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={styles.skeletonCard}
                  style={{ animationDelay: `${index * 120}ms` }}
                />
              ))}
            </div>
          ) : null}

          {!applicationsQuery.isLoading && applicationsQuery.isError ? (
            <MdCard className={styles.errorCard}>
              <p className={styles.errorText}>
                Could not load your applications. Please try again.
              </p>
            </MdCard>
          ) : null}

          {!applicationsQuery.isLoading &&
          !applicationsQuery.isError &&
          applications.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>✦</div>
              <h3 className={styles.emptyTitle}>No applications yet</h3>
              <p className={styles.emptyDesc}>
                Generate recommendations and apply to offers that match your profile.
              </p>
              <Link href="/dashboard/recommendations" className={styles.emptyBtn}>
                Browse recommendations
              </Link>
            </div>
          ) : null}

          {applications.map((application, index) => {
            const meta = STATUS_META[application.status];
            return (
              <div
                key={application.id}
                className={styles.resultItem}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className={styles.itemHeader}>
                  <span className={`${styles.statusPill} ${styles[meta.tone]}`}>
                    {meta.label}
                  </span>
                  <span className={styles.dateLabel}>
                    Applied {formatDate(application.applied_at)}
                  </span>
                </div>

                {application.offer ? (
                  <OfferCard offer={application.offer} />
                ) : (
                  <MdCard className="p-5">
                    <p className="text-md-onSurfaceVariant">
                      Offer is no longer available.
                    </p>
                  </MdCard>
                )}

                {application.recruiter_note ? (
                  <MdCard className={styles.noteCard}>
                    <p className={styles.noteLabel}>Recruiter note</p>
                    <p className={styles.noteText}>{application.recruiter_note}</p>
                  </MdCard>
                ) : null}

                {application.status !== "WITHDRAWN" ? (
                  <div className={styles.itemActions}>
                    <button
                      className={styles.withdrawBtn}
                      disabled={withdrawMutation.isPending}
                      onClick={() => handleWithdraw(application)}
                      type="button"
                    >
                      {withdrawMutation.isPending &&
                      withdrawMutation.variables === application.id
                        ? "Withdrawing..."
                        : "Withdraw"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
