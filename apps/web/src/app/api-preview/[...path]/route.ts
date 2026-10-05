import { NextResponse } from "next/server";
import { isCompanyPreviewEnabled } from "@/lib/company-preview";
import type {
  ApplicationItem,
  AssessmentItem,
  AuditLogItem,
  ChatMessage,
  Company,
  EmployeeInvitation,
  Offer,
  RecruitmentChatListItem,
  TeamMember,
  User,
} from "@/lib/types";

type RouteContext = { params: { path: string[] } };
type JsonRecord = Record<string, unknown>;

const companyId = "preview-company";
const ownerId = "preview-owner";
const now = "2026-10-03T09:30:00.000Z";

const previewUser: User = {
  id: ownerId,
  email: "owner@atlaslabs.dev",
  role: "COMPANY_USER",
  is_approved: true,
  full_name: "Ilyas Preview",
  avatar_url: null,
  company_id: companyId,
  company_role: "OWNER",
};

let previewCompany: Company = {
  id: companyId,
  name: "Atlas Labs",
  region: "Morocco",
  description: "A product studio building thoughtful tools for modern teams.",
  logo_url: null,
  industry: "Software & Technology",
  location: "Casablanca",
  website: "https://atlaslabs.example",
  company_size: "51-200",
  contact_email: "hello@atlaslabs.dev",
  contact_phone: "+212 5 20 00 00 00",
  status: "active",
  owner_id: ownerId,
  created_at: "2025-11-18T10:00:00.000Z",
  recruiter_count: 5,
};

let previewOffers: Offer[] = [
  {
    id: "offer-product-engineer",
    recruiter_id: ownerId,
    company_id: companyId,
    responsible_hr_id: "preview-hr",
    title: "Senior Product Engineer",
    company: "Atlas Labs",
    region: "Casablanca · Hybrid",
    field: "Software Engineering",
    type: "JOB",
    description: "Build reliable product experiences with a small cross-functional team.",
    requirements: "Strong TypeScript skills, product judgment, and clear communication.",
    active: true,
    posted_at: "2026-09-24T09:00:00.000Z",
    company_logo_url: null,
  },
  {
    id: "offer-designer",
    recruiter_id: ownerId,
    company_id: companyId,
    responsible_hr_id: "preview-recruiter",
    title: "Product Designer",
    company: "Atlas Labs",
    region: "Rabat · Remote",
    field: "Product Design",
    type: "JOB",
    description: "Own end-to-end product design for a growing recruiting platform.",
    requirements: "Portfolio showing systems thinking, research, and polished UI craft.",
    active: true,
    posted_at: "2026-09-27T11:00:00.000Z",
    company_logo_url: null,
  },
  {
    id: "offer-data-intern",
    recruiter_id: ownerId,
    company_id: companyId,
    responsible_hr_id: "preview-hr",
    title: "Data & AI Intern",
    company: "Atlas Labs",
    region: "Casablanca",
    field: "Data Science",
    type: "INTERNSHIP",
    description: "Explore ranking quality and turn experiments into useful product insights.",
    requirements: "Python fundamentals, curiosity, and comfort explaining analytical work.",
    active: true,
    posted_at: "2026-09-29T14:00:00.000Z",
    company_logo_url: null,
  },
  {
    id: "offer-growth",
    recruiter_id: ownerId,
    company_id: companyId,
    responsible_hr_id: null,
    title: "Growth Operations Lead",
    company: "Atlas Labs",
    region: "Remote",
    field: "Operations",
    type: "JOB",
    description: "Design the operating rhythm behind our next stage of growth.",
    requirements: "B2B operations experience and a strong bias for measurable outcomes.",
    active: false,
    posted_at: "2026-09-18T08:30:00.000Z",
    company_logo_url: null,
  },
];

function candidate(
  id: string,
  fullName: string,
  email: string,
  headline: string,
  skills: string,
  city: string,
): User & { headline: string; skills: string; city: string } {
  return {
    id,
    email,
    role: "CANDIDATE",
    is_approved: true,
    full_name: fullName,
    avatar_url: null,
    headline,
    skills,
    city,
  };
}

