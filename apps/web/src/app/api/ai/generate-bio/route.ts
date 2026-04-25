import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { skills, fieldOfStudy, headline } = await req.json();

    if (!skills || skills.length === 0) {
      return NextResponse.json(
        { error: "Skills are required" },
        { status: 400 }
      );
    }

    const skillsList = Array.isArray(skills) ? skills.join(", ") : skills;

    const prompt = `You are an expert career coach helping Moroccan job seekers write compelling professional bios.

Given these details:
- Skills: ${skillsList}
- Field of Study: ${fieldOfStudy || "Not specified"}
- Professional Headline: ${headline || "Not specified"}

Write a concise, impactful professional bio (max 500 characters) that:
1. Opens with their strongest value proposition
2. Showcases 2-3 concrete achievements or impacts
3. Mentions their key skills in context
4. Ends with what they're looking for (growth, challenge, team)
5. Uses first person and action verbs
6. Is authentic and recruiter-focused, not promotional

Return ONLY the bio text, nothing else.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY || "",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 200,
        },
      }),
    });

    if (!response.ok) {
      console.error("Gemini API error:", response.statusText);
      return NextResponse.json(
        { error: "Failed to generate bio" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const bio = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!bio) {
      return NextResponse.json(
        { error: "No bio generated" },
        { status: 500 }
      );
    }

    return NextResponse.json({ bio });
  } catch (error) {
    console.error("Error generating bio:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
