"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { OfferCard } from "@/components/offer-card";
import { Spinner } from "@/components/ui/spinner";
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
  const isProcessing = recommendationsQuery.isLoading || generateMutation.isPending;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Recommendations</h1>
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/dashboard">
          Back to dashboard
        </Link>
      </header>

      <form
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4"
        onSubmit={form.handleSubmit((values) => generateMutation.mutate(values))}
      >
        <div>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Field"
            {...form.register("field")}
          />
          <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.field?.message}</p>
        </div>
        <div>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Region"
            {...form.register("region")}
          />
          <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.region?.message}</p>
        </div>
        <div>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2" {...form.register("type")}>
            <option value="JOB">JOB</option>
            <option value="INTERNSHIP">INTERNSHIP</option>
          </select>
          <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.type?.message}</p>
        </div>
        <button
          className="h-10 rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={generateMutation.isPending}
          type="submit"
        >
          {generateMutation.isPending ? "Generating..." : "Generate"}
        </button>
      </form>

      {isProcessing ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <Spinner label="AI is processing your recommendations..." />
        </div>
      ) : null}

      {recommendationsQuery.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Failed to load recommendations. Please try again.
        </div>
      ) : null}

      {!recommendationsQuery.isLoading && recommendations.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          No recommendations found
        </div>
      ) : null}

        <div className="mt-6 space-y-4">
          {recommendations.map((recommendation) => (
            <OfferCard
              key={recommendation.id}
              offer={recommendation.offer}
              reasoning={recommendation.reasoning ?? recommendation.ai_reasoning}
              score={recommendation.score ?? recommendation.ai_score}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