let previewApplications: ApplicationItem[] = [
  {
    id: "app-amina",
    candidate_id: "candidate-amina",
    opportunity_id: "offer-product-engineer",
    company_id: companyId,
    status: "applied",
    chat_enabled: false,
    ai_score: 88,
    ai_status: "completed",
    ai_report: "Strong TypeScript depth and evidence of product ownership.",
    cover_letter: "I enjoy turning complex workflows into calm, reliable products.",
    created_at: "2026-10-02T08:10:00.000Z",
    candidate: candidate("candidate-amina", "Amina El Mansouri", "amina@example.dev", "Senior frontend engineer", "TypeScript, React, Design systems", "Casablanca"),
    profile: { headline: "Senior frontend engineer", skills: "TypeScript, React, Design systems", years_of_experience: 6, city: "Casablanca", university: "ENSIAS" },
    opportunity: { id: "offer-product-engineer", title: "Senior Product Engineer", company: "Atlas Labs", company_id: companyId, company_logo_url: null },
  },
  {
    id: "app-youssef",
    candidate_id: "candidate-youssef",
    opportunity_id: "offer-product-engineer",
    company_id: companyId,
    status: "under_review",
    chat_enabled: true,
    ai_score: 81,
    ai_status: "completed",
    ai_report: "Solid full-stack profile with strong collaboration signals.",
    created_at: "2026-10-01T12:20:00.000Z",
    candidate: candidate("candidate-youssef", "Youssef Amrani", "youssef@example.dev", "Full-stack engineer", "Python, FastAPI, React", "Rabat"),
    profile: { headline: "Full-stack engineer", skills: "Python, FastAPI, React", years_of_experience: 4, city: "Rabat" },
    opportunity: { id: "offer-product-engineer", title: "Senior Product Engineer", company: "Atlas Labs", company_id: companyId, company_logo_url: null },
  },
  {
    id: "app-sara",
    candidate_id: "candidate-sara",
    opportunity_id: "offer-designer",
    company_id: companyId,
    status: "shortlisted",
    chat_enabled: true,
    ai_score: 92,
    ai_status: "completed",
    ai_report: "Excellent systems portfolio with clear research-to-interface decisions.",
    created_at: "2026-09-30T10:40:00.000Z",
    candidate: candidate("candidate-sara", "Sara Benali", "sara@example.dev", "Product designer", "Figma, Research, Prototyping", "Marrakesh"),
    profile: { headline: "Product designer", skills: "Figma, Research, Prototyping", years_of_experience: 5, city: "Marrakesh", portfolio_url: "https://example.dev" },
    opportunity: { id: "offer-designer", title: "Product Designer", company: "Atlas Labs", company_id: companyId, company_logo_url: null },
  },
  {
    id: "app-omar",
    candidate_id: "candidate-omar",
    opportunity_id: "offer-data-intern",
    company_id: companyId,
    status: "assessment_required",
    chat_enabled: true,
    ai_score: 76,
    ai_status: "completed",
    created_at: "2026-09-29T16:00:00.000Z",
    candidate: candidate("candidate-omar", "Omar Idrissi", "omar@example.dev", "Data science student", "Python, Pandas, SQL", "Casablanca"),
    profile: { headline: "Data science student", skills: "Python, Pandas, SQL", years_of_experience: 1, city: "Casablanca", university: "UM6P" },
    opportunity: { id: "offer-data-intern", title: "Data & AI Intern", company: "Atlas Labs", company_id: companyId, company_logo_url: null },
  },
  {
    id: "app-lina",
    candidate_id: "candidate-lina",
    opportunity_id: "offer-designer",
    company_id: companyId,
    status: "interview",
    chat_enabled: true,
    ai_score: 86,
    ai_status: "completed",
    created_at: "2026-09-28T09:15:00.000Z",
    candidate: candidate("candidate-lina", "Lina Chraibi", "lina@example.dev", "UX designer", "UX research, Product strategy", "Tangier"),
    profile: { headline: "UX designer", skills: "UX research, Product strategy", years_of_experience: 4, city: "Tangier" },
    opportunity: { id: "offer-designer", title: "Product Designer", company: "Atlas Labs", company_id: companyId, company_logo_url: null },
  },
  {
    id: "app-mehdi",
    candidate_id: "candidate-mehdi",
    opportunity_id: "offer-product-engineer",
    company_id: companyId,
    status: "accepted",
    chat_enabled: true,
    ai_score: 90,
    ai_status: "completed",
    created_at: "2026-09-21T15:45:00.000Z",
    candidate: candidate("candidate-mehdi", "Mehdi Alaoui", "mehdi@example.dev", "Platform engineer", "Node.js, PostgreSQL, AWS", "Casablanca"),
    profile: { headline: "Platform engineer", skills: "Node.js, PostgreSQL, AWS", years_of_experience: 7, city: "Casablanca" },
    opportunity: { id: "offer-product-engineer", title: "Senior Product Engineer", company: "Atlas Labs", company_id: companyId, company_logo_url: null },
  },
];

