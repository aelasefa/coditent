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
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create Offer</h1>
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/recruiter">
          Back to recruiter
        </Link>
      </header>

      <form
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Title"
              {...form.register("title")}
            />
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.title?.message}</p>
          </div>
          <div>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Company"
              {...form.register("company")}
            />
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.company?.message}</p>
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
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Field"
              {...form.register("field")}
            />
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.field?.message}</p>
          </div>
          <div>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2" {...form.register("type")}>
              <option value="JOB">JOB</option>
              <option value="INTERNSHIP">INTERNSHIP</option>
            </select>
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.type?.message}</p>
          </div>
        </div>

        <div>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Description"
            {...form.register("description")}
          />
          <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.description?.message}</p>
        </div>

        <div>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Requirements"
            {...form.register("requirements")}
          />
          <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.requirements?.message}</p>
        </div>

        {createMutation.isError ? (
          <p className="text-sm text-red-600">Offer creation failed. Please check your inputs and retry.</p>
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
