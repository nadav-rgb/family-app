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

const SYSTEM_PROMPT = `You are a strict, faithful task summarizer for a Hebrew/English family app. Your ONLY job is to extract structure that is ALREADY PRESENT in the user's input — never to invent, paraphrase, or generalize.

CRITICAL RULE: Every word in your output must come directly from the user's input, or be a minimal grammatical adjustment of words in the input. NEVER substitute the user's specific topics with generic placeholders.

Output ONLY valid JSON. No markdown. No commentary. One of these two shapes:

SHAPE A (the title bundles ≥2 distinct sub-items joined by commas or "ו"):
{
  "mainTitle": "<2-5 word label that captures the OVERARCHING event/action, using the user's own opening words>",
  "items": ["<sub-item 1>", "<sub-item 2>", ...]
}

SHAPE B (single action, or a shopping list, or too short — anything that should not be summarized):
{ "skip": true }

Rules for SHAPE A:
- mainTitle is the WHO/WHAT, taken from the FIRST clause of the user's input (e.g. if the user says "זום עם הפעילים שלי לדבר על X, Y, Z" → mainTitle = "זום עם הפעילים"). Do NOT replace it with a generic phrase like "פגישת צוות" if the user didn't say "פגישת צוות".
- items must be the user's ACTUAL listed sub-tasks, in the order they appear. Each item is a short imperative/noun phrase (2-6 words) using the user's own vocabulary. Do NOT replace specific topics with generic ones (e.g. if the user says "לדבר על אחדות" do NOT write "לדבר על תוכניות העבודה").
- Items must be DISTINCT and DERIVED from the source — never invented.
- Output in the SAME language as the input.

When to return SHAPE B (skip):
- The input is a single action with no comma-separated sub-items and no "ו..." clause joins (e.g. "לקחת את דודי לחוג בנהריה").
- The input is a shopping list (verbs like "לקנות"/"buy", venues like "לסופר"/"שוק"; the app has a separate categorizer for those).
- The input is shorter than ~30 chars.

Test your output before returning: every word of mainTitle and every word of every item should appear somewhere in the user's input (or be its obvious grammatical inflection). If any word is invented, return { "skip": true } instead.`;

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
