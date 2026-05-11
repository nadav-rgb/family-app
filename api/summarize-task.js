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

const SYSTEM_PROMPT = `You are a task summarizer for a Hebrew/English family app. You extract the structure that is already in the user's long dictated task and return it as a clean mainTitle plus a list of sub-items.

Output ONLY valid JSON. No markdown. No commentary. One of these two shapes:

SHAPE A — when the input clearly bundles ≥2 distinct sub-actions joined by commas or "ו..." conjunctions:
{
  "mainTitle": "<2-5 words: the OVERARCHING event/action, taken from the FIRST clause of the user's input>",
  "items": ["<sub-item 1>", "<sub-item 2>", ...]
}

SHAPE B — when the input is a single action, a shopping list, or too short:
{ "skip": true }

Faithfulness rules (these matter most):

1. mainTitle is built from the user's OPENING words — the WHO/WHAT before the first sub-item.
   - Input: "זום עם הפעילים שלי לדבר על אחדות, נעים להכיר, ..."  →  mainTitle: "זום עם הפעילים"
   - Input: "פגישה עם המנהל בבוקר על תקציב, על מועדים, על מינויים"  →  mainTitle: "פגישה עם המנהל"
   NEVER substitute a generic title that the user didn't say (do not write "פגישת צוות" when the user said "זום עם הפעילים").

2. Each item is the user's OWN sub-action, lightly cleaned up into a short imperative/noun phrase (2-6 words). You MAY rephrase for fluency (e.g. "שישלחו לי כולם קורות חיים" → "לאסוף קורות חיים"; "נעים להכיר" → "הכרות הדדית") AS LONG AS the meaning and the specific topics are preserved.

3. Do NOT replace specific topics with generic ones. If the user said "אחדות" the item must talk about אחדות, NOT "תוכניות העבודה". If the user said "קורות חיים" the item must reference קורות חיים, NOT "משימות". If the user said "דוחות לקוחות" the item must reference לקוחות, NOT "פרויקטים".

4. Use the SAME language as the input. Output items in the order they appear in the input.

5. Items must be ≥2 and DISTINCT. Never invent items the user did not mention.

When to return SHAPE B (skip):
- Input is a single action with no comma-separated sub-items or "ו..." joins.
- Input is a shopping list (verbs "לקנות"/"buy", venues "לסופר"/"שוק"). The app has a separate shopping categorizer.
- Input is shorter than ~30 chars.`;

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
        { role: 'user',   content: `User's task title (extract structure FAITHFULLY, do not paraphrase): "${title}"` },
      ],
      response_format: { type: 'json_object' },
      temperature:     0,           // deterministic — no random paraphrasing
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
