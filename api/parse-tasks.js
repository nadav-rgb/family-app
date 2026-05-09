const { parseWithClaude } = require('./_providers/claude');
const { parseWithOpenAI } = require('./_providers/openai');

const PROVIDER = process.env.AI_PROVIDER || 'claude';
const CONFIDENCE_THRESHOLD = 0.7;

// ─── Post-processing helpers ──────────────────────────────────────────────────

const MOVEMENT_VERBS = new Set([
  'ללכת','לנסוע','לצאת','לקפוץ','לעלות','לרדת','לחזור','לטוס','לרוץ','לנהוג',
]);

// Communication verbs + their typical content/purpose verbs.
// "להתקשר לאמא ולהגיד לה X" = one task (message is purpose of the call, not a separate task).
const COMMUNICATION_VERBS = new Set([
  'להתקשר','לצלצל','לשלוח','לכתוב','לדבר','לפנות',
]);
const CONTENT_VERBS = new Set([
  'להגיד','לשאול','לספר','לבשר','לברר','לומר',
]);

// Split a task whose title contains two ו-joined infinitives, e.g.:
//   "לשלם חשמל ולקנות חלב" → ["לשלם חשמל", "לקנות חלב"]
// Guards (keep as one task when):
//   1. First verb is a movement verb (movement+purpose pattern)
//   2. Subordinate clause after second verb ("ולבקש שישלחו")
//   3. Communication verb + content/purpose verb ("ולהגיד לה", "ולשאול מה")
function splitVavInTitle(task) {
  const match = task.title.match(/^(.+?)\s+(ול[א-ת]\S*(?:\s+.*)?)$/);
  if (!match) return [task];

  const part1 = match[1].trim();
  const part2 = match[2].slice(1).trim(); // strip leading ו → clean infinitive

  const firstVerb      = part1.split(/\s+/)[0];
  const firstVerbPart2 = part2.split(/\s+/)[0];

  if (MOVEMENT_VERBS.has(firstVerb)) return [task];
  if (/^ל\S+\s+ש[יתנא]/.test(part2)) return [task];
  if (COMMUNICATION_VERBS.has(firstVerb) && CONTENT_VERBS.has(firstVerbPart2)) return [task];

  return [
    { ...task, title: part1 },
    { ...task, title: part2 },
  ];
}

// Strip a leading ו that the AI left on a title ("ולשלם חשמל" → "לשלם חשמל").
// Only removes ו when immediately followed by a Hebrew infinitive (ל + letter).
function stripLeadingVav(title) {
  return title.replace(/^ו(?=ל[א-ת])/, '');
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

    // 1. Split any task whose title contains ו-joined infinitives
    const splitTasks = raw.rawTasks.flatMap(splitVavInTitle);

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

    const tasks = splitTasks.map(function (t) {
      return { title: stripLeadingVav(t.title), time: t.time, date: t.date, assignee: t.assignee };
    });

    return res.status(200).json({
      tasks,
      needsReview:    raw.needsReview,
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
