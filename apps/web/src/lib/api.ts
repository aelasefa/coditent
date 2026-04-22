import axios from "axios";

import { getToken, removeToken } from "@/lib/auth";
import type { Offer, Profile, Recommendation, TokenResponse, User } from "@/lib/types";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
});

api.interceptors.request.use((config: any) => {
  if (typeof window !== "undefined") {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

function extractApiErrorMessage(error: any): { title: string; description?: string } {
  if (!axios.isAxiosError(error)) {
    return { title: "Unexpected error", description: "Something went wrong. Please try again." };
  }

  const message =
    (typeof error.response?.data?.detail === "string" && error.response?.data?.detail) ||
    (typeof error.response?.data?.message === "string" && error.response?.data?.message) ||
    error.message;

  if (!error.response) {
    return {
      title: "Network error",
      description: "Unable to reach the API. Check your connection and try again.",
    };
  }

  return {
    title: `Request failed (${error.response.status})`,
    description: message,
  };
}

api.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    if (typeof window !== "undefined" && error?.response?.status === 401) {
      removeToken();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    } else if (typeof window !== "undefined") {
      const detail = extractApiErrorMessage(error);
      window.dispatchEvent(new CustomEvent("api:error", { detail }));
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
