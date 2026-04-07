"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { OfferCard } from "@/components/offer-card";
import { generateRecommendations, getRecommendations } from "@/lib/api";

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
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recommendations</h1>
        <Link className="text-sm text-slate-600" href="/dashboard">
          Back to dashboard
        </Link>
      </header>

      <form
        className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-4"
        onSubmit={form.handleSubmit((values) => generateMutation.mutate(values))}
      >
        <input
          className="rounded border border-slate-300 px-3 py-2"
          placeholder="Field"
          {...form.register("field")}
        />
        <input
          className="rounded border border-slate-300 px-3 py-2"
          placeholder="Region"
          {...form.register("region")}
        />
        <select className="rounded border border-slate-300 px-3 py-2" {...form.register("type")}>
          <option value="JOB">JOB</option>
          <option value="INTERNSHIP">INTERNSHIP</option>
        </select>
        <button
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={generateMutation.isPending}
          type="submit"
        >
          Generate
        </button>
      </form>

      {(recommendationsQuery.isLoading || generateMutation.isPending) ? (
        <div className="rounded border border-slate-200 bg-white p-6 text-center">Loading...</div>
      ) : null}

      {!recommendationsQuery.isLoading && recommendations.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white p-6 text-center text-slate-600">
          No recommendations found
        </div>
      ) : null}

      <div className="space-y-3">
        {recommendations.map((recommendation) => (
          <OfferCard
            key={recommendation.id}
            offer={recommendation.offer}
            reasoning={recommendation.reasoning ?? recommendation.ai_reasoning}
            score={recommendation.score ?? recommendation.ai_score}
          />
        ))}
      </div>
    </main>
  );
}
