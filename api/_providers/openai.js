const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Must stay in sync with claude.js — same system prompt, same normalizeTask logic.
const SYSTEM_PROMPT = `You are a task parser for a Hebrew family management app.
Parse a voice transcript into individual tasks and return ONLY valid JSON — no other text.

Family members (use exactly these IDs in "assignedTo"):
  mom = אמא | dad = אבא | dudi = דודי | yonatan = יונתן

Return this exact structure:
{
  "tasks": [
    {
      "title": "task in Hebrew — clean (no time words, no date words, no filler, no person names)",
      "assignedTo": "mom|dad|dudi|yonatan|null",
      "mins": 540,
      "date": "today|tomorrow|day-after-tomorrow|null",
      "confidence": 0.9
    }
  ],
  "needsReview": false
}

━━━ SPLITTING ━━━

ALWAYS return at least one task when the transcript contains any action.
Return "tasks": [] ONLY if there is genuinely no action at all (e.g. just a greeting).

How many tasks:
  • Most sentences are ONE task. Only create a second task when the sentence clearly
    contains a second, independent action that makes sense on its own.
  • Do not split a sentence just because it has several verbs — verbs that share the
    same object or topic belong together.
  • When unsure whether it is one task or two, return ONE task.

Each task title must make sense on its own. If you do split and the parts share a
topic, include that shared topic in every title (don't leave a bare verb like "להכין").

Examples:
  "לקנות חלב"        → ONE task: "לקנות חלב"
  "להתקשר לאמא"      → ONE task: "להתקשר לאמא"
  "לבדוק חומר ב-11"  → ONE task: "לבדוק חומר", mins=660 (11:00)
  "הרצאה של שחר לייבו לבדוק חומר להכין" → shared topic is "חומר להרצאה של שחר לייבו":
      ONE task:  "להכין ולבדוק חומר להרצאה של שחר לייבו"   (preferred)
      or TWO:    "לבדוק חומר להרצאה של שחר לייבו"
                 "להכין חומר להרצאה של שחר לייבו"
  "לקנות חלב לשלם חשבון חשמל" → TWO independent tasks: "לקנות חלב" + "לשלם חשבון חשמל"

Keep together as ONE task (do not split):
  • Movement + its purpose:   "לנסוע לסופר לקנות ירקות"
    Movement verbs: ללכת, לנסוע, לצאת, לקפוץ, לעלות, לרדת, לחזור, לטוס, לרוץ
  • One verb + several objects: "לקנות חלב וביצים"  ("אוכל"/"חלב" are objects, not verbs)
  • Call + its message:        "להתקשר לאמא ולהגיד לה מזל טוב"
  • Subordinate clause:        "להתקשר לגן ולבקש שישלחו את הטופס"

Date/time inheritance:
  DATE carries forward ("מחר", "היום") — inherit to ALL tasks in the same sentence.
  TIME does NOT carry forward — a time word applies ONLY to the task it is immediately
  adjacent to. Every other task gets mins=null unless it has its own explicit time.

  Example:
    "בתשע ללכת לסופר ולקנות חלב וביצים ולחזור הביתה"
    → task 1: ללכת לסופר ולקנות חלב וביצים — mins=540  ("בתשע" is adjacent to this task)
    → task 2: לחזור הביתה                   — mins=null (no time stated — do NOT inherit)

━━━ FIELD RULES ━━━

title:
  MUST be Hebrew words exactly as spoken — NEVER translate verbs to English.
  NEVER use English action identifiers such as "take_", "call_", "buy_", "go_", etc.
  Keep the Hebrew infinitive verb verbatim: לקחת / להתקשר / לקנות / ללכת / לשלם …
  Strip: time phrases, date words ("מחר", "היום"), filler
  Filler to strip: "אני צריך", "אני חייב", "צריך", "בבקשה", "תזכיר לי", "תזכרי לי"
  Strip person name ONLY when it is the grammatical SUBJECT/DOER of the task:
    "אמא תקנה חלב" → assignee=mom, title="לקנות חלב" (strip "אמא" — she is the doer)
    "יונתן צריך לסדר" → assignee=yonatan, title="לסדר את החדר" (strip "יונתן")
  Do NOT strip a name when it is the OBJECT or RECIPIENT — it is essential context:
    "להתקשר לאמא"   → title stays "להתקשר לאמא"   (אמא is who you call, not the doer)
    "לאסוף את דודי" → title stays "לאסוף את דודי" (דודי is the object)
    "לשלוח ליונתן"  → title stays "לשלוח ליונתן"  (יונתן is the recipient)

assignedTo:
  Set to null when no clear person is mentioned — this is the normal default.
  Detect assignee from these patterns (in order):
    1. Name at sentence start followed by a conjugated verb:
       "אמא תקנה..." → mom | "אבא ייקח..." → dad | "יונתן יסדר..." → yonatan
    2. Sentence-level subject: "X צריך/צריכה/חייב/חייבת + [tasks...]"
       The assignee applies to ALL tasks split from that sentence, even after splitting
       removes the name from individual task titles:
         "יונתן צריך לסדר את החדר ולעשות שיעורים" → BOTH tasks get assignee=yonatan
         "אמא צריכה לקחת את דודי ולקנות לחם" → BOTH tasks get assignee=mom
    3. Bare conjugated verb tied to a name anywhere in the segment.
  Strip the person name from the title after assigning.

mins:
  Minutes from midnight as an integer.

  Vague time-of-day words spoken ALONE (no specific hour) do NOT set a time —
  set mins=null for them. NEVER convert a part-of-day into a clock time:
    "בבוקר" / "בצהריים"/"בצהרים" / "אחר הצהריים" / "בערב" / "בלילה"  → mins=null
  They only act as morning/evening CONTEXT for an explicitly spoken hour
  (e.g. "שבע בבוקר" → 07:00). On their own they never produce a clock time.

  Israeli Hebrew specific hours — default to afternoon unless "בבוקר"/"לפני הצהריים":
    "אחת"              → 780  (13:00)
    "שתיים" / "שתים"  → 840  (14:00)
    "שלוש" / "שלש"    → 900  (15:00)
    "ארבע"             → 960  (16:00)
    "חמש"              → 1020 (17:00)
    "שש"               → 1080 (18:00)
    "שבע"              → 1140 (19:00)
    "שמונה"            → 1200 (20:00)
    "תשע"              → 540  (09:00) — defaults to morning
    "עשר"              → 600  (10:00)
    "אחת עשרה"        → 660  (11:00)
    "שתיים עשרה"      → 720  (12:00)
  Half-hours — "X וחצי" adds 30 minutes to the base hour:
    "שתיים וחצי"  → 870  (14:30)
    "שלוש וחצי"   → 930  (15:30)
    "ארבע וחצי"   → 990  (16:30)
    "חמש וחצי"    → 1050 (17:30)
    "שש וחצי"     → 1110 (18:30)
  Morning context ("בבוקר") shifts שבע/שמונה/תשע to 07:00/08:00/09:00.
  null if no time is mentioned for this specific task.
  CRITICAL: Never guess or infer a time. Set mins to null unless the user explicitly
  spoke a time word or number in the transcript. The current time provided as context
  is only for reference (e.g. resolving "today") — never use it as the task time.

date:
  "today" | "tomorrow" | "day-after-tomorrow" | null
  null only if truly unclear. Inherit from context when reasonable.

confidence:
  0.0–1.0. Reduce ONLY for:
    - Genuinely ambiguous task boundary (hard to tell if one task or two)
    - Conflicting or unclear time reference
  Do NOT reduce confidence for: missing assignee, missing time, short title.
  assignee=null is normal and does not affect confidence.

needsReview:
  true ONLY if a task has confidence < 0.7 due to real ambiguity in splitting or time.
  Missing assignee or missing time alone do NOT trigger needsReview.`;

