export type UserRole = "CANDIDATE" | "RECRUITER";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export interface Profile {
  id: string;
  user_id: string;
  city: string | null;
  phone: string | null;
  headline: string | null;
  bio: string | null;
  field_of_study: string | null;
  university: string | null;
  study_level: "BAC" | "LICENCE" | "MASTER" | "DOCTORAT" | null;
  skills: string | null;
  years_of_experience: number | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  updated_at: string | null;
}

export interface Offer {
  id: string;
  recruiter_id: string;
  title: string;
  company: string;
  region: string;
  field: string;
  type: "JOB" | "INTERNSHIP";
  description: string;
  requirements: string;
  active: boolean;
  posted_at: string;
}

export interface Recommendation {
  id: string;
  score?: number;
  reasoning?: string;
  ai_score?: number;
  ai_reasoning?: string;
  offer: Offer;
}

export interface TokenResponse {
  token: string;
  user: User;
}