const previewAssessments: AssessmentItem[] = [
  { id: "assessment-omar", application_id: "app-omar", candidate_id: "candidate-omar", title: "Data analysis exercise", description: "Explore a recruiting funnel dataset and explain two actionable insights.", status: "pending", score: null, created_at: "2026-10-01T09:00:00.000Z" },
  { id: "assessment-sara", application_id: "app-sara", candidate_id: "candidate-sara", title: "Product critique", description: "Audit a candidate onboarding flow and propose an improved experience.", status: "evaluated", score: 91, report: "Clear prioritization, accessible interaction choices, and strong rationale.", created_at: "2026-09-29T10:00:00.000Z" },
  { id: "assessment-youssef", application_id: "app-youssef", candidate_id: "candidate-youssef", title: "API design challenge", description: "Design a small, secure API for a recruitment workflow.", status: "completed", score: 84, report: "Good domain modeling and pragmatic error handling.", created_at: "2026-09-28T13:00:00.000Z" },
];

const previewAudit: AuditLogItem[] = [
  { id: "audit-1", action: "APPLICATION_STAGE_UPDATED", details: "Lina moved to interview", created_at: "2026-10-03T08:40:00.000Z" },
  { id: "audit-2", action: "OFFER_CREATED", details: "Data & AI Intern published", created_at: "2026-10-02T15:20:00.000Z" },
  { id: "audit-3", action: "EMPLOYEE_INVITED", details: "Recruiter invitation sent", created_at: "2026-10-02T10:10:00.000Z" },
  { id: "audit-4", action: "COMPANY_UPDATED", details: "Company profile updated", created_at: "2026-10-01T16:00:00.000Z" },
];

let previewMembers: TeamMember[] = [
  { id: ownerId, full_name: "Ilyas Preview", email: "owner@atlaslabs.dev", avatar_url: null, company_role: "OWNER", is_approved: true },
  { id: "preview-admin", full_name: "Nadia Zahra", email: "nadia@atlaslabs.dev", avatar_url: null, company_role: "ADMIN", is_approved: true },
  { id: "preview-hr", full_name: "Salma Tazi", email: "salma@atlaslabs.dev", avatar_url: null, company_role: "HR", is_approved: true },
  { id: "preview-recruiter", full_name: "Anas Berrada", email: "anas@atlaslabs.dev", avatar_url: null, company_role: "RECRUITER", is_approved: true },
  { id: "preview-manager", full_name: "Meryem Kabbaj", email: "meryem@atlaslabs.dev", avatar_url: null, company_role: "HIRING_MANAGER", is_approved: true },
];