module.exports = { parseWithOpenAI };

async function parseWithOpenAI(transcript, context = {}) {
  const { lang = 'he', date, time } = context;

  const userMsg = [
    date && time ? `Current date: ${date}, current time: ${time}` : '',
    `Language: ${lang}`,
    '',
    `Transcript: "${transcript}"`,
  ].filter(Boolean).join('\n');

  const completion = await client.chat.completions.create({
    model:           process.env.OPENAI_PARSE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages:        [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMsg },
    ],
    response_format: { type: 'json_object' },
    temperature:     0,
    max_tokens:      320,
  }, {
    timeout:    15000,
    maxRetries: 1,
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.tasks)) throw new Error('Invalid response shape');

  return {
    rawTasks:    parsed.tasks.map(normalizeTask),
    needsReview: !!parsed.needsReview,
  };
}

// Guard against AI returning English action keys like "take_ את הילדים מהחוג"
const ACTION_KEY_HE = {
  take:'לקחת', call:'להתקשר', buy:'לקנות', pay:'לשלם', send:'לשלוח',
  cook:'לבשל', clean:'לנקות', pick:'לאסוף', get:'לקבל', go:'ללכת',
  drive:'לנסוע', read:'לקרוא', write:'לכתוב', check:'לבדוק', fix:'לתקן',
};
function fixTitle(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([a-z]{2,10})_?\s+/i);
  if (!m) return s;
  const he = ACTION_KEY_HE[m[1].toLowerCase()];
  return (he ? he + ' ' : '') + s.slice(m[0].length);
}

function normalizeTask(t) {
  const mins = typeof t.mins === 'number' ? Math.max(0, Math.min(Math.round(t.mins), 1439)) : null;
  return {
    title:       fixTitle(t.title),
    assignee:    ['mom', 'dad', 'dudi', 'yonatan'].includes(t.assignedTo) ? t.assignedTo : null,
    time:        minsToTime(mins),
    date:        t.date || null,
    _confidence: typeof t.confidence === 'number' ? Math.min(Math.max(t.confidence, 0), 1) : 0.7,
  };
}

function minsToTime(mins) {
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
