// Shared Gemini food-analysis prompt + schema keys (pure; no RN imports) so
// both the app client and the offline sample-image script use the EXACT prompt.
export const GEMINI_FOOD_PROMPT = `You are a food-rescue intake assistant for a hotel kitchen donating surplus food to charities.
Analyse the food-safety photo and return ONLY a JSON object with these fields:
{
  "itemName": string,            // short human name, e.g. "Cooked chicken curry"
  "category": string,            // one of: Cooked meals, Fresh produce, Bakery, Dairy, Packaged goods, Beverages, Other
  "estimatedPortions": number|null,
  "estimatedWeightKg": number|null,
  "expiryDateOnLabel": string|null, // ONLY a use-by/expiry date actually PRINTED on the label, as "YYYY-MM-DD" (or null if not visible). Do not guess.
  "expiryHoursFromNow": number|null, // optional ESTIMATE of hours until unsafe; never treated as a printed date
  "allergens": string[],         // visible or likely allergens, e.g. ["nuts","dairy"]
  "confidence": number,          // 0..1 how sure you are overall
  "notes": string                // one short sentence for the kitchen staff
}
Be conservative: if quantity is unclear return null and lower confidence. Never invent allergens that are not visible or strongly implied. Only set expiryDateOnLabel when a date is clearly readable on the packaging; otherwise return null.`;

export const GEMINI_FOOD_KEYS = [
  'itemName', 'category', 'estimatedPortions', 'estimatedWeightKg',
  'expiryDateOnLabel', 'expiryHoursFromNow', 'allergens', 'confidence', 'notes',
] as const;
