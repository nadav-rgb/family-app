// POST /api/summarize-task
// Body: { title: string, lang?: 'he' | 'en' }
//
// Generalized companion to /api/categorize-shopping: looks at a long task
// title that may bundle multiple sub-actions (meeting agenda, errand list,
// multi-step chore), and returns a concise main-title plus an ordered list
// of the sub-items. The client uses this to show a short label on the
// card and a structured bullet list in the title tooltip.
//
// Returns:
//   { mainTitle: string, items: string[] }     — summarized
//   { skip: true }                              — not an agenda task
//   { error: string }                           — server-side problem

const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a Hebrew task summarizer for a family app.

Given one task title in Hebrew (or English) that contains MULTIPLE
sub-items packed into one long sentence (e.g. a meeting agenda, a
project's checklist, a multi-step chore), return a clean structured
JSON breakdown.

Return ONLY valid JSON in ONE of these shapes:

A) When the title bundles 2+ distinct sub-items:
   {
     "mainTitle": "<short label of the main event/action, 2-5 words>",
     "items": ["<sub-item 1>", "<sub-item 2>", "<sub-item 3>", ...]
   }

B) When the title is actually ONE single action (not bundled), OR is
   a shopping list (handled elsewhere), OR is too short to summarize:
   { "skip": true }

Rules:
- mainTitle captures the OVERARCHING action/event (the WHO/WHAT), not
  the individual items inside. Examples:
    "זום עם הפעילים", "פגישת צוות", "להתכונן לטיול".
- items are the SPECIFIC sub-actions or topics. Each one is a short
  imperative or noun phrase, 2-6 words. Examples:
    "לדבר על אחדות", "הכרות הדדית", "לאסוף קורות חיים".
- Items must be DISTINCT and DERIVED from the original title — do
  not invent items the user didn't mention.
- Output in the SAME language as the input title (Hebrew or English).
- A title is a single action and should be skipped if it has no
  comma-separated sub-items and no clear "ו..." conjunctions joining
  multiple actions.
- Shopping lists ("ללכת לסופר לקנות X Y Z", "לקנות מלפפונים עגבניות
  חלב") → always { "skip": true } (they have their own categorizer).
- Output strictly valid JSON. No markdown, no commentary.

Example A:
Input: "זום עם הפעילים שלי לדבר על אחדות עכשיו, נעים להכיר, שישלחו לי כולם קורות חיים, שיכינו לי דוחות לקוחות"
Output:
{
  "mainTitle": "זום עם הפעילים",
  "items": [
    "לדבר על אחדות",
    "הכרות הדדית",
    "לאסוף קורות חיים מכולם",
    "להכין דוחות לקוחות"
  ]
}

Example B:
Input: "לקחת את דודי לחוג בנהריה"
Output: { "skip": true }

Example C (shopping → skip, categorizer handles it):
Input: "ללכת לסופר לקנות מלפפונים עגבניות חלב גבינה"
Output: { "skip": true }`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const completion = await client.chat.completions.create({
      model:           process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages:        [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Title: "${title}"` },
      ],
      response_format: { type: 'json_object' },
      max_tokens:      500,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw);

    if (parsed.skip === true) {
      return res.status(200).json({ skip: true });
    }

    if (typeof parsed.mainTitle !== 'string' || !parsed.mainTitle.trim()
        || !Array.isArray(parsed.items)) {
      // Bad shape — treat as skip rather than 500, so client just leaves
      // the original title alone.
      return res.status(200).json({ skip: true });
    }

    const cleanItems = parsed.items
      .map(s => String(s || '').trim())
      .filter(Boolean);

    // Need at least 2 distinct items for the summary to be useful.
    if (cleanItems.length < 2) {
      return res.status(200).json({ skip: true });
    }

    return res.status(200).json({
      mainTitle: parsed.mainTitle.trim(),
      items:     cleanItems,
    });
  } catch (err) {
    console.error('[summarize-task] error:', err.message);
    return res.status(500).json({ error: 'summarization failed' });
  }
};
