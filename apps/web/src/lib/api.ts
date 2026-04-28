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
  const { data } = await api.post<TokenResponse>("/auth/admin/login", payload);
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
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
