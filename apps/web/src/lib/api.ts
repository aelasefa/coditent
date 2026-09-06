import axios from "axios";

import { removeToken } from "@/lib/auth";
import { AUTH_TOKEN_KEY } from "@/lib/constants";
import type {
  AdminActivity,
  AdminStats,
  Offer,
  Profile,
  Recommendation,
  TokenResponse,
  User,
} from "@/lib/types";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  withCredentials: true,
});

const protectedPrefixes = ["/profile", "/dashboard", "/recruiter", "/admin"];

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/register" || pathname === "/admin/login") {
    return false;
  }

  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function buildLoginRedirect(pathname: string, search: string): string {
  const nextPath = encodeURIComponent(`${pathname}${search ?? ""}`);

  if (pathname.startsWith("/admin")) {
    return `/admin/login?next=${nextPath}`;
  }

  return `/login?next=${nextPath}`;
}

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const skipRedirect = Boolean(
      (error?.config as { skipAuthRedirect?: boolean } | undefined)?.skipAuthRedirect
    );

    if (typeof window !== "undefined" && error?.response?.status === 401 && !skipRedirect) {
      removeToken();

      const { pathname, search } = window.location;
      if (isProtectedPath(pathname)) {
        const redirectTo = buildLoginRedirect(pathname, search);
        if (`${pathname}${search}` !== redirectTo) {
          window.location.href = redirectTo;
        }
      }
    }

    return Promise.reject(error);
  }
);

export async function register(payload: {
  email: string;
  password: string;
  full_name: string;
  role: "CANDIDATE" | "RECRUITER";
}): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/register", payload);
  return data;
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", payload);
  return data;
}

export async function adminLogin(payload: {
  email: string;
  password: string;
}): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", payload);
  return data;
}

