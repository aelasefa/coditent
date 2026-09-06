import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("[generate-bio] GEMINI_API_KEY not configured");
    return NextResponse.json({ error: "GEMINI_API_KEY not configured on server" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { skills, fieldOfStudy, headline, experience, education, interests, careerGoals } = body;

    if (!skills || (Array.isArray(skills) && skills.length === 0)) {
      return NextResponse.json({ error: "Skills are required" }, { status: 400 });
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

Write a concise, impactful professional bio (max 500 characters) that:
1. Opens with strongest value proposition
2. Showcases 2-3 concrete achievements or impacts
3. Mentions key skills in context
4. Ends with what they seek (growth, challenge, team)
5. Uses first person and action verbs
6. Is authentic and recruiter-focused, not promotional

Return ONLY the bio text, nothing else.`;

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 600 },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      let sanitized = errorBody;
      // Do not log API key; sanitize if present
      if (apiKey && sanitized.includes(apiKey)) sanitized = sanitized.replaceAll(apiKey, "[REDACTED]");
      console.error(`[generate-bio] Gemini failed status=${response.status} statusText=${response.statusText} body=${sanitized.slice(0, 1000)}`);
      let message = `Gemini API error ${response.status}`;
      if (response.status === 400) message = "Gemini invalid request — check model/params";
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
    const bio = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!bio) {
      console.error("[generate-bio] Malformed Gemini response", JSON.stringify(data).slice(0, 1000));
      return NextResponse.json({ error: "Gemini returned empty response" }, { status: 502 });
    }

    return NextResponse.json({ bio: bio.slice(0, 500) });
  } catch (error) {
    console.error("[generate-bio] Internal error", error);
    return NextResponse.json({ error: "Internal server error generating bio" }, { status: 500 });
  }
}
