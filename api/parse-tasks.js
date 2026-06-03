const { parseWithClaude } = require('./_providers/claude');
const { parseWithOpenAI } = require('./_providers/openai');
const { guard } = require('./_lib/guard');

const PROVIDER = process.env.AI_PROVIDER || 'claude';
const CONFIDENCE_THRESHOLD = 0.7;

// Container-scoped cold/warm marker: a fresh Vercel container starts with
// _invocations=0 → that first request paid the cold-start. Lets timing logs
// distinguish a cold container from a warm reuse. Additive instrumentation only.
let _invocations = 0;

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

// ─── Time/date-fragment merge ─────────────────────────────────────────────────
// gpt-4o-mini sometimes mis-splits a bare time/date phrase ("בשעה 14:00", "מחר",
// "14:00") into its own task. That is never a real task. This guard detects such a
// fragment and merges its time/date into the neighbouring action task, then drops it
// — so the time/date lands on the action it belongs to. Deterministic: the prompt
// asks the model not to do this, but the model still does, so we enforce it here.
const TIMEDATE_ONLY_RE = /^ו?\s*(?:בשעה\s*)?(?:\d{1,2}:\d{2}|\d{1,2}|מחרתיים|מחר|היום|בבוקר|בצהריי?ם|אחר[\s-]?הצהריים|בערב|בלילה)(?:\s+(?:בבוקר|בצהריי?ם|בערב|בלילה))?$/;

function isTimeDateOnly(title) {
  return TIMEDATE_ONLY_RE.test(String(title || '').trim());
}

function timeFromFragment(t) {
  if (t.time) return t.time;
  const m = String(t.title || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h  = Math.min(23, parseInt(m[1], 10));
  const mm = Math.min(59, parseInt(m[2], 10));
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function dateFromFragment(t) {
  if (t.date) return t.date;
  const s = String(t.title || '');
  if (/מחרתיים/.test(s)) return 'day-after-tomorrow';
  if (/מחר/.test(s))     return 'tomorrow';
  if (/היום/.test(s))    return 'today';
  return null;
}

function mergeTimeDateFragments(tasks) {
  if (!Array.isArray(tasks) || tasks.length <= 1) return tasks;
  const out = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (isTimeDateOnly(t.title)) {
      // Merge into the previous kept task; if the fragment leads, merge forward.
      const target = out.length ? out[out.length - 1] : tasks[i + 1];
      if (target) {
        const time = timeFromFragment(t);
        const date = dateFromFragment(t);
        if (time && !target.time) target.time = time;
        if (date && !target.date) target.date = date;
        continue; // drop the fragment — it is not a task
      }
    }
    out.push(t);
  }
  return out;
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
  // CORS + per-IP rate limit + optional friction (handles OPTIONS/method).
  if (!(await guard(req, res, 'parse-tasks'))) return;

  const _serverT0 = Date.now();
  const _cold     = _invocations === 0; // first request on this container
  _invocations++;

  const { transcript, lang = 'he', date, time, warm } = req.body || {};

  // ─── Keep-warm ping ───────────────────────────────────────────────────────
  // A real (not OPTIONS) POST sent on voice-screen entry to exercise the live
  // parser path — Vercel container + module init + OpenAI/Claude TLS connection
  // + model — so the user's first real parse after speaking skips the cold cost.
  // Fire-and-forget from the client; we run the provider with a trivial fixed
  // transcript and short-circuit before any post-processing. No user-visible
  // behavior, never reaches the task pipeline.
  if (warm) {
    let _ok = true;
    try {
      await (PROVIDER === 'openai'
        ? parseWithOpenAI('חימום', { lang, date, time })
        : parseWithClaude('חימום', { lang, date, time }));
    } catch (_) { _ok = false; }
    const ms = Date.now() - _serverT0;
    console.log(`[parse-tasks] warm ping cold=${_cold} ok=${_ok} ${ms}ms`);
    return res.status(200).json({ warmed: true, cold: _cold, serverMs: ms });
  }

  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  // Extract sentence-level assignee before the AI call (pattern: "X צריך/צריכה + tasks")
  const assigneeFromPreamble = extractPreambleAssignee(transcript);

  try {
    const context = { lang, date, time };
    const _aiT0 = Date.now();
    const raw = PROVIDER === 'openai'
      ? await parseWithOpenAI(transcript, context)
      : await parseWithClaude(transcript, context);
    const _aiMs = Date.now() - _aiT0;

    // 1. Trust the AI's split — the model is the brain. No local re-splitting.
    //    Exception: merge back any bare time/date fragment the model split off
    //    (e.g. "בשעה 14:00") so the time/date lands on its action, not a phantom task.
    const splitTasks = mergeTimeDateFragments(raw.rawTasks.slice());

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

    const _serverMs = Date.now() - _serverT0;
    console.log(`[parse-tasks] cold=${_cold} serverMs=${_serverMs} aiMs=${_aiMs} tasks=${tasks.length}`);

    return res.status(200).json({
      tasks,
      needsReview:    raw.needsReview || droppedAny,
      uncertainParts,
      source:         'ai',
      fallback:       false,
      _timing:        { serverMs: _serverMs, aiMs: _aiMs, cold: _cold },
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
