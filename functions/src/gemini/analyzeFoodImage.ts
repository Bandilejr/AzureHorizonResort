// functions/src/gemini/analyzeFoodImage.ts — Phase 1 §31-33.
// Server-side Gemini proxy: the mobile app NEVER holds the Gemini API key.
// Mobile → authenticated callable → Gemini. Hard timeout, structured error
// categories, strict response validation, confidence null when absent.
import * as functions from "firebase-functions";

// Model is configurable (functions/.env → GEMINI_MODEL, or Cloud Secret
// Manager). Defaults to gemini-2.5-flash. Never hard-code a single model so a
// future retirement only needs an env change, not a redeploy of logic.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Server-side secret: functions/.env locally, Cloud Secret Manager in prod.
// NEVER read from EXPO_PUBLIC_* (that is bundled into the client).
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || "";

const PROMPT = `You are a food-rescue intake assistant for a hotel kitchen donating surplus food to charities.
Analyse the food-safety photo and return ONLY a JSON object with these fields:
{
  "itemName": string,            // short human name, e.g. "Cooked chicken curry"
  "category": string,            // one of: Cooked meals, Fresh produce, Bakery, Dairy, Packaged goods, Beverages, Other
  "estimatedPortions": number|null,
  "estimatedWeightKg": number|null,
  "expiryHoursFromNow": number|null, // best estimate of hours until unsafe
  "allergens": string[],         // visible or likely allergens, e.g. ["nuts","dairy"]
  "confidence": number,          // 0..1 how sure you are overall
  "notes": string                // one short sentence for the kitchen staff
}
Be conservative: if quantity is unclear return null and lower confidence. Never invent allergens that are not visible or strongly implied.`;

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toNum(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export const analyzeFoodImage = functions.https.onCall(async (data, context) => {
  // §31: authenticated callers only.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in to use AI analysis.",
    );
  }
  const imageBase64 = typeof data?.imageBase64 === "string" ? data.imageBase64 : "";
  const mimeType = typeof data?.mimeType === "string" ? data.mimeType : "image/jpeg";
  if (!imageBase64) {
    throw new functions.https.HttpsError("invalid-argument", "No image was provided for analysis.");
  }
  if (imageBase64.length > 7_000_000) {
    throw new functions.https.HttpsError("invalid-argument", "The image is too large for analysis.");
  }
  if (!GEMINI_API_KEY) {
    throw new functions.https.HttpsError(
      "unavailable",
      "AI analysis is not configured on the server yet — continue manually.",
    );
  }

  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    // No thinkingConfig: it is rejected (HTTP 400) by some models (e.g.
    // Flash-Lite). Keeping the request model-agnostic.
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  // §32/§37: hard upstream timeout — never leave the client hanging.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: any;
  try {
    res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      throw new functions.https.HttpsError("deadline-exceeded", "Analysis took too long. Try again or continue manually.");
    }
    throw new functions.https.HttpsError("unavailable", "Network error reaching the AI service. Check the server connection.");
  }
  clearTimeout(timer);

  // §32: distinguish failure categories instead of one generic message.
  if (res.status === 429) {
    throw new functions.https.HttpsError("resource-exhausted", "AI quota exceeded — try again later or continue manually.");
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    let body = "";
    let safetyBlock = false;
    try {
      body = await res.text();
      safetyBlock = body.includes("SAFETY") || body.includes("safety");
    } catch { /* keep false */ }
    // Distinguish an invalid/leaked/revoked server key (permission-denied) from
    // a safety block (failed-precondition). A leaked key is the most common
    // real-world failure — see the probe in the Layer 9 report.
    const keyRejected = /leaked|invalid|API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(body);
    if (safetyBlock) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The image was blocked by the AI safety filter. Continue manually.",
      );
    }
    if (keyRejected) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "The AI service key was rejected (invalid, revoked or reported leaked). An administrator must rotate GEMINI_API_KEY. Continue manually.",
      );
    }
    throw new functions.https.HttpsError("invalid-argument", "The image could not be analysed. Try another photo or continue manually.");
  }
  if (res.status === 404) {
    // Unknown/retired model — actionable, not a generic outage.
    throw new functions.https.HttpsError(
      "failed-precondition",
      `The configured AI model (${GEMINI_MODEL}) is unavailable. Set GEMINI_MODEL to a supported model. Continue manually.`,
    );
  }
  if (!res.ok) {
    throw new functions.https.HttpsError("unavailable", `AI service error (${res.status}) — continue manually.`);
  }

  const payload = await res.json();
  // Safety finish reason on an otherwise-200 response.
  const finishReason = payload?.candidates?.[0]?.finishReason || "";
  if (finishReason === "SAFETY") {
    throw new functions.https.HttpsError("failed-precondition", "The image was blocked by the AI safety filter. Continue manually.");
  }

  const text =
    payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  const json = extractJson(text);
  if (!json) {
    throw new functions.https.HttpsError("internal", "The AI returned an unreadable response — try again or continue manually.");
  }

  // §33: strict-ish validation — unknown stays unknown (confidence null, never fabricated).
  return {
    itemName: typeof json.itemName === "string" ? json.itemName : "",
    category: typeof json.category === "string" ? json.category : "Other",
    estimatedPortions: toNum(json.estimatedPortions),
    estimatedWeightKg: toNum(json.estimatedWeightKg),
    expiryHoursFromNow: toNum(json.expiryHoursFromNow),
    allergens: Array.isArray(json.allergens)
      ? (json.allergens as unknown[]).map((a) => String(a)).filter(Boolean)
      : [],
    confidence: toNum(json.confidence),
    notes: typeof json.notes === "string" ? json.notes : "",
  };
});