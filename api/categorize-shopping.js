const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a Hebrew shopping-list parser for a family app.
Given one task title in Hebrew that represents a shopping or grocery list, return a structured JSON breakdown.

Return ONLY valid JSON — no prose, no markdown fences. The structure is:
{
  "action": "<the main action verb phrase, e.g. 'ללכת לסופר' or 'לקנות בסופר'. If the title has no action verb (just an item list), use 'לקנות'>",
  "categories": {
    "<category name in Hebrew>": ["item 1", "item 2", ...],
    ...
  }
}

Categories — use these exact Hebrew names. Only include categories that have items:
- "פירות וירקות"      (fruits & vegetables)
- "מוצרי חלב"        (dairy)
- "מוצרי בשר ודגים"  (meat & fish)
- "שתייה"            (non-alcoholic drinks: water, juice, soda, energy)
- "שתייה חריפה"      (alcoholic drinks: wine, beer, spirits, liqueur)
- "חטיפים ומתוקים"   (snacks, sweets, cookies, chocolate)
- "פחמימות ודגנים"   (bread, cereal, rice, pasta, flour)
- "אחר"              (everything else: oils, condiments, hygiene, household, etc.)

Rules:
- "action" is the action phrase only (e.g. "ללכת לסופר") — without the items.
- Each item is a short, clean Hebrew noun phrase ("מלפפונים", "יין אדום", "פלסטרים").
- Combine related variants under one category (e.g. "יין לבן", "יין אדום", "יין מתוק" → all under "שתייה חריפה").
- Wines, beer, vodka, brandy, cognac, whisky, arak, liqueur → "שתייה חריפה".
- Sodas, juices, water, mineral water → "שתייה".
- If the input title is NOT a shopping list (e.g. it's a phone-call task or a meeting), return {"action": "", "categories": {}} — do not invent items.
- Return only categories that contain at least one item. Empty categories must be omitted.

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const message = await client.messages.create({
      model:      process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: `Title: "${title}"` }],
    });

    const raw = message.content[0]?.text?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    if (typeof parsed.action !== 'string' || typeof parsed.categories !== 'object' || parsed.categories === null) {
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
