import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[generate-headline] GEMINI_API_KEY not configured");
    return NextResponse.json({ error: "GEMINI_API_KEY not configured on server" }, { status: 500 });
  }
  try {
    const { skills, fieldOfStudy } = await req.json();
    if (!skills || (Array.isArray(skills) && skills.length === 0)) {
      return NextResponse.json({ error: "Skills are required" }, { status: 400 });
    }
    const skillsList = Array.isArray(skills) ? skills.join(", ") : String(skills);
    const prompt = `You are an expert recruiter helping Moroccan job seekers create compelling professional headlines.
Given:
- Skills: ${skillsList}
- Field of Study: ${fieldOfStudy || "Not specified"}
Generate a single punchy headline (max 120 characters) specific to skills, highlighting strongest value, action-oriented, confident. Return ONLY headline.`;

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let sanitized = errorBody;
      if (apiKey && sanitized.includes(apiKey)) sanitized = sanitized.replaceAll(apiKey, "[REDACTED]");
      console.error(`[generate-headline] Gemini failed status=${response.status} statusText=${response.statusText} body=${sanitized.slice(0, 1000)}`);
      let message = `Gemini API error ${response.status}`;
      if (response.status === 400) message = "Gemini invalid request";
      else if (response.status === 401 || response.status === 403) message = "Gemini invalid API key";
      else if (response.status === 429) message = "Gemini quota/rate limit exceeded";
      else if (response.status >= 500) message = "Gemini server error";
      try {
        const parsed = JSON.parse(errorBody);
        const detail = parsed?.error?.message || parsed?.error || "";
        if (detail) message += `: ${String(detail).slice(0, 300)}`;
      } catch {}
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const data = await response.json();
    const headline = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!headline) {
      console.error("[generate-headline] Malformed response", JSON.stringify(data).slice(0, 1000));
      return NextResponse.json({ error: "Gemini returned empty response" }, { status: 502 });
    }
    return NextResponse.json({ headline: headline.slice(0, 120) });
  } catch (error) {
    console.error("[generate-headline] Internal error", error);
    return NextResponse.json({ error: "Internal server error generating headline" }, { status: 500 });
  }
}
