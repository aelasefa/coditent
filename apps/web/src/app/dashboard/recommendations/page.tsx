"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";

import { OfferCard } from "@/components/offer-card";
import { LogoutButton } from "@/components/logout-button";
import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput, MdSelect } from "@/components/ui/md-field";
import { generateRecommendations, getRecommendations, getProfile } from "@/lib/api";
import { api } from "@/lib/api";
import styles from "./recommendations.module.css";

const criteriaSchema = z.object({
  field: z.string().min(2, "Field is required"),
  region: z.string().min(2, "Region is required"),
  type: z.enum(["JOB", "INTERNSHIP"]),
});

type CriteriaValues = z.infer<typeof criteriaSchema>;

export default function RecommendationsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const form = useForm<CriteriaValues>({
    resolver: zodResolver(criteriaSchema),
    defaultValues: { field: "Informatique", region: "Casablanca", type: "JOB" },
  });

  const recommendationsQuery = useQuery({ queryKey: ["recommendations"], queryFn: getRecommendations });
  const generateMutation = useMutation({ mutationFn: generateRecommendations, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }) });
  const recommendations = recommendationsQuery.data ?? [];
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile });

  // Load existing applications to mark Applied
  const appsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/applications");
        return data.applications as any[];
      } catch { return []; }
    },
  });
  const appliedOfferIds = new Set((appsQuery.data ?? []).map((a: any) => a.opportunity_id));

  async function handleApply(offerId: string) {
    setApplyMsg(null);
    if (applied.has(offerId) || appliedOfferIds.has(offerId)) {
      setApplyMsg("Already applied to this offer.");
      return;
    }
    // Use existing profile CV if available
    const cvUrl = (profileQuery.data as any)?.cv_url || undefined;
    try {
      await api.post("/applications", { opportunity_id: offerId, cv_url: cvUrl });
      setApplied((s) => new Set([...s, offerId]));
      setApplyMsg("Application submitted successfully — status: Applied");
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map((x: any) => x.msg).join("; ") : typeof detail === "string" ? detail : e?.message || "Failed";
      if (msg.toLowerCase().includes("already applied")) setApplied((s) => new Set([...s, offerId]));
      setApplyMsg(msg.includes("Already applied") ? "Already applied to this offer." : msg.includes("inactive") ? "Offer is closed." : msg.includes("401") || msg.includes("auth") ? "Session expired, please login." : msg);
    }
  }

  return (
    <main className={styles.shell}>
      <div aria-hidden className={styles.glowLayer}><div className={styles.glowLeft} /><div className={styles.glowRight} /></div>
      <div className={styles.splitLayout}>
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <p className={styles.eyebrow}>CANDIDATE INSIGHTS</p>
            <h1 className={styles.pageTitle}>Recommendations</h1>
            <p className={styles.pageSub}>Generate personalized offers by field, region, and type.</p>
            <div className={styles.headerActions}><Link href="/dashboard/profile" className={styles.actionLink}>Profile</Link><LogoutButton /></div>
          </div>
          <div className={styles.panelDivider} />
          <form className={styles.filterForm} onSubmit={form.handleSubmit((v) => generateMutation.mutate(v))}>
            <p className={styles.filterLabel}>SEARCH CRITERIA</p>
            <div className={styles.filterGroup}><label className={styles.fieldLabel}>Field</label><input className={styles.filterInput} placeholder="e.g. Informatique" {...form.register("field")} />{form.formState.errors.field && <span className={styles.fieldError}>{form.formState.errors.field.message}</span>}</div>
            <div className={styles.filterGroup}><label className={styles.fieldLabel}>Region</label><input className={styles.filterInput} placeholder="e.g. Casablanca" {...form.register("region")} />{form.formState.errors.region && <span className={styles.fieldError}>{form.formState.errors.region.message}</span>}</div>
            <div className={styles.filterGroup}><label className={styles.fieldLabel}>Opportunity Type</label>
              <div className={styles.typeToggle}>
                <button type="button" className={`${styles.typeBtn} ${form.watch("type") === "JOB" ? styles.typeBtnActive : ""}`} onClick={() => form.setValue("type", "JOB")}>💼 Job</button>
                <button type="button" className={`${styles.typeBtn} ${form.watch("type") === "INTERNSHIP" ? styles.typeBtnActive : ""}`} onClick={() => form.setValue("type", "INTERNSHIP")}>🎓 Internship</button>
              </div>
              <select className={styles.hiddenSelect} {...form.register("type")}><option value="JOB">JOB</option><option value="INTERNSHIP">INTERNSHIP</option></select>
            </div>
            <button className={`${styles.generateBtn} ${generateMutation.isPending ? styles.generateBtnLoading : ""}`} disabled={generateMutation.isPending} type="submit">{generateMutation.isPending ? <><span className={styles.btnSpinner} />Generating...</> : <>✦ Generate recommendations</>}</button>
          </form>
          <div className={styles.statsStrip}>
            <div className={styles.statItem}><span className={styles.statNum}>{recommendations.length}</span><span className={styles.statDesc}>matches found</span></div>
            <div className={styles.statItem}><span className={styles.statNum}>{recommendations.length > 0 ? Math.round(recommendations.reduce((s, r) => s + (r.score ?? r.ai_score ?? 0), 0) / recommendations.length) : 0}%</span><span className={styles.statDesc}>avg match score</span></div>
          </div>
        </aside>

        <div className={styles.rightPanel}>
          <div className={styles.resultsHeader}>
            <p className={styles.resultsCount}>{recommendations.length > 0 ? `${recommendations.length} recommendation${recommendations.length !== 1 ? "s" : ""}` : "No results yet"}</p>
            {recommendations.length > 0 && <span className={styles.resultsMeta}>Sorted by match score</span>}
          </div>
          {applyMsg && <div className="mb-4 rounded border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-300">{applyMsg}</div>}
          {(recommendationsQuery.isLoading || generateMutation.isPending) ? (
            <div className={styles.skeletonList}>{[1, 2, 3].map((i) => <div key={i} className={styles.skeletonCard} style={{ animationDelay: `${i * 120}ms` }} />)}</div>
          ) : null}
          {!recommendationsQuery.isLoading && !generateMutation.isPending && recommendations.length === 0 ? (
            <div className={styles.emptyState}><div className={styles.emptyIcon}><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="rgba(124,58,237,0.3)" strokeWidth="1.5" strokeDasharray="4 3" /><circle cx="24" cy="24" r="12" stroke="rgba(124,58,237,0.5)" strokeWidth="1.5" /><text x="24" y="29" textAnchor="middle" fontSize="14" fill="rgba(168,85,247,0.8)">✦</text></svg></div><h3 className={styles.emptyTitle}>No recommendations yet</h3><p className={styles.emptyDesc}>Set your field, region, and opportunity type, then hit Generate to surface your matches.</p></div>
          ) : null}
          {!recommendationsQuery.isLoading && recommendations.length > 0 ? (
            <div className={styles.resultsList}>
              {[...recommendations].sort((a, b) => (b.score ?? b.ai_score ?? 0) - (a.score ?? a.ai_score ?? 0)).map((rec, index) => {
                const isApplied = applied.has(rec.offer.id) || appliedOfferIds.has(rec.offer.id);
                const isPendingScore = (rec.score ?? rec.ai_score) === 0 && (rec.reasoning ?? rec.ai_reasoning)?.includes("en attente");
                return (
                  <div key={rec.id} className={styles.resultItem} style={{ animationDelay: `${index * 80}ms` }}>
                    <OfferCard offer={rec.offer} reasoning={rec.reasoning ?? rec.ai_reasoning} score={rec.score ?? rec.ai_score} />
                    {isPendingScore && <p className="mt-2 text-xs text-amber-400">Scoring pending — {rec.ai_reasoning}</p>}
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setSelected(rec)} className="rounded-full border border-zinc-700 px-4 py-1.5 text-xs">View Offer</button>
                      <button disabled={isApplied || !rec.offer.active} onClick={() => handleApply(rec.offer.id)} className={`rounded-full px-4 py-1.5 text-xs font-medium ${isApplied ? "bg-zinc-700 text-zinc-300" : rec.offer.active ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-500"}`}>{isApplied ? "Applied ✓" : rec.offer.active ? "Apply Now" : "Closed"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold">{selected.offer.title}</h2>
            <p className="text-sm text-zinc-400">{selected.offer.company} — {selected.offer.region} · {selected.offer.field} · {selected.offer.type}</p>
            <p className="mt-4 text-sm">{selected.offer.description}</p>
            <p className="mt-2 text-sm"><span className="font-medium">Requirements:</span> {selected.offer.requirements}</p>
            {selected.reasoning && <p className="mt-3 rounded border border-zinc-800 bg-zinc-800/50 p-3 text-sm">{selected.reasoning}</p>}
            <div className="mt-6 flex gap-2">
              <button onClick={() => { handleApply(selected.offer.id); setSelected(null); }} disabled={applied.has(selected.offer.id) || appliedOfferIds.has(selected.offer.id) || !selected.offer.active} className="rounded-full bg-violet-600 px-4 py-2 text-sm text-white disabled:bg-zinc-700">{applied.has(selected.offer.id) || appliedOfferIds.has(selected.offer.id) ? "Applied ✓" : "Apply Now"}</button>
              <button onClick={() => setSelected(null)} className="rounded-full border border-zinc-700 px-4 py-2 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
