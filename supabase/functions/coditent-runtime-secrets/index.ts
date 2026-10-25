import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const requiredKeys = ["DATABASE_URL", "JWT_SECRET", "GEMINI_API_KEY"];

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function sha256Hex(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (legacy) return legacy;

  const rawKeys = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  if (rawKeys) {
    try {
      const keys = JSON.parse(rawKeys) as Record<string, string>;
      const first = Object.values(keys).find((value) => typeof value === "string");
      if (first) return first;
    } catch {
      // Fall through to the explicit deployment secret below.
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const token = request.headers.get("x-coditent-runtime-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  let allowedHashes: string[];
  try {
    allowedHashes = JSON.parse(Deno.env.get("CODITENT_RUNTIME_TOKEN_HASHES") ?? "[]");
    if (!Array.isArray(allowedHashes)) throw new Error("invalid token hash list");
  } catch {
    return Response.json({ error: "secret_service_not_configured" }, { status: 503 });
  }

  const presentedHash = await sha256Hex(token);
  let authorized = false;
  for (const entry of allowedHashes) {
    if (typeof entry !== "string") continue;
    const candidate = decodeHex(entry);
    if (candidate && constantTimeEqual(presentedHash, candidate)) authorized = true;
  }
  if (!authorized) return Response.json({ error: "unauthorized" }, { status: 401 });

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const key = serviceKey();
  if (!projectUrl || !key) {
    return Response.json({ error: "secret_service_not_configured" }, { status: 503 });
  }

  const supabase = createClient(projectUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("get_coditent_runtime_secrets");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return Response.json({ error: "secret_bundle_unavailable" }, { status: 503 });
  }

  const secrets = data as Record<string, unknown>;
  if (requiredKeys.some((keyName) => typeof secrets[keyName] !== "string" || !secrets[keyName])) {
    return Response.json({ error: "secret_bundle_incomplete" }, { status: 503 });
  }

  return Response.json({ secrets }, {
    headers: { "Cache-Control": "no-store" },
  });
});
