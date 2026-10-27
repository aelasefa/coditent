import { AUTH_TOKEN_KEY } from "@/lib/constants";

const LEGACY_AUTH_TOKEN_KEY = "coditent_token";
const TRUSTED_DEVICE_KEY = "coditent_trusted_device";

export function saveToken(_token: string): void {
  void _token;
  // Browser sessions are carried exclusively by the Secure, HttpOnly cookie
  // issued by the API. Keep this compatibility hook while callers migrate.
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  }
}

export function getToken(): string | null {
  return null;
}

export function saveTrustedDevice(_token: string): void {
  void _token;
  // Trusted-device credentials are HttpOnly cookies and are never exposed to JS.
  if (typeof window !== "undefined") localStorage.removeItem(TRUSTED_DEVICE_KEY);
}

export function getTrustedDevice(): string | null {
  return null;
}

export function removeTrustedDevice(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TRUSTED_DEVICE_KEY);
}

export function removeToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  // Remove only the legacy JavaScript-created cookie. HttpOnly session cookies
  // are cleared by the backend logout endpoint.
  document.cookie = `${LEGACY_AUTH_TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
}

export function isLoggedIn(): boolean {
  // HttpOnly cookies are intentionally unreadable from browser JavaScript.
  return false;
}
