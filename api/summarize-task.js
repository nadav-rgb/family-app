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

const SYSTEM_PROMPT = `You break down a long dictated task into a short main title plus a bullet list of the sub-items the user mentioned.

Return ONLY one of these JSON shapes:

{
  "mainTitle": "...",
  "items": ["...", "...", ...]
}

OR

{ "skip": true }

Use the FIRST shape (mainTitle + items) whenever the input has 2 or more distinct sub-actions or topics in it — comma-separated lists, "ו..." conjunctions joining multiple things, or any pattern where one event has multiple components inside it.

Use { "skip": true } ONLY if the input is genuinely a single action ("לקחת את דודי לחוג") or a shopping list (verbs like לקנות/buy, venues like לסופר). When unsure, prefer the first shape.

Rules:
- mainTitle: 2-5 words taken from the user's OPENING phrase — the event or main action before the first sub-item. Examples: "זום עם הפעילים", "פגישה עם המנהל", "להתכונן לטיול". Never substitute a generic title the user didn't say.
- items: each is a short imperative or noun phrase (2-6 words) describing one sub-action from the input. You may lightly rephrase for fluency ("שישלחו לי כולם קורות חיים" → "לאסוף קורות חיים"), but preserve the SPECIFIC topics — if the user said "אחדות" the item must mention אחדות, not a generic substitute.
- Output items in the order they appear in the input.
- Same language as input (Hebrew → Hebrew, English → English).

Worked example:
Input: "זום עם הפעילים שלי לדבר על אחדות, נעים להכיר, שישלחו לי קורות חיים, שיכינו דוחות לקוחות"
Output: {"mainTitle":"זום עם הפעילים","items":["לדבר על אחדות","הכרות הדדית","לאסוף קורות חיים","להכין דוחות לקוחות"]}`;

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
      model:           process.env.OPENAI_SUMMARY_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
