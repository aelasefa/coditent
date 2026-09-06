import type { CompanyRole, User } from "@/lib/types";

const PERMISSIONS: Record<string, Set<CompanyRole>> = {
  view_company: new Set(["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"]),
  edit_company: new Set(["OWNER", "ADMIN"]),
  invite_employees: new Set(["OWNER", "ADMIN"]),
  change_employee_roles: new Set(["OWNER", "ADMIN"]),
  remove_employees: new Set(["OWNER", "ADMIN"]),
  create_offers: new Set(["OWNER", "ADMIN", "RECRUITER"]),
  edit_offers: new Set(["OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"]),
  delete_offers: new Set(["OWNER", "ADMIN"]),
  view_applications: new Set(["OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"]),
  view_assessments: new Set(["OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"]),
  company_analytics: new Set(["OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"]),
  manage_subscription: new Set(["OWNER"]),
};

export function can(user: User | null, action: string): boolean {
  if (!user?.company_role) return false;
  return PERMISSIONS[action]?.has(user.company_role as CompanyRole) ?? false;
}

export function hasCompanyRole(user: User | null, roles: CompanyRole[]): boolean {
  if (!user?.company_role) return false;
  return roles.includes(user.company_role as CompanyRole);
}

export function isCompanyUser(user: User | null): boolean {
  return user?.role === "COMPANY_USER";
}
export function isPlatformAdmin(user: User | null): boolean {
  return user?.role === "PLATFORM_ADMIN";
}
export function isCandidate(user: User | null): boolean {
  return user?.role === "CANDIDATE";
}
