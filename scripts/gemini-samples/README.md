# Gemini sample images

Drop 4–5 test photos here, then run:

```
node scripts/verify-gemini-fill.js
```

Suggested files (any of .jpg/.jpeg/.png/.webp):
- `food1.jpg` — a clear cooked meal (should return item + portions)
- `food2.jpg` — fresh produce / bakery
- `nonfood.jpg` — a non-food image (e.g. a chair) — model should return low confidence / "Other"
- `blurry.jpg` — a blurry or dark photo — model should return low confidence
- `date_label.jpg` — packaging with a printed use-by date — should return `expiryHoursFromNow`

Images are read locally and sent to the Gemini API with the app's exact prompt.
The script never prints your API key. These files are for local testing only.
