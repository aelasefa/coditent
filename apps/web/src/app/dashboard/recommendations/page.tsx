"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { OfferCard } from "@/components/offer-card";
import { LogoutButton } from "@/components/logout-button";
import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput, MdSelect } from "@/components/ui/md-field";
import { generateRecommendations, getRecommendations } from "@/lib/api";
import styles from "./recommendations.module.css";

const criteriaSchema = z.object({
  field: z.string().min(2, "Field is required"),
  region: z.string().min(2, "Region is required"),
  type: z.enum(["JOB", "INTERNSHIP"]),
});

type CriteriaValues = z.infer<typeof criteriaSchema>;

export default function RecommendationsPage() {
  const queryClient = useQueryClient();

  const form = useForm<CriteriaValues>({
    resolver: zodResolver(criteriaSchema),
    defaultValues: {
      field: "Informatique",
      region: "Casablanca",
      type: "JOB",
    },
  });

  const recommendationsQuery = useQuery({
    queryKey: ["recommendations"],
    queryFn: getRecommendations,
  });

  const generateMutation = useMutation({
    mutationFn: generateRecommendations,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  const recommendations = recommendationsQuery.data ?? [];

  return (
    <main className={styles.shell}>
      <div aria-hidden className={styles.glowLayer}>
        <div className={styles.glowLeft} />
        <div className={styles.glowRight} />
      </div>

      <div className={styles.splitLayout}>
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <p className={styles.eyebrow}>CANDIDATE INSIGHTS</p>
            <h1 className={styles.pageTitle}>Recommendations</h1>
            <p className={styles.pageSub}>
              Generate personalized offers by field, region, and type.
            </p>
            <div className={styles.headerActions}>
              <Link href="/dashboard/profile" className={styles.actionLink}>
                Profile
              </Link>
              <LogoutButton />
            </div>
          </div>

          <div className={styles.panelDivider} />

          <form
            className={styles.filterForm}
            onSubmit={form.handleSubmit((values) => generateMutation.mutate(values))}
          >
            <p className={styles.filterLabel}>SEARCH CRITERIA</p>

            <div className={styles.filterGroup}>
              <label className={styles.fieldLabel}>Field</label>
              <input
                className={styles.filterInput}
                placeholder="e.g. Informatique"
                {...form.register("field")}
              />
              {form.formState.errors.field ? (
                <span className={styles.fieldError}>{form.formState.errors.field.message}</span>
              ) : null}
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.fieldLabel}>Region</label>
              <input
                className={styles.filterInput}
                placeholder="e.g. Casablanca"
                {...form.register("region")}
              />
              {form.formState.errors.region ? (
                <span className={styles.fieldError}>{form.formState.errors.region.message}</span>
              ) : null}
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.fieldLabel}>Opportunity Type</label>
              <div className={styles.typeToggle}>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${
                    form.watch("type") === "JOB" ? styles.typeBtnActive : ""
                  }`}
                  onClick={() => form.setValue("type", "JOB")}
                >
                  💼 Job
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${
                    form.watch("type") === "INTERNSHIP" ? styles.typeBtnActive : ""
                  }`}
                  onClick={() => form.setValue("type", "INTERNSHIP")}
                >
                  🎓 Internship
                </button>
              </div>
              <select className={styles.hiddenSelect} {...form.register("type")}>
                <option value="JOB">JOB</option>
                <option value="INTERNSHIP">INTERNSHIP</option>
              </select>
            </div>

            <button
              className={`${styles.generateBtn} ${
                generateMutation.isPending ? styles.generateBtnLoading : ""
              }`}
              disabled={generateMutation.isPending}
              type="submit"
            >
              {generateMutation.isPending ? (
                <>
                  <span className={styles.btnSpinner} />
                  Generating...
                </>
              ) : (
                <>✦ Generate recommendations</>
              )}
            </button>
          </form>

          <div className={styles.statsStrip}>
            <div className={styles.statItem}>
              <span className={styles.statNum}>{recommendations.length}</span>
              <span className={styles.statDesc}>matches found</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statNum}>
                {recommendations.length > 0
                  ? Math.round(
                      recommendations.reduce(
                        (sum, recommendation) => sum + (recommendation.score ?? recommendation.ai_score ?? 0),
                        0
                      ) / recommendations.length
                    )
                  : 0}
                %
              </span>
              <span className={styles.statDesc}>avg match score</span>
            </div>
          </div>
        </aside>

        <div className={styles.rightPanel}>
          <div className={styles.resultsHeader}>
            <p className={styles.resultsCount}>
              {recommendations.length > 0
                ? `${recommendations.length} recommendation${recommendations.length !== 1 ? "s" : ""}`
                : "No results yet"}
            </p>
            {recommendations.length > 0 ? (
              <span className={styles.resultsMeta}>Sorted by match score</span>
            ) : null}
          </div>

          {(recommendationsQuery.isLoading || generateMutation.isPending) ? (
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

          {!recommendationsQuery.isLoading && !generateMutation.isPending && recommendations.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="rgba(124,58,237,0.3)"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    className={styles.emptyRing}
                  />
                  <circle cx="24" cy="24" r="12" stroke="rgba(124,58,237,0.5)" strokeWidth="1.5" />
                  <text x="24" y="29" textAnchor="middle" fontSize="14" fill="rgba(168,85,247,0.8)">✦</text>
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>No recommendations yet</h3>
              <p className={styles.emptyDesc}>
                Set your field, region, and opportunity type, then hit Generate to surface your matches.
              </p>
              <div className={styles.emptyHints}>
                <span className={styles.emptyHint}>💼 Try "Informatique" + Casablanca</span>
                <span className={styles.emptyHint}>🎓 Or explore Internship opportunities</span>
              </div>
            </div>
          ) : null}

          {!recommendationsQuery.isLoading && recommendations.length > 0 ? (
            <div className={styles.resultsList}>
              {[...recommendations]
                .sort(
                  (a, b) =>
                    (b.score ?? b.ai_score ?? 0) - (a.score ?? a.ai_score ?? 0)
                )
                .map((recommendation, index) => (
                  <div
                    key={recommendation.id}
                    className={styles.resultItem}
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <OfferCard
                      offer={recommendation.offer}
                      reasoning={recommendation.reasoning ?? recommendation.ai_reasoning}
                      score={recommendation.score ?? recommendation.ai_score}
                    />
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
