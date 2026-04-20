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
    <main className="relative min-h-screen overflow-hidden bg-md-background pb-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-16 top-6 h-72 w-72 rounded-full bg-md-primary/18 blur-3xl" />
        <div className="md-glow absolute right-0 top-1/3 h-80 w-80 rounded-full bg-md-tertiary/20 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="md-fade-up flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">
              Candidate insights
            </p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Recommendations</h1>
            <p className="mt-2 text-sm text-md-onSurfaceVariant">
              Generate personalized offer recommendations by field, region, and opportunity type.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-full border border-md-outline/60 px-4 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
              href="/profile"
            >
              Profile
            </Link>
            <LogoutButton />
          </div>
        </header>

        <MdCard className="md-fade-up md-fade-delay-1 mt-6 rounded-md-2xl p-6 sm:p-7">
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={form.handleSubmit((values) => generateMutation.mutate(values))}
          >
            <MdField error={form.formState.errors.field?.message} label="Field">
              <MdInput placeholder="Informatique" {...form.register("field")} />
            </MdField>

            <MdField error={form.formState.errors.region?.message} label="Region">
              <MdInput placeholder="Casablanca" {...form.register("region")} />
            </MdField>

            <MdField error={form.formState.errors.type?.message} label="Type">
              <MdSelect {...form.register("type")}>
                <option value="JOB">JOB</option>
                <option value="INTERNSHIP">INTERNSHIP</option>
              </MdSelect>
            </MdField>

            <div className="flex items-end">
              <MdButton className="w-full" disabled={generateMutation.isPending} type="submit" variant="filled">
                {generateMutation.isPending ? "Generating..." : "Generate"}
              </MdButton>
            </div>
          </form>
        </MdCard>

        {(recommendationsQuery.isLoading || generateMutation.isPending) ? (
          <MdCard className="mt-6 rounded-md-xl p-8 text-center text-md-onSurfaceVariant">
            Loading recommendations...
          </MdCard>
        ) : null}

        {!recommendationsQuery.isLoading && recommendations.length === 0 ? (
          <MdCard className="mt-6 rounded-md-xl p-8 text-center text-md-onSurfaceVariant">
            No recommendations found yet. Try generating with different criteria.
          </MdCard>
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