const previewInvitations: EmployeeInvitation[] = [
  { id: "invite-1", email: "new.hr@atlaslabs.dev", role: "HR", status: "PENDING", expires_at: "2026-10-06T10:00:00.000Z" },
  { id: "invite-2", email: "manager@atlaslabs.dev", role: "HIRING_MANAGER", status: "ACCEPTED", expires_at: "2026-10-04T10:00:00.000Z" },
  { id: "invite-3", email: "recruiter@atlaslabs.dev", role: "RECRUITER", status: "EXPIRED", expires_at: "2026-09-28T10:00:00.000Z" },
];

const previewChats: RecruitmentChatListItem[] = [
  {
    application_id: "app-youssef",
    status: "under_review",
    chat_enabled: true,
    offer_id: "offer-product-engineer",
    offer_title: "Senior Product Engineer",
    company_id: companyId,
    company_name: "Atlas Labs",
    peer: { id: "candidate-youssef", full_name: "Youssef Amrani", avatar_url: null, role: "CANDIDATE" },
    last_message: "Tomorrow at 10 works perfectly for me.",
    last_at: "2026-10-03T08:55:00.000Z",
  },
  {
    application_id: "app-lina",
    status: "interview",
    chat_enabled: true,
    offer_id: "offer-designer",
    offer_title: "Product Designer",
    company_id: companyId,
    company_name: "Atlas Labs",
    peer: { id: "candidate-lina", full_name: "Lina Chraibi", avatar_url: null, role: "CANDIDATE" },
    last_message: "Thank you — I have attached the case study notes.",
    last_at: "2026-10-02T17:20:00.000Z",
  },
];

const previewMessages: Record<string, ChatMessage[]> = {
  "app-youssef": [
    { id: "msg-1", sender_id: ownerId, receiver_id: "candidate-youssef", content: "Hi Youssef, we would like to schedule a short technical conversation.", created_at: "2026-10-02T15:00:00.000Z", read_at: "2026-10-02T15:10:00.000Z" },
    { id: "msg-2", sender_id: "candidate-youssef", receiver_id: ownerId, content: "Tomorrow at 10 works perfectly for me.", created_at: "2026-10-03T08:55:00.000Z", read_at: now },
  ],
  "app-lina": [
    { id: "msg-3", sender_id: ownerId, receiver_id: "candidate-lina", content: "Your interview is confirmed. Feel free to share any supporting material.", created_at: "2026-10-02T16:45:00.000Z", read_at: "2026-10-02T17:00:00.000Z" },
    { id: "msg-4", sender_id: "candidate-lina", receiver_id: ownerId, content: "Thank you — I have attached the case study notes.", created_at: "2026-10-02T17:20:00.000Z", read_at: now },
  ],
};

let previewSupportReports: Array<{
  id: string;
  subject: string;
  description: string;
  category: "technical" | "account" | "application" | "other";
  page_path: string | null;
  status: "open" | "in_progress" | "resolved";
  response: string | null;
  created_at: string;
  updated_at: string;
}> = [];

function enabled(): boolean {
  return isCompanyPreviewEnabled();
}

function unavailable() {
  return NextResponse.json({ detail: "Company preview is available only in local development." }, { status: 404 });
}

function pathKey(context: RouteContext): string {
  return context.params.path.join("/");
}

async function jsonBody(request: Request): Promise<JsonRecord> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
  } catch {
    return {};
  }
}

function findOffer(id: string): Offer | undefined {
  return previewOffers.find((offer) => offer.id === id);
}

