import axios from "axios";
import { api } from "./api";

export const supportCategories = {
  technical: "Something isn’t working",
  account: "Account or access",
  application: "Applications or hiring",
  other: "Something else",
} as const;
export const supportStatuses = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;
export type SupportStatus = keyof typeof supportStatuses;
export type SupportCategory = keyof typeof supportCategories;

export interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  category: SupportCategory;
  page_path: string | null;
  status: SupportStatus;
  response: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSupportTicket extends SupportTicket {
  reporter_name: string;
  reporter_email: string;
  reporter_role: string;
  company_name: string | null;
}

export interface SupportPage<T = SupportTicket> { tickets: T[]; total: number }

// Preserve the report draft when a session expires or the API is unavailable.
const config = { timeout: 15_000, skipAuthRedirect: true };

export async function submitSupportReport(payload: {
  request_id: string; subject: string; description: string; category: SupportCategory; page_path: string | null;
}): Promise<SupportTicket> {
  return (await api.post<SupportTicket>("/support", payload, config)).data;
}

export async function getMySupportReports(offset = 0): Promise<SupportPage> {
  return (await api.get<SupportPage>("/support", { ...config, params: { offset, limit: 10 } })).data;
}

export async function getAdminSupportReports(status: SupportStatus | "all", offset = 0): Promise<SupportPage<AdminSupportTicket>> {
  return (await api.get<SupportPage<AdminSupportTicket>>("/admin/support", {
    ...config, params: { status: status === "all" ? undefined : status, offset, limit: 20 },
  })).data;
}

export async function updateSupportReport(id: string, status: SupportStatus, response: string): Promise<SupportTicket> {
  return (await api.patch<SupportTicket>(`/admin/support/${id}`, { status, response }, config)).data;
}

export function supportErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return "Your session has expired. Sign in again, then retry.";
    if (error.response?.status === 429) return "You’ve sent several reports recently. Please wait a minute and retry.";
    if (error.response?.status === 403) return "You don’t have permission to access these reports.";
  }
  return "We couldn’t reach support. Your text is still here. Please try again.";
}