export async function completeOauthRegistration(payload: {
  role: "candidate" | "recruiter";
}): Promise<TokenResponse> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/auth/oauth/complete-registration`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = (await response.json()) as
    | (TokenResponse & { access_token?: string })
    | { detail?: string };
  if (!response.ok) {
    const detail = typeof data === "object" && data && "detail" in data ? data.detail : null;
    const error = new Error(typeof detail === "string" ? detail : "Complete registration failed");
    (error as { status?: number }).status = response.status;
    throw error;
  }

  if (typeof data === "object" && data && "access_token" in data) {
    return {
      token: (data as { access_token?: string }).access_token ?? "",
      user: (data as TokenResponse).user,
    };
  }

  return data as TokenResponse;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export async function updateAvatar(avatarUrl: string): Promise<User> {
  const { data } = await api.put<User>("/auth/me/avatar", { avatar_url: avatarUrl });
  return data;
}

export async function getProfile(): Promise<Profile> {
  const { data } = await api.get<Profile>("/candidates/profile");
  return data;
}

export async function updateProfile(payload: Partial<Profile>): Promise<Profile> {
  const { data } = await api.put<Profile>("/candidates/profile", payload);
  return data;
}

export async function getOffers(): Promise<Offer[]> {
  const { data } = await api.get<{ offers: Offer[] }>("/offers");
  return data.offers;
}

export async function createOffer(payload: {
  title: string;
  company: string;
  region: string;
  field: string;
  type: "JOB" | "INTERNSHIP";
  description: string;
  requirements: string;
}): Promise<Offer> {
  const { data } = await api.post<Offer>("/offers", payload);
  return data;
}

export async function toggleOffer(offerId: string): Promise<Offer> {
  const { data } = await api.patch<Offer>(`/offers/${offerId}/toggle`);
  return data;
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const { data } = await api.get<{ recommendations: Recommendation[] }>("/recommendations");
  return data.recommendations;
}

export async function generateRecommendations(payload: {
  field: string;
  region: string;
  type: "JOB" | "INTERNSHIP";
}): Promise<Recommendation[]> {
  const { data } = await api.post<{ recommendations: Recommendation[] }>(
    "/recommendations/generate",
    payload
  );
  return data.recommendations;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>("/admin/stats");
  return data;
}

export async function getAdminUsers(): Promise<User[]> {
  const { data } = await api.get<{ users: User[] }>("/admin/users");
  return data.users;
}

export async function getAdminOffers(): Promise<Offer[]> {
  const { data } = await api.get<{ offers: Offer[] }>("/admin/offers");
  return data.offers;
}

export async function getPendingRecruiters(): Promise<User[]> {
  const { data } = await api.get<{ recruiters: User[] }>("/admin/recruiters/pending");
  return data.recruiters;
}

export async function approveRecruiter(recruiterId: string): Promise<User> {
  const { data } = await api.patch<User>(`/admin/recruiters/${recruiterId}/approve`);
  return data;
}

export async function rejectRecruiter(recruiterId: string): Promise<User> {
  const { data } = await api.patch<User>(`/admin/recruiters/${recruiterId}/reject`);
  return data;
}

export async function getAdminActivity(): Promise<AdminActivity[]> {
  const { data } = await api.get<{ activity: AdminActivity[] }>("/admin/activity");
  return data.activity;
}

export async function impersonateUser(userId: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>(`/admin/impersonate/${userId}`);
  return data;
}

export async function getCompanies(): Promise<import("@/lib/types").Company[]> {
  const { data } = await api.get<{ companies: import("@/lib/types").Company[] }>("/companies");
  return data.companies;
}

export async function createCompany(payload: { name: string; region?: string; description?: string }): Promise<import("@/lib/types").Company> {
  const { data } = await api.post<import("@/lib/types").Company>("/companies", payload);
  return data;
}

export async function joinCompany(companyId: string): Promise<import("@/lib/types").Company> {
  const { data } = await api.post<import("@/lib/types").Company>(`/companies/${companyId}/join`);
  return data;
}

export async function getRequests(): Promise<import("@/lib/types").CompanyRequest[]> {
  const { data } = await api.get<{ requests: import("@/lib/types").CompanyRequest[] }>("/requests");
  return data.requests;
}

export async function createRequest(payload: { company_id: string; recruiter_id?: string | null; message?: string }): Promise<import("@/lib/types").CompanyRequest> {
  const { data } = await api.post<import("@/lib/types").CompanyRequest>("/requests", payload);
  return data;
}

export async function updateRequestStatus(requestId: string, status: "accepted" | "rejected"): Promise<import("@/lib/types").CompanyRequest> {
  const { data } = await api.patch<import("@/lib/types").CompanyRequest>(`/requests/${requestId}`, { status });
  return data;
}

export async function sendMessage(receiverId: string, content: string): Promise<import("@/lib/types").ChatMessage> {
  const { data } = await api.post<import("@/lib/types").ChatMessage>("/chat/send", { receiver_id: receiverId, content });
  return data;
}

export async function getConversation(userId: string): Promise<import("@/lib/types").ChatMessage[]> {
  const { data } = await api.get<{ messages: import("@/lib/types").ChatMessage[] }>(`/chat/with/${userId}`);
  return data.messages;
}

export async function getConversations(): Promise<{ user: import("@/lib/types").User; last_message: string; last_at: string }[]> {
  const { data } = await api.get<{ conversations: { user: import("@/lib/types").User; last_message: string; last_at: string }[] }>("/chat/conversations");
  return data.conversations;
}

export async function inviteCompany(payload: { email: string; company_name: string }): Promise<{ detail: string }> {
  const { data } = await api.post("/invites/company/invite", payload);
  return data;
}
export async function listCompanyInvitations(): Promise<{ invitations: { id: string; email: string; company_name: string; status: string; expires_at: string }[] }> {
  const { data } = await api.get("/invites/company/invitations");
  return data;
}
export async function revokeCompanyInvitation(id: string): Promise<{ detail: string }> {
  const { data } = await api.post(`/invites/company/invitations/${id}/revoke`);
  return data;
}
export async function acceptCompanyInvite(payload: { token: string; password: string; full_name: string }): Promise<{ detail: string; company_id: string }> {
  const { data } = await api.post("/invites/company/accept", payload);
  return data;
}
export async function inviteEmployee(payload: { email: string; role: string }): Promise<{ detail: string }> {
  const { data } = await api.post("/invites/employee/invite", payload);
  return data;
}
export async function listEmployeeInvitations(): Promise<{ invitations: { id: string; email: string; role: string; status: string; expires_at: string }[] }> {
  const { data } = await api.get("/invites/employee/invitations");
  return data;
}
export async function revokeEmployeeInvitation(id: string): Promise<{ detail: string }> {
  const { data } = await api.post(`/invites/employee/invitations/${id}/revoke`);
  return data;
}
export async function acceptEmployeeInvite(payload: { token: string; password: string; full_name: string }): Promise<{ detail: string }> {
  const { data } = await api.post("/invites/employee/accept", payload);
  return data;
}
export async function getApplications(): Promise<{ applications: { id: string; status: string }[] }> {
  const { data } = await api.get("/applications");
  return data;
}
export async function getAssessments(): Promise<{ assessments: { id: string; status: string }[] }> {
  const { data } = await api.get("/assessments");
  return data;
}
export async function getAuditLogs(): Promise<{ logs: { id: string; action: string; details: string | null; created_at: string }[] }> {
  const { data } = await api.get("/audit");
  return data;
}
export async function getCompany(companyId: string): Promise<import("@/lib/types").Company> {
  const { data } = await api.get<import("@/lib/types").Company>(`/companies/${companyId}`);
  return data;
}

export async function updateCompany(
  companyId: string,
  payload: Partial<import("@/lib/types").Company>
): Promise<import("@/lib/types").Company> {
  const { data } = await api.patch<import("@/lib/types").Company>(`/companies/${companyId}`, payload);
  return data;
}

export async function getCompanySubscription(
  companyId: string
): Promise<{ company_id: string; status: string; owner_id: string | null }> {
  const { data } = await api.get(`/companies/${companyId}/subscription`);
  return data;
}

export async function getApplication(id: string): Promise<import("@/lib/types").ApplicationItem> {
  const { data } = await api.get(`/applications/${id}`);
  return data;
}

export async function updateApplicationStatus(
  id: string,
  status: string
): Promise<{ id: string; status: string }> {
  const { data } = await api.patch(`/applications/${id}`, { status });
  return data;
}

export async function getAssessment(id: string): Promise<import("@/lib/types").AssessmentItem> {
  const { data } = await api.get(`/assessments/${id}`);
  return data;
}

export async function getCompanyMembers(companyId: string): Promise<{ id: string; email: string; full_name: string; company_role: string; is_approved?: boolean }[]> {
  const { data } = await api.get(`/companies/${companyId}/members`);
  return data.members ?? data.recruiters ?? [];
}

export async function getCompanyRecruiters(companyId: string): Promise<{ id: string; email: string; full_name: string; company_role: string; avatar_url?: string | null }[]> {
  const { data } = await api.get(`/companies/${companyId}/recruiters`);
  return (data.members ?? data.recruiters ?? []) as { id: string; email: string; full_name: string; company_role: string; avatar_url?: string | null }[];
}