export async function GET(_request: Request, context: RouteContext) {
  if (!enabled()) return unavailable();
  const key = pathKey(context);
  const parts = context.params.path;

  if (key === "auth/me") return NextResponse.json(previewUser);
  if (key === "auth/2fa/status") return NextResponse.json({ is_2fa_enabled: false });
  if (key === "offers/mine") return NextResponse.json({ offers: previewOffers });
  if (key === "applications") return NextResponse.json({ applications: previewApplications });
  if (key === "assessments") return NextResponse.json({ assessments: previewAssessments });
  if (key === "audit") return NextResponse.json({ logs: previewAudit });
  if (key === "invites/employee/invitations") return NextResponse.json({ invitations: previewInvitations });
  if (key === "chat/recruitment") return NextResponse.json({ recruitment_chats: previewChats });
  if (key === "support") return NextResponse.json({ tickets: previewSupportReports, total: previewSupportReports.length });

  if (parts[0] === "chat" && parts[1] === "recruitment" && parts[2]) {
    const app = previewApplications.find((item) => item.id === parts[2]);
    const offer = app ? findOffer(app.opportunity_id) : undefined;
    const chat = previewChats.find((item) => item.application_id === parts[2]);
    if (!app || !offer || !chat) return NextResponse.json({ detail: "Conversation not found" }, { status: 404 });
    return NextResponse.json({
      application_id: app.id,
      status: app.status,
      chat_enabled: true,
      offer_id: offer.id,
      offer_title: offer.title,
      company_id: companyId,
      company_name: previewCompany.name,
      peer: chat.peer,
      messages: previewMessages[app.id] ?? [],
    });
  }

  if (parts[0] === "companies" && parts[1] === companyId) {
    if (parts[2] === "members") return NextResponse.json({ members: previewMembers });
    if (parts[2] === "recruiters") return NextResponse.json({ recruiters: previewMembers, members: previewMembers });
    if (parts[2] === "subscription") return NextResponse.json({ company_id: companyId, status: "active", owner_id: ownerId });
    if (!parts[2]) return NextResponse.json(previewCompany);
  }

  return NextResponse.json({ detail: `No preview response for GET /${key}` }, { status: 404 });
}

