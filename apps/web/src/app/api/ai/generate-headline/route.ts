import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { skills, fieldOfStudy } = await req.json();

    if (!skills || skills.length === 0) {
      return NextResponse.json(
        { error: "Skills are required" },
        { status: 400 }
      );
    }

    const skillsList = Array.isArray(skills) ? skills.join(", ") : skills;

    const prompt = `You are an expert recruiter helping Moroccan job seekers create compelling professional headlines.

Given these details:
- Skills: ${skillsList}
- Field of Study: ${fieldOfStudy || "Not specified"}

Generate a single, punchy professional headline (max 120 characters) that would appeal to recruiters. The headline should:
1. Be specific to their skills, not generic
2. Highlight their most valuable strengths
3. Be action-oriented and confident
4. Include their seniority level implicitly if possible

Return ONLY the headline text, nothing else.`;

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
          temperature: 0.7,
          maxOutputTokens: 100,
        },
      }),
    });

    if (!response.ok) {
      console.error("Gemini API error:", response.statusText);
      return NextResponse.json(
        { error: "Failed to generate headline" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const headline =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!headline) {
      return NextResponse.json(
        { error: "No headline generated" },
        { status: 500 }
      );
    }

    return NextResponse.json({ headline });
  } catch (error) {
    console.error("Error generating headline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
