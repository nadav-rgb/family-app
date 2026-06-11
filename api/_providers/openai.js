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
      "title": "task in Hebrew — keep time/date words exactly as spoken; strip only filler and the doer's name",
      "assignedTo": null,
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
  • CRITICAL — NEVER output a task whose title is only a time or date. A clock time
    ("14:00", "9:30", "בשעה 14:00"), a date ("מחר", "היום"), or a part-of-day ("בבוקר",
    "בערב") is ALWAYS part of the action it modifies — put it in that task's mins/date.
    WRONG → ["לקנות חלב", "בשעה 14:00"].   RIGHT → ONE task "לקנות חלב בשעה 14:00" (keep the phrase in the title; mins=840 is internal only).
  • When unsure whether it is one task or two, return ONE task.

Each task title must make sense on its own. If you do split and the parts share a
topic, include that shared topic in every title (don't leave a bare verb like "להכין").

Examples:
  "לקנות חלב"        → ONE task: "לקנות חלב"
  "להתקשר לאמא"      → ONE task: "להתקשר לאמא"
  "לבדוק חומר ב-11"  → ONE task: "לבדוק חומר ב-11" (keep "ב-11" in title), mins=660 (11:00, internal only)
  "הרצאה של שחר לייבו לבדוק חומר להכין" → shared topic is "חומר להרצאה של שחר לייבו":
      ONE task:  "להכין ולבדוק חומר להרצאה של שחר לייבו"   (preferred)
      or TWO:    "לבדוק חומר להרצאה של שחר לייבו"
                 "להכין חומר להרצאה של שחר לייבו"
  "לקנות חלב לשלם חשבון חשמל" → TWO independent tasks: "לקנות חלב" + "לשלם חשבון חשמל"
  "להתקשר לשמעון להשאיר הודעה לסבתא מרי" → TWO tasks (different people): "להתקשר לשמעון" + "להשאיר הודעה לסבתא מרי"
  "להתקשר לשמעון ואז להשאיר הודעה לסבתא מרי" → TWO tasks ("ואז"/"אחר כך" = sequential, independent actions)

Keep together as ONE task (do not split):
  • Movement + its purpose:   "לנסוע לסופר לקנות ירקות"
    Movement verbs: ללכת, לנסוע, לצאת, לקפוץ, לעלות, לרדת, לחזור, לטוס, לרוץ
  • One verb + several objects: "לקנות חלב וביצים"  ("אוכל"/"חלב" are objects, not verbs)
  • Call + its message to the SAME person: "להתקשר לאמא ולהגיד לה מזל טוב"
    (a follow-up action aimed at a DIFFERENT person is independent → SPLIT it)
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
  Strip: filler ONLY. KEEP time phrases and date words ("מחר", "היום", "בשעה 4", "ב-21:00") verbatim in the title — they are part of the spoken text and must stay.
  Filler to strip — ONLY a LEADING opener at the very start: "אני צריך", "אני חייב", "בבקשה", "תזכיר לי", "תזכרי לי". NEVER strip a word from the middle of the sentence. When in doubt, KEEP the word — prefer the full spoken text.
  NEVER strip a person name. Keep EVERY name verbatim in the title, including a leading
  name or doer — assignment is a manual action (assignedTo is ALWAYS null), so the model
  must never remove a name:
    "אבא צריך להוציא אוכל" → title stays "אבא צריך להוציא אוכל"
    "אמא תקנה חלב"        → title stays "אמא תקנה חלב"
    "להתקשר לאמא"         → title stays "להתקשר לאמא"
    "לאסוף את דודי"       → title stays "לאסוף את דודי"
  PRESERVE THE EXACT WORD ORDER as spoken — NEVER reorder words and NEVER move a
  time/date phrase to the front or the end. The title is the spoken sentence in its
  original word order.

assignedTo:
  ALWAYS null. Do NOT infer, guess, or assign any person — not from a name at the
  start, not from a conjugated verb, not from a sentence subject. Assigning a task to
  someone is a manual user action handled outside the model. Always return assignedTo: null.

mins:
  Minutes from midnight as an integer.

  Digital clock times map directly to mins: "14:00" → 840, "9:30" → 570, "08:15" → 495.
  "בשעה" before a time stays in the title verbatim; still set mins (internal only).

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