export async function POST(request: Request, context: RouteContext) {
  if (!enabled()) return unavailable();
  const key = pathKey(context);
  const parts = context.params.path;

  if (key === "support") {
    const body = await jsonBody(request);
    const timestamp = new Date().toISOString();
    const report = {
      id: String(body.request_id ?? `support-preview-${Date.now()}`),
      subject: String(body.subject ?? "Preview issue"),
      description: String(body.description ?? "Preview support report details."),
      category: (body.category === "account" || body.category === "application" || body.category === "other" ? body.category : "technical") as "technical" | "account" | "application" | "other",
      page_path: typeof body.page_path === "string" ? body.page_path : null,
      status: "open" as const,
      response: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    previewSupportReports = [report, ...previewSupportReports.filter((item) => item.id !== report.id)];
    return NextResponse.json(report, { status: 201 });
  }

  if (key === "offers") {
    const body = await jsonBody(request);
    const offer: Offer = {
      id: `offer-preview-${Date.now()}`,
      recruiter_id: ownerId,
      company_id: companyId,
      responsible_hr_id: null,
      title: String(body.title ?? "New preview role"),
      company: String(body.company ?? previewCompany.name),
      region: String(body.region ?? "Remote"),
      field: String(body.field ?? "General"),
      type: body.type === "INTERNSHIP" ? "INTERNSHIP" : "JOB",
      description: String(body.description ?? "Preview description"),
      requirements: String(body.requirements ?? "Preview requirements"),
      active: true,
      posted_at: new Date().toISOString(),
      company_logo_url: null,
    };
    previewOffers = [offer, ...previewOffers];
    return NextResponse.json(offer, { status: 201 });
  }

  if (key === "invites/employee/invite") return NextResponse.json({ detail: "Preview invitation created" }, { status: 201 });
  if (key === "invites/employee/resend" || key.endsWith("/resend")) return NextResponse.json({ detail: "Preview invitation resent", invitation_id: "preview-invite" });
  if (key.endsWith("/revoke")) return NextResponse.json({ detail: "Preview invitation revoked" });
  if (key === "auth/2fa/setup") return NextResponse.json({ secret: "PREVIEWMODE123456", otpauth_uri: "otpauth://totp/Coditent:preview", qr_code: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" });
  if (key === "auth/2fa/enable") return NextResponse.json({ detail: "Preview 2FA enabled", backup_codes: ["PREV-0001", "PREV-0002", "PREV-0003", "PREV-0004"] });
  if (key === "auth/2fa/disable") return NextResponse.json({ detail: "Preview 2FA disabled" });

  if (parts[0] === "companies" && parts[1] === companyId && parts[2] === "logo") {
    return NextResponse.json({ logo_url: "preview/logo.png", filename: "preview-logo.png", content_type: "image/png", size_bytes: 1024 }, { status: 201 });
  }

  if (parts[0] === "chat" && parts[1] === "recruitment" && parts[2]) {
    if (parts[3] === "read") {
      const ids = (previewMessages[parts[2]] ?? []).filter((message) => message.receiver_id === ownerId).map((message) => message.id);
      return NextResponse.json({ message_ids: ids, read_at: now });
    }
    const body = await jsonBody(request);
    const message: ChatMessage = {
      id: `msg-preview-${Date.now()}`,
      sender_id: ownerId,
      receiver_id: previewChats.find((chat) => chat.application_id === parts[2])?.peer?.id ?? "preview-candidate",
      content: String(body.content ?? "Preview message"),
      created_at: new Date().toISOString(),
      read_at: null,
    };
    previewMessages[parts[2]] = [...(previewMessages[parts[2]] ?? []), message];
    return NextResponse.json(message, { status: 201 });
  }

  return NextResponse.json({ detail: "Preview action completed" });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!enabled()) return unavailable();
  const parts = context.params.path;
  const body = await jsonBody(request);

  if (parts[0] === "applications" && parts[1]) {
    previewApplications = previewApplications.map((item) => item.id === parts[1] ? { ...item, status: String(body.status ?? item.status) } : item);
    const application = previewApplications.find((item) => item.id === parts[1]);
    return application ? NextResponse.json(application) : NextResponse.json({ detail: "Application not found" }, { status: 404 });
  }

  if (parts[0] === "offers" && parts[1]) {
    const offer = findOffer(parts[1]);
    if (!offer) return NextResponse.json({ detail: "Offer not found" }, { status: 404 });
    if (parts[2] === "toggle") offer.active = !offer.active;
    if (parts[2] === "responsible-hr") offer.responsible_hr_id = String(body.responsible_hr_id ?? "") || null;
    return NextResponse.json(offer);
  }

  if (parts[0] === "companies" && parts[1] === companyId && parts[2] === "members" && parts[3]) {
    previewMembers = previewMembers.map((member) => member.id === parts[3] ? { ...member, company_role: String(body.company_role ?? member.company_role) } : member);
    return NextResponse.json(previewMembers.find((member) => member.id === parts[3]));
  }

  if (parts[0] === "companies" && parts[1] === companyId && !parts[2]) {
    previewCompany = { ...previewCompany, ...body } as Company;
    return NextResponse.json(previewCompany);
  }

  return NextResponse.json({ detail: "Preview update completed" });
}

export async function PUT(request: Request, context: RouteContext) {
  if (!enabled()) return unavailable();
  const parts = context.params.path;
  const body = await jsonBody(request);

  if (parts[0] === "offers" && parts[1]) {
    const index = previewOffers.findIndex((offer) => offer.id === parts[1]);
    if (index < 0) return NextResponse.json({ detail: "Offer not found" }, { status: 404 });
    previewOffers[index] = { ...previewOffers[index], ...body } as Offer;
    return NextResponse.json(previewOffers[index]);
  }

  return NextResponse.json({ detail: "Preview update completed" });
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!enabled()) return unavailable();
  const parts = context.params.path;

  if (parts[0] === "offers" && parts[1]) {
    previewOffers = previewOffers.filter((offer) => offer.id !== parts[1]);
    return new NextResponse(null, { status: 204 });
  }

  if (parts[0] === "companies" && parts[1] === companyId && parts[2] === "members" && parts[3]) {
    previewMembers = previewMembers.filter((member) => member.id !== parts[3]);
    return new NextResponse(null, { status: 204 });
  }

  if (parts[0] === "companies" && parts[1] === companyId && parts[2] === "logo") {
    previewCompany = { ...previewCompany, logo_url: null };
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
