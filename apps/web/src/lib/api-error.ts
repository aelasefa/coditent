export function getApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as {
    response?: { data?: { detail?: unknown; message?: unknown } };
  })?.response?.data;
  const detail = data?.detail;

  if (typeof detail === "string" && detail) return detail;
  if (
    detail &&
    typeof detail === "object" &&
    "message" in detail &&
    typeof detail.message === "string" &&
    detail.message
  ) {
    return detail.message;
  }
  if (typeof data?.message === "string" && data.message) return data.message;
  return error instanceof Error && error.message ? error.message : fallback;
}
