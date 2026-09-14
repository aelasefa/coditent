import { NextRequest, NextResponse } from "next/server";
import { BIO_MAX_LENGTH, extractGeminiText, isQualityBio, trimBio } from "@/lib/bio-utils";

const TOTAL_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 2;

type BioSuccess = { success: true; bio: string };
type BioFailure = { success: false; error: string };

function fail(error: string, status: number): NextResponse {
  const res: BioFailure = { success: false, error };
  return NextResponse.json(res, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const started = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("[generate-bio] GEMINI_API_KEY not configured");
    return fail("Bio generation is unavailable. Please try again later.", 500);
  }

  let body: {
    skills?: unknown;
    fieldOfStudy?: unknown;
    headline?: unknown;
    experience?: unknown;
    education?: unknown;
    interests?: unknown;
    careerGoals?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request. Please try again.", 400);
  }
  const { skills, fieldOfStudy, headline, experience, education, interests, careerGoals } = body;

  if (!skills || (Array.isArray(skills) && skills.length === 0)) {
    return fail("Add at least one skill before generating a bio.", 400);
  }

  const skillsList = Array.isArray(skills) ? skills.join(", ") : String(skills);

  // Prompt uses actual profile information — keep 500 char limit on output only
  const prompt = `You are an expert career coach helping Moroccan students and professionals write compelling professional bios.

Given these details:
- Skills: ${skillsList}
- Field of Study: ${fieldOfStudy || "Not specified"}
- Professional Headline: ${headline || "Not specified"}
- Experience: ${experience || "Not specified"}
- Education: ${education || fieldOfStudy || "Not specified"}
- Interests: ${interests || "Not specified"}
- Career Goals: ${careerGoals || "Not specified"}

Write a concise, impactful professional bio (max 500 characters, complete finished sentences only) that:
1. Opens with strongest value proposition
2. Showcases 2-3 concrete achievements or impacts
3. Mentions key skills in context
4. Ends with what they seek (growth, challenge, team)
5. Uses first person and action verbs
6. Is authentic and recruiter-focused, not promotional
7. Only uses the details above — do not invent qualifications or experience

Return ONLY the bio text, no quotes, no code fences, nothing else.`;

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

  // One shared deadline for the whole operation, including a possible retry.
  // Cleared in the outer finally so no timer leaks on any path.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 600 },
          }),
          signal: controller.signal,
        });
      } catch (fetchError) {
        const timedOut = fetchError instanceof Error && fetchError.name === "AbortError";
        console.error(`[generate-bio] upstream ${timedOut ? "timeout" : "network failure"} after ${Date.now() - started}ms`);
        // Transport failures are not retried: retrying a dead network cannot help.
        return fail(
          timedOut ? "Bio generation timed out. Please try again." : "Bio service unreachable. Please try again.",
          timedOut ? 504 : 502
        );
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        let sanitized = errorBody;
        // Do not log API key; sanitize if present
        if (apiKey && sanitized.includes(apiKey)) sanitized = sanitized.replaceAll(apiKey, "[REDACTED]");
        console.error(`[generate-bio] Gemini failed status=${response.status} after ${Date.now() - started}ms body=${sanitized.slice(0, 500)}`);
        // Provider/auth/config errors are never retried.
        let message = `Bio generation failed (provider status ${response.status}). Please try again.`;
        if (response.status === 400) message = "Bio request was rejected. Please try again.";
        else if (response.status === 401 || response.status === 403) message = "Bio generation is unavailable. Please try again later.";
        else if (response.status === 429) message = "Bio generation is busy. Please wait a moment and try again.";
        else if (response.status >= 500) message = "Bio provider error. Please try again.";
        return fail(message, 502);
      }

      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      const finishReason = (data as { candidates?: Array<{ finishReason?: string }> } | null)?.candidates?.[0]?.finishReason;
      const bio = extractGeminiText(data);

      if (isQualityBio(bio)) {
        const trimmed = trimBio(bio, BIO_MAX_LENGTH);
        if (trimmed && isQualityBio(trimmed)) {
          console.log(`[generate-bio] ok len=${trimmed.length} finishReason=${finishReason} attempts=${attempt} after ${Date.now() - started}ms`);
          const res: BioSuccess = { success: true, bio: trimmed };
          return NextResponse.json(res);
        }
      }

      // Only empty/quality failures reach here — the single allowed retry case.
      if (attempt < MAX_ATTEMPTS && !controller.signal.aborted) {
        console.error(`[generate-bio] attempt ${attempt} failed quality (len=${bio.length} finishReason=${finishReason}), retrying once`);
        continue;
      }
      console.error(`[generate-bio] unusable response after ${attempt} attempt(s) finishReason=${finishReason} after ${Date.now() - started}ms`);
      return fail("Could not generate your bio. Please try again.", 502);
    }
    return fail("Could not generate your bio. Please try again.", 502);
  } catch (error) {
    console.error("[generate-bio] Internal error", error instanceof Error ? error.message : "unknown");
    return fail("Could not generate your bio. Please try again.", 500);
  } finally {
    clearTimeout(timeout);
  }
}
