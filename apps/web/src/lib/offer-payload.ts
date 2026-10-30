export type OfferType = "JOB" | "INTERNSHIP";
export type WorkMode = "remote" | "hybrid" | "on-site";

export interface CreateOfferPayload {
  title: string;
  company?: string | null;
  region: string;
  field: string;
  type: OfferType;
  description: string;
  requirements: string;
  location?: string | null;
  work_mode?: WorkMode | null;
  required_skills?: string | null;
  required_experience?: string | null;
  education_requirements?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  deadline?: string | null;
  opportunity_status?: "draft" | "active";
}

export interface UpdateOfferPayload {
  title?: string;
  company?: string | null;
  region?: string;
  field?: string;
  type?: OfferType;
  description?: string;
  requirements?: string;
  location?: string | null;
  work_mode?: WorkMode | null;
  required_skills?: string | null;
  required_experience?: string | null;
  education_requirements?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  deadline?: string | null;
}

export interface JobFormState {
  title: string;
  region: string;
  field: string;
  type: OfferType;
  description: string;
  requirements: string;
  salaryMin: string;
  salaryMax: string;
  equity: string;
  workMode: WorkMode | "";
  /** Preserves compensation text from jobs created before structured salary fields. */
  legacyCompensation: string;
}

export interface DescriptionDetails {
  description: string;
  equity: string;
  legacyCompensation: string;
}

const SALARY_LIMIT = 1_000_000_000;

export function extractDescriptionDetails(value: string): DescriptionDetails {
  let equity = "";
  let legacyCompensation = "";
  const descriptionLines: string[] = [];

  for (const line of value.split("\n")) {
    const compensationMatch = line.match(/^Compensation:\s*(.*)$/i);
    if (compensationMatch) {
      legacyCompensation = compensationMatch[1].trim();
      continue;
    }
    const equityMatch = line.match(/^Equity:\s*(.*)$/i);
    if (equityMatch) {
      equity = equityMatch[1].trim();
      continue;
    }
    descriptionLines.push(line);
  }

  return {
    description: descriptionLines.join("\n").trim(),
    equity,
    legacyCompensation,
  };
}

export function composeOfferDescription(
  description: string,
  equity: string,
  legacyCompensation: string,
): string {
  const existing = extractDescriptionDetails(description);
  const clean = existing.description;
  const preservedEquity = equity.trim() || existing.equity;
  const preservedCompensation = legacyCompensation.trim() || existing.legacyCompensation;
  const metadata = [
    preservedCompensation && `Compensation: ${preservedCompensation}`,
    preservedEquity && `Equity: ${preservedEquity}`,
  ].filter(Boolean);
  return `${clean}${metadata.length ? `\n\n${metadata.join("\n")}` : ""}`;
}

function parseSalary(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a whole number`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > SALARY_LIMIT) {
    throw new Error(`${label} must be between 0 and ${SALARY_LIMIT.toLocaleString("en-US")}`);
  }
  return parsed;
}

function structuredFields(form: JobFormState) {
  const salaryMin = parseSalary(form.salaryMin, "Minimum salary");
  const salaryMax = parseSalary(form.salaryMax, "Maximum salary");
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    throw new Error("Minimum salary must be less than or equal to maximum salary");
  }
  return {
    title: form.title.trim(),
    region: form.region.trim(),
    field: form.field.trim(),
    type: form.type,
    description: composeOfferDescription(form.description, form.equity, form.legacyCompensation),
    requirements: form.requirements.trim(),
    work_mode: form.workMode || null,
    salary_min: salaryMin,
    salary_max: salaryMax,
  };
}

export function buildCreateOfferPayload(form: JobFormState): CreateOfferPayload {
  return structuredFields(form);
}

export function buildUpdateOfferPayload(form: JobFormState): UpdateOfferPayload {
  return structuredFields(form);
}

export function formatSalaryRange(minimum?: number | null, maximum?: number | null): string {
  if (minimum == null && maximum == null) return "";
  if (minimum != null && maximum != null) return `${minimum.toLocaleString()} – ${maximum.toLocaleString()}`;
  if (minimum != null) return `From ${minimum.toLocaleString()}`;
  return `Up to ${Number(maximum).toLocaleString()}`;
}
