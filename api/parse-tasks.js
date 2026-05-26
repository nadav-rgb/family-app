const { parseWithClaude } = require('./_providers/claude');
const { parseWithOpenAI } = require('./_providers/openai');

const PROVIDER = process.env.AI_PROVIDER || 'claude';
const CONFIDENCE_THRESHOLD = 0.7;

// ─── Post-processing helpers ──────────────────────────────────────────────────

// Strip a leading ו that the AI left on a title ("ולשלם חשמל" → "לשלם חשמל").
// Only removes ו when immediately followed by a Hebrew infinitive (ל + letter).
// Innocent cleanup — does not change meaning.
function stripLeadingVav(title) {
  return title.replace(/^ו(?=ל[א-ת])/, '');
}

// Safety net: transitive verbs that are meaningless without an object. The AI is
// instructed never to emit these bare, but if one slips through we drop it rather
// than create a context-less task like "להכין". A dropped title flags review.
const BARE_TRANSITIVE_VERBS = new Set([
  'להכין','לבדוק','לקנות','לסדר','להביא','לקחת','לעשות','להוציא','לשלוח','לתקן',
  'לארגן','לסיים','להתחיל','לכתוב','לקרוא','לאסוף',
]);

// A title is "context-less" when, after cleanup, it is a single bare transitive verb.
function isContextlessTitle(title) {
  const clean = String(title || '').trim();
  return BARE_TRANSITIVE_VERBS.has(clean);
}

// ─── Preamble assignee extraction ─────────────────────────────────────────────

const PREAMBLE_PEOPLE = [
  { names: ['אמא', 'אמי'],  id: 'mom'     },
  { names: ['אבא', 'אבי'],  id: 'dad'     },
  { names: ['דודי'],          id: 'dudi'    },
  { names: ['יונתן'],         id: 'yonatan' },
];
// Matches: "יונתן צריך ...", "אמא צריכה ...", "אבא חייב ..."
const PREAMBLE_RE = /^(.+?)\s+(?:צריך|צריכה|חייב|חייבת|יכול|יכולה)\s/;

function extractPreambleAssignee(transcript) {
  const m = transcript.trim().match(PREAMBLE_RE);
  if (!m) return null;
  const name = m[1].trim();
  for (const { names, id } of PREAMBLE_PEOPLE) {
    if (names.includes(name)) return id;
  }
  return null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { transcript, lang = 'he', date, time } = req.body || {};

  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  // Extract sentence-level assignee before the AI call (pattern: "X צריך/צריכה + tasks")
  const assigneeFromPreamble = extractPreambleAssignee(transcript);

  try {
    const context = { lang, date, time };
    const raw = PROVIDER === 'openai'
      ? await parseWithOpenAI(transcript, context)
      : await parseWithClaude(transcript, context);

    // 1. Trust the AI's split — the model is the brain. No local re-splitting.
    const splitTasks = raw.rawTasks.slice();

    // 2. Fill missing assignees from preamble (only when AI left them null)
    if (assigneeFromPreamble) {
      splitTasks.forEach(function (t) {
        if (!t.assignee) t.assignee = assigneeFromPreamble;
      });
    }

    // 3. Derive uncertainParts and strip internal _confidence
    const uncertainParts = splitTasks
      .filter(t => t._confidence < CONFIDENCE_THRESHOLD)
      .map(t => t.title);

    const cleaned = splitTasks.map(function (t) {
      return { title: stripLeadingVav(t.title), time: t.time, date: t.date, assignee: t.assignee };
    });

    // 4. Safety net: never let a context-less bare-verb task through. Drop it and
    //    force review so the user can re-dictate, rather than store "להכין".
    const tasks      = cleaned.filter(t => !isContextlessTitle(t.title));
    const droppedAny = tasks.length !== cleaned.length;

    return res.status(200).json({
      tasks,
      needsReview:    raw.needsReview || droppedAny,
      uncertainParts,
      source:         'ai',
      fallback:       false,
    });
  } catch (err) {
    console.error('[parse-tasks] error:', err.message);
    return res.status(500).json({
      error:          'AI parsing failed',
      tasks:          [],
      needsReview:    true,
      uncertainParts: [],
      source:         'ai',
      fallback:       false,
    });
  }
};
