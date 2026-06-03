const OpenAI = require('openai');
const { guard } = require('./_lib/guard');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a Hebrew shopping-list parser for a family app.
Given one task title in Hebrew that represents a shopping or grocery list, return a structured JSON breakdown.

Return ONLY valid JSON with this exact structure:
{
  "action": "<the main action verb phrase, e.g. 'ללכת לסופר' or 'לקנות בסופר'>",
  "categories": {
    "<category name in Hebrew>": ["item 1", "item 2", ...],
    ...
  }
}

Categories — use these exact Hebrew names. Only include categories that have items:
- "פירות וירקות"      (fruits, vegetables, herbs, spices from plants)
- "מוצרי חלב"        (dairy)
- "מוצרי בשר ודגים"  (meat & fish)
- "שתייה"            (non-alcoholic drinks: water, juice, soda, energy drinks)
- "שתייה חריפה"      (ALL alcoholic drinks: wine, beer, vodka, brandy, whisky, arak, liqueur, spirits)
- "חטיפים ומתוקים"   (snacks, sweets, cookies, chocolate)
- "פחמימות ודגנים"   (bread, cereal, rice, pasta, flour)
- "אחר"              (everything else: oils, condiments, hygiene, household, charcoal, non-food items)

Rules:
- "action" is the action phrase only (e.g. "ללכת לסופר") — without the items.
- Each item is a short, clean Hebrew noun phrase ("מלפפונים", "יין אדום", "פלסטרים").
- "פירות וירקות" includes: all vegetables (שום, בצל, עגבניות, מלפפון, גזר, תפוח אדמה, כרובית, ברוקולי, סלרי…), all fruits (תפוח, בננה, לימון, תות, ענב…), and ALL fresh or dried herbs (פטרוזיליה, נענע, כוסברה, בזיליקום, זעתר, רוזמרין, תימין, שמיר, מרווה, עלי דפנה, כרכום…). Garlic (שום) and onion (בצל) are vegetables → "פירות וירקות".
- "שתייה חריפה" includes: יין (כל סוגיו), בירה, וודקה, ברנדי, קוניאק, וויסקי, ערק, ליקר, ג'ין, רום, טקילה. Do NOT put these in "אחר".
- Sodas, juices, water, mineral water → "שתייה".
- Oils (שמן זית, שמן קנולה, שמן סויה) → "אחר".
- If unsure about a category, put the item in "אחר".
- Return only categories that contain at least one item.
- Do NOT add categories that are empty.

Example input title: "ללכת לסופר לקנות מלפפונים עגבניות חלב גבינה יין אדום פלסטרים"
Example output:
{
  "action": "ללכת לסופר",
  "categories": {
    "פירות וירקות": ["מלפפונים", "עגבניות"],
    "מוצרי חלב": ["חלב", "גבינה"],
    "שתייה חריפה": ["יין אדום"],
    "אחר": ["פלסטרים"]
  }
}`;

module.exports = async function handler(req, res) {
  // CORS + per-IP rate limit + optional friction (handles OPTIONS/method).
  if (!(await guard(req, res, 'categorize-shopping'))) return;

  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const completion = await client.chat.completions.create({
      model:           process.env.OPENAI_SHOPPING_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages:        [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Title: "${title}"` },
      ],
      response_format: { type: 'json_object' },
      max_tokens:      900,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw);

    if (typeof parsed.action !== 'string' || !parsed.action.trim()
        || typeof parsed.categories !== 'object' || parsed.categories === null) {
      throw new Error('Invalid response shape');
    }

    // Sanitize: keep only non-empty categories with array values
    const cleanCategories = {};
    for (const [name, items] of Object.entries(parsed.categories)) {
      if (Array.isArray(items) && items.length > 0) {
        cleanCategories[name] = items.map(s => String(s).trim()).filter(Boolean);
      }
    }

    if (Object.keys(cleanCategories).length === 0) {
      return res.status(200).json({ action: parsed.action.trim(), categories: {}, empty: true });
    }

    return res.status(200).json({
      action:     parsed.action.trim(),
      categories: cleanCategories,
    });
  } catch (err) {
    console.error('[categorize-shopping] error:', err.message);
    return res.status(500).json({ error: 'categorization failed' });
  }
};
