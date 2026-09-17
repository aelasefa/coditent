export type UserRole = "CANDIDATE" | "RECRUITER" | "ADMIN" | "PLATFORM_ADMIN" | "COMPANY_USER";
export type CompanyRole = "OWNER" | "ADMIN" | "HR" | "RECRUITER" | "HIRING_MANAGER";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  is_approved: boolean;
  full_name: string;
  avatar_url?: string | null;
  company_id?: string | null;
  company_role?: CompanyRole | null;
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
  cv_url?: string | null;
  updated_at: string | null;
}

export interface CVExtracted {
  skills: string[];
  years_of_experience: number | null;
  field_of_study: string | null;
  university: string | null;
  study_level: "BAC" | "LICENCE" | "MASTER" | "DOCTORAT" | null;
  city: string | null;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
}

export interface CVParseResult {
  extracted: CVExtracted;
  warnings: string[];
  has_cv: boolean;
  meta?: Record<string, number>;
}

export interface CVMeta {
  cv_url: string;
  filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
}

export interface Offer {
  id: string;
  recruiter_id: string;
  company_id?: string | null;
  created_by?: string | null;
  responsible_hr_id?: string | null;
  title: string;
  company: string;
  region: string;
  field: string;
  type: "JOB" | "INTERNSHIP";
  description: string;
  requirements: string;
  location?: string | null;
  work_mode?: string | null;
  required_skills?: string | null;
  required_experience?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  deadline?: string | null;
  opportunity_status?: string;
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

export interface OAuthHandoffResult extends TokenResponse {
  is_new_registration: boolean;
}

export interface OAuthRegistrationHandoff {
  handoff_code: string;
  attempt_id: string;
  provider: string;
}

export interface OnboardingState {
  search_timeline: string | null;
  desired_opportunity_type: string | null;
  desired_fields: string[];
  desired_location: string | null;
  preferred_work_mode: string | null;
  career_stage: string | null;
  onboarding_step: number;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
}

export interface AdminStats {
  total_users: number;
  total_candidates: number;
  total_recruiters: number;
  total_offers: number;
  total_companies: number;
  active_companies: number;
  pending_company_invitations: number;
  expired_company_invitations: number;
  active_offers: number;
}

export interface CompanyInvitation {
  id: string;
  email: string;
  company_name: string;
  contact_name?: string | null;
  contact_role?: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  company_id?: string | null;
  invited_by_email?: string | null;
}

export interface AdminActivity {
  id: string;
  action: string;
  admin_id: string;
  admin_email: string;
  target_user_id: string | null;
  target_user_email: string | null;
  details: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  region: string | null;
  description: string | null;
  logo_url?: string | null;
  industry?: string | null;
  location?: string | null;
  website?: string | null;
  company_size?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status?: string;
  owner_id?: string | null;
  created_at: string;
  recruiter_count?: number;
}

export interface CompanyRequest {
  id: string;
  candidate_id: string;
  company_id: string;
  recruiter_id: string | null;
  message: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  candidate?: User;
  company?: Company;
  recruiter?: User | null;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  sender?: User;
}

export interface ApplicationItem {
  id: string;
  candidate_id: string;
  opportunity_id: string;
  company_id?: string | null;
  status: "applied" | "under_review" | "shortlisted" | "assessment_required" | "assessment_completed" | "interview" | "accepted" | "rejected" | string;
  chat_enabled?: boolean;
  cv_url?: string | null;
  cover_letter?: string | null;
  ai_score?: number | null;
  ai_report?: string | null;
  ai_status?: "pending" | "processing" | "completed" | "failed" | string;
  created_at?: string;
  updated_at?: string | null;
  candidate?: User;
  opportunity?: Pick<Offer, "id" | "title" | "company">;
}

export interface RecruitmentPeer {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  role?: string | null;
  company_role?: string | null;
}

export interface RecruitmentChatContext {
  application_id: string;
  status: string;
  chat_enabled: boolean;
  offer_id: string;
  offer_title: string;
  company_id?: string | null;
  company_name?: string | null;
  peer?: RecruitmentPeer | null;
  messages: ChatMessage[];
}

export interface RecruitmentChatListItem {
  application_id: string;
  status: string;
  chat_enabled: boolean;
  offer_id: string;
  offer_title: string;
  company_name?: string | null;
  peer?: RecruitmentPeer | null;
  last_message?: string | null;
  last_at?: string | null;
}

export interface AssessmentItem {
  id: string;
  application_id?: string;
  candidate_id?: string;
  created_by?: string | null;
  title?: string;
  description?: string | null;
  status: "pending" | "in_progress" | "completed" | "evaluated" | string;
  score?: number | null;
  report?: string | null;
  created_at?: string;
  candidate?: User;
  application?: ApplicationItem;
}

export interface EmployeeInvitation {
  id: string;
  email: string;
  role: CompanyRole | string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" | string;
  expires_at: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  details: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  company_role: CompanyRole | string;
  is_approved?: boolean;
}
