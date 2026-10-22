export type UserRole = "CANDIDATE" | "RECRUITER" | "ADMIN" | "PLATFORM_ADMIN" | "COMPANY_USER";
export type CompanyRole = "OWNER" | "ADMIN" | "HR" | "RECRUITER" | "HIRING_MANAGER";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  is_approved: boolean;
  is_active: boolean;
  full_name: string;
  avatar_url?: string | null;
  company_id?: string | null;
  company_role?: CompanyRole | null;
}

export interface AdminMutationResult {
  id: string;
  detail: string;
  is_active?: boolean | null;
  affected_users: number;
  closed_offers: number;
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
  education_requirements?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  deadline?: string | null;
  opportunity_status?: string;
  active: boolean;
  posted_at: string;
  closed_at?: string | null;
  updated_at?: string | null;
  company_logo_url?: string | null;
}

export interface Recommendation {
  id: string;
  score?: number;
  reasoning?: string;
  ai_score?: number;
  ai_reasoning?: string;
  status?: "pending" | "processing" | "completed" | "failed" | string;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  offer: Offer;
}

export interface TokenResponse {
  token: string;
  user: User;
  trusted_device_token?: string | null;
}

export interface MfaChallengeResponse {
  require_2fa: true;
  mfa_token: string;
}

export type LoginResponse = TokenResponse | MfaChallengeResponse;

export interface TwoFactorStatus {
  is_2fa_enabled: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  otpauth_uri: string;
  qr_code: string;
}

export interface TwoFactorEnableResult {
  detail: string;
  backup_codes: string[];
}

export type OAuthHandoffResult =
  | (TokenResponse & { is_new_registration: boolean })
  | (MfaChallengeResponse & { is_new_registration: boolean });

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

export interface CompanySubscription {
  company_id: string;
  status: string;
  owner_id: string | null;
  plan: "free" | "pro" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  expires_at?: string | null;
  limits: { active_offers: number; members: number };
  usage: {
    active_offers: number;
    members: number;
    pending_invitations: number;
    reserved_members: number;
  };
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
  email_delivery_status?: "pending" | "processing" | "retry" | "sent" | "failed" | null;
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
  subscription_plan?: "free" | "pro" | "enterprise";
  subscription_status?: "trialing" | "active" | "past_due" | "canceled";
  subscription_expires_at?: string | null;
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
  read_at?: string | null;
  sender?: User;
  application_id?: string | null;
}

export interface CandidateSnapshot {
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  skills?: string | null;
  headline?: string | null;
  city?: string | null;
}

export interface CandidateProfileSnapshot {
  headline?: string | null;
  bio?: string | null;
  field_of_study?: string | null;
  university?: string | null;
  study_level?: string | null;
  skills?: string | null;
  years_of_experience?: number | null;
  city?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
}

export interface ApplicationCv {
  filename: string;
  download_url: string;
}

