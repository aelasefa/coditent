"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput, MdSelect, MdTextArea } from "@/components/ui/md-field";
import { createOffer } from "@/lib/api";

const offerSchema = z.object({
  title: z.string().min(2, "Title is required"),
  company: z.string().min(2, "Company is required"),
  region: z.string().min(2, "Region is required"),
  field: z.string().min(2, "Field is required"),
  type: z.enum(["JOB", "INTERNSHIP"]),
  description: z.string().min(10, "Description is too short"),
  requirements: z.string().min(10, "Requirements are too short"),
});

type OfferValues = z.infer<typeof offerSchema>;

export default function NewOfferPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm<OfferValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      title: "",
      company: "",
      region: "",
      field: "",
      type: "JOB",
      description: "",
      requirements: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: createOffer,
    onSuccess: () => {
      router.push("/recruiter");
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;

        if (
          error.response?.status === 403 &&
          typeof detail === "string" &&
          detail.toLowerCase().includes("pending admin approval")
        ) {
          router.push("/pending-approval");
          return;
        }

        setErrorMessage(typeof detail === "string" ? detail : "Offer creation failed.");
        return;
      }

      setErrorMessage("Offer creation failed.");
    },
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-md-background pb-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-20 top-8 h-80 w-80 rounded-full bg-md-primary/18 blur-3xl" />
        <div className="md-glow absolute right-0 top-1/3 h-96 w-96 rounded-full bg-md-tertiary/20 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="md-fade-up flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">
              Recruiter workspace
            </p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Create offer</h1>
            <p className="mt-2 text-sm text-md-onSurfaceVariant">
              Publish a new opportunity with all key context in one pass.
            </p>
          </div>

          <Link
            className="inline-flex h-9 items-center justify-center rounded-full border border-md-outline/60 px-4 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
            href="/recruiter"
          >
            Back to recruiter
          </Link>
        </header>

        <MdCard className="md-fade-up md-fade-delay-1 mt-6 rounded-md-2xl p-6 sm:p-8">
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => {
              setErrorMessage(null);
              createMutation.mutate(values);
            })}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MdField error={form.formState.errors.title?.message} label="Title">
                <MdInput placeholder="Frontend Engineer" {...form.register("title")} />
              </MdField>

              <MdField error={form.formState.errors.company?.message} label="Company">
                <MdInput placeholder="Coditent" {...form.register("company")} />
              </MdField>

              <MdField error={form.formState.errors.region?.message} label="Region">
                <MdInput placeholder="Casablanca" {...form.register("region")} />
              </MdField>

              <MdField error={form.formState.errors.field?.message} label="Field">
                <MdInput placeholder="Software Engineering" {...form.register("field")} />
              </MdField>

              <MdField error={form.formState.errors.type?.message} label="Type">
                <MdSelect {...form.register("type")}>
                  <option value="JOB">JOB</option>
                  <option value="INTERNSHIP">INTERNSHIP</option>
                </MdSelect>
              </MdField>
            </div>

            <MdField error={form.formState.errors.description?.message} label="Description">
              <MdTextArea
                placeholder="Describe mission, scope, and expected outcomes."
                rows={5}
                {...form.register("description")}
              />
            </MdField>

            <MdField error={form.formState.errors.requirements?.message} label="Requirements">
              <MdTextArea
                placeholder="List skills, seniority, and practical expectations."
                rows={5}
                {...form.register("requirements")}
              />
            </MdField>

            {errorMessage ? (
              <div className="rounded-md border border-rose-300 bg-rose-100/60 px-4 py-3 text-sm text-rose-800">
                {errorMessage}
              </div>
            ) : null}

            <MdButton disabled={createMutation.isPending} type="submit" variant="filled">
              {createMutation.isPending ? "Saving..." : "Create offer"}
            </MdButton>
          </form>
        </MdCard>
      </div>
    </main>
  );
}
