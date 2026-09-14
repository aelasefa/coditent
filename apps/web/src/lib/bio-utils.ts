// Pure helpers for AI bio generation. No imports — testable with node type-stripping.

export const BIO_MAX_LENGTH = 500;

/** Strip code fences, surrounding quotes and whitespace from model output. */
export function normalizeBioText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let text = raw.trim();
  // Fenced block: ```...``` or ```md ... ```
  const fence = text.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/);
  if (fence) text = fence[1].trim();
  // Surrounding single/double quotes
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    text = text.slice(1, -1).trim();
  }
  // Leading labels like "Bio:" the model sometimes adds
  text = text.replace(/^(bio|professional bio)\s*:\s*/i, "").trim();
  return text;
}

/**
 * Trim to max length without cutting mid-word. Prefers a sentence boundary,
 * falls back to last space, then hard cut. Never returns half a word.
 */
export function trimBio(text: string, max: number = BIO_MAX_LENGTH): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (sentenceEnd > max * 0.5) return slice.slice(0, sentenceEnd + 1).trim();
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > max * 0.5) return slice.slice(0, lastSpace).trim();
  return slice.slice(0, max).trim();
}

/** Read bio from a response payload. Canonical `bio` first, legacy keys normalized. */
export function extractBio(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const raw = p["bio"] ?? p["text"] ?? p["result"] ?? p["content"] ?? "";
  return normalizeBioText(raw);
}

/** Concatenate every text part of a Gemini generateContent response. */
export function extractGeminiText(data: unknown): string {
  try {
    const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates;
    if (!Array.isArray(candidates)) return "";
    const combined = candidates
      .flatMap((c) => c?.content?.parts ?? [])
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return normalizeBioText(combined);
  } catch {
    return "";
  }
}

/**
 * Conservative usability check for generated bios.
 * Rejects only clearly unusable output:
 * - empty / whitespace only
 * - only punctuation or symbols (no letters or digits)
 * - leftover markdown/code fence residue
 * - heading-only text such as "Bio:" (normalization strips the label,
 *   leaving nothing behind)
 * - fewer than 8 words — far below any meaningful professional bio,
 *   while valid concise bios (2+ sentences) always pass
 */
export function isQualityBio(raw: unknown): boolean {
  const text = normalizeBioText(raw);
  if (!text) return false;
  if (text.includes("```")) return false;
  if (!/[A-Za-z0-9]/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  return true;
}