export interface ApplicationItem {
  id: string;
  candidate_id: string;
  opportunity_id: string;
  company_id?: string | null;
  status: "applied" | "under_review" | "shortlisted" | "interview" | "accepted" | "rejected" | string;
  stage_version: number;
  chat_enabled?: boolean;
  cv_url?: string | null;
  cv?: ApplicationCv | null;
  profile?: CandidateProfileSnapshot | null;
  cover_letter?: string | null;
  ai_score?: number | null;
  ai_report?: string | null;
  ai_status?: "pending" | "processing" | "completed" | "failed" | string;
  created_at?: string;
  updated_at?: string | null;
  interview_scheduled_at?: string | null;
  interview_notes?: string | null;
  status_changed_at?: string | null;
  candidate?: (User & CandidateSnapshot) | null;
  opportunity?: Pick<Offer, "id" | "title" | "company"> & {
    company_id?: string | null;
    company_logo_url?: string | null;
  };
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
  company_logo_url?: string | null;
  peer?: RecruitmentPeer | null;
  messages: ChatMessage[];
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface RecruitmentChatListItem {
  conversation_type?: "RECRUITMENT";
  application_id: string;
  status: string;
  chat_enabled: boolean;
  offer_id: string;
  offer_title: string;
  company_id?: string | null;
  company_name?: string | null;
  company_logo_url?: string | null;
  peer?: RecruitmentPeer | null;
  last_message?: string | null;
  last_at?: string | null;
  unread_count?: number;
}

export interface EmployeeInvitation {
  id: string;
  email: string;
  role: CompanyRole | string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" | string;
  expires_at: string;
  email_delivery_status?: "pending" | "processing" | "retry" | "sent" | "failed" | null;
}

export type FriendRelationshipState = "NONE" | "PENDING_SENT" | "PENDING_RECEIVED" | "ACCEPTED" | "BLOCKED";

export interface FriendItem {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  masked_email?: string | null;
  headline?: string | null;
  skills?: string | null;
  bio?: string | null;
  relationship_state: FriendRelationshipState;
  is_online: boolean;
  online: boolean;
  last_seen?: string | null;
}

export interface FriendRequest {
  id: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  requester_id: string;
  addressee_id: string;
  candidate: FriendItem;
  created_at: string;
  updated_at: string;
  responded_at?: string | null;
}

export interface FriendChatContext {
  conversation_type: "FRIEND";
  peer: FriendItem;
  relationship_state: FriendRelationshipState;
  can_message: boolean;
  messages: ChatMessage[];
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface ConversationSummary {
  conversation_type: "FRIEND" | "RECRUITMENT";
  conversation_id: string;
  href: string;
  peer?: FriendItem | RecruitmentPeer | null;
  badge: "Friend" | "Recruiter" | "Candidate";
  context: string;
  detail: string;
  status?: string | null;
  last_message?: string | null;
  last_at?: string | null;
  unread_count: number;
  can_message: boolean;
}

export interface MissionAttempt {
  id: string;
  mission_id: string;
  candidate_id: string;
  attempt_number: number;
  evidence: string;
  status: "submitted" | "validated" | "rejected" | string;
  score?: number | null;
  validated_skills: string[];
  feedback?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PracticeMission {
  id: string;
  field: string;
  level: "beginner" | "intermediate" | "advanced" | string;
  title: string;
  description: string;
  evidence_prompt: string;
  skills: string[];
  active: boolean;
  created_at: string;
  latest_attempt?: MissionAttempt | null;
}

export interface MissionProgress {
  completed: number;
  attempted: number;
  average_score?: number | null;
  validated_skills: string[];
  attempts: MissionAttempt[];
}

export interface MissionReviewQueueItem {
  attempt: MissionAttempt;
  mission_title: string;
  mission_skills: string[];
  candidate_name: string;
  candidate_email: string;
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

export type NotificationCategory = "application" | "interview" | "message" | "system";

export interface ProductNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  action_url?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationPage {
  notifications: ProductNotification[];
  total: number;
  unread: number;
  page: number;
  limit: number;
}

export interface NotificationPreferences {
  user_id: string;
  application_updates: boolean;
  interview_updates: boolean;
  message_updates: boolean;
  updated_at?: string | null;
}

export type InterviewRecommendation = "strong_no" | "no" | "neutral" | "yes" | "strong_yes";

export interface InterviewFeedback {
  id: string;
  application_id: string;
  reviewer_id: string;
  reviewer_name: string;
  rating: number;
  recommendation: InterviewRecommendation;
  strengths: string;
  concerns?: string | null;
  notes?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AccountDeletionRequest {
  id: string;
  status: "scheduled" | "processing" | "retry" | "completed" | "canceled";
  execute_after: string;
  requested_at: string;
  canceled_at?: string | null;
  completed_at?: string | null;
}

export interface Institution {
  id: string;
  name: string;
  domain?: string | null;
  status: "active" | "inactive";
  license_plan: "community" | "standard" | "enterprise";
  seat_limit: number;
  seats_used: number;
  license_expires_at?: string | null;
  created_at: string;
}

export interface InstitutionMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: "ADMIN" | "ADVISOR" | "STUDENT";
  status: "active" | "inactive";
  created_at: string;
}
