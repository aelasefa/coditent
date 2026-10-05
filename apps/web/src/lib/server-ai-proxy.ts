import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 16_000;
const UPSTREAM_TIMEOUT_MS = 35_000;

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function proxyAuthenticatedAI(
  request: NextRequest,
  backendPath: string,
): Promise<NextResponse> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) return jsonError("Request is too large", 413);

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const cookieToken =
    request.cookies.get("access_token")?.value ||
    request.cookies.get("coditent_token")?.value;
  const token = bearer || cookieToken;
  if (!token) return jsonError("Authentication required", 401);

  if (!bearer) {
    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(request.url).origin;
    const csrfCookie = request.cookies.get("coditent_csrf")?.value;
    const csrfHeader = request.headers.get("x-csrf-token");
    if (!origin || origin !== expectedOrigin || !csrfCookie || csrfCookie !== csrfHeader) {
      return jsonError("CSRF validation failed", 403);
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
    if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonError("Invalid or oversized request", 400);
    }
    JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid request", 400);
  }

  const backendBase =
    process.env.BACKEND_PROXY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8001";
  if (!/^https?:\/\//.test(backendBase)) {
    return jsonError("AI service is unavailable", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${backendBase.replace(/\/$/, "")}${backendPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: rawBody,
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.text();
    return new NextResponse(payload, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return jsonError("AI service is unavailable", 503);
  } finally {
    clearTimeout(timeout);
  }
}
