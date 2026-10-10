/** Presentation only; recruitment access is still enforced by the API. */
export function chatWorkspaceIdentity(role?: string) {
  const isCompany = role === "COMPANY_USER" || role === "RECRUITER";
  return {
    isCompany,
    findPeopleHref: isCompany ? "/company/candidates" : "/dashboard/friends",
    conversationDescription: isCompany
      ? "Keep recruitment conversations in one place."
      : "Keep friend and application conversations in one place.",
  };
}
