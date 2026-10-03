/**
 * Local-only Company workspace preview.
 *
 * NODE_ENV is checked as well as the public flag so a production deployment
 * cannot accidentally turn this authentication bypass on.
 */
export function isCompanyPreviewEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_COMPANY_PREVIEW === "true"
  );
}
