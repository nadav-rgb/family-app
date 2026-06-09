/**
 * Deterministic temporal-ownership layer (server-side).
 *
 * Per the locked parser contract (2026-06-09):
 *   • AI owns:            task boundaries, meaning, assignees, shopping grouping.
 *   • THIS layer owns:    temporal ownership, inheritance, direction, and
 *                         time/date fragment cleanup.
 *
 * It operates on the RAW transcript (never on the AI's cleaned titles), so the
 * relative position of a time word vs. each verb — the information that decides
 * ownership — is preserved. The logic here is a faithful port of the proven
 * pieces of parser.js (findVerbPositions, forwardTemporalPrefix, extractTime)
 * so we reuse proven behavior WITHOUT coupling to the browser-only parser file.
 *
 * Public API:
 *   applyTemporalOwnership(transcript, aiTasks, ctx?) -> aiTasks
 *     Mutates ONLY each task's `time` and `date`. Never touches title / assignee
 *     / count (those belong to the AI). ctx.nowMins is consulted only for
 *     relative phrases ("עוד שעה").
 */

'use strict';

// ── Dictionaries (ported verbatim from parser.js LANG_CONFIG.he) ──────────────

const TASK_VERBS = [
  'להתקשר','להתכונן','להתחיל','להתאמן','להתפנות',
  'להוריד','להעלות','להחזיר','להזמין','להכין','להביא','להוציא','להגיע',
  'לאסוף','לאכול',
  'לבדוק','לבשל',
  'לנסוע','לנקות','לנהוג','ללכת',
  'לסדר','לסיים',
  'לקנות','לקחת','לקבוע','לקבל','לקרוא',
  'לשלם','לשלוח','לשמור','לשטוף',
  'לטפל','לתקן',
  'לפגוש','לפנות','לפתוח',
  'לרשום','לדבר',
  'לענות','לעדכן',
  'לחפש','לחזור','לחכות',
  'לדווח','למצוא','למסור',
  'לכתוב',
].sort((a, b) => b.length - a.length);

// Word-hour → base hour (multi-word MUST precede single-word). Ported from parser.js.
const WORD_HOURS = [
  ['אחת עשרה', 11], ['אחד עשר', 11],
  ['שתים עשרה', 12], ['שנים עשר', 12],
  ['אחת', 1], ['אחד', 1],
  ['שתיים', 2], ['שתים', 2],
  ['שלוש', 3], ['שלש', 3],
  ['ארבע', 4], ['חמש', 5], ['שש', 6], ['שבע', 7],
  ['שמונה', 8], ['תשע', 9],
  ['עשרה', 10], ['עשר', 10],
];

const MOD_RE = '(?:\\s+(וחצי|ורבע|פחות\\s+רבע))?';
const MORNING_RE = /בבוקר|לפני.{0,3}הצהריים/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyMod(base, mod) {
  if (!mod) return base;
  if (mod.includes('וחצי')) return base + 30;
  if (mod.includes('ורבע')) return base + 15;
  if (mod.includes('פחות')) return base - 15;
  return base;
}

// Israeli-Hebrew bare-hour convention (matches the AI prompt's mins table, which
// the test bank validates): a bare hour 1–8 defaults to the AFTERNOON/evening
// (שש→18:00, שמונה→20:00); 9–12 stay morning (תשע→09:00). Morning context
// ("בבוקר"/"לפני הצהריים") keeps the literal hour. Explicit HH:MM never shifts.
function israeliHour(base, hasMorning) {
  if (hasMorning) return base;
  if (base >= 1 && base <= 8) return base + 12;
  return base;
}

function isWordStart(text, idx) {
  if (idx === 0) return true;
  const c = text[idx - 1];
  if (c === ' ' || c === '\t') return true;
  if (c === 'ו') return idx === 1 || text[idx - 2] === ' ' || text[idx - 2] === '\t';
  return false;
}

function minsToTime(mins) {
  if (mins === null || mins === undefined) return null;
  const m = Math.max(0, Math.min(Math.round(mins), 23 * 60 + 59));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// ── Verb segmentation (ported from parser.js findVerbPositions) ────────────────

function findVerbPositions(text) {
  const seen = new Set();
  const results = [];
  for (const verb of TASK_VERBS) {
    let i = 0;
    while (true) {
      const idx = text.indexOf(verb, i);
      if (idx === -1) break;
      i = idx + 1;
      const after = text[idx + verb.length];
      if (after !== undefined && after !== ' ' && after !== '\t') continue;
      if (!isWordStart(text, idx)) continue;
      if (seen.has(idx)) continue;
      seen.add(idx);
      results.push({ pos: idx, verb, hasVav: idx > 0 && text[idx - 1] === 'ו' });
    }
  }
  return results.sort((a, b) => a.pos - b.pos);
}

// A coordinated temporal prefix ("...ובשש לקחת") belongs to the verb AFTER it:
// the previous segment ends before the "ו"; the next segment starts at the time.
// Ported from parser.js forwardTemporalPrefix.
function forwardTemporalPrefix(text, verbPos) {
  const before = text.slice(0, verbPos);
  const HOUR = '(?:\\d{1,2}(?::\\d{2})?|אחת\\s+עשרה|אחד\\s+עשר|שתים\\s+עשרה|שתיים|שתים|שלוש|שלש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד)';
  const TEMPORAL = '(?:ב(?:שעה\\s+)?' + HOUR + '(?:\\s+(?:בבוקר|בצהריי?ם|בערב|בלילה))?|בבוקר|בצהריי?ם|אחר[\\s-]?הצהריים|בערב|בלילה|ביום\\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))';
  const m = before.match(new RegExp('(?:^|\\s)(ו' + TEMPORAL + ')\\s*$'));
  if (!m) return null;
  const boundaryStart = m.index + m[0].indexOf(m[1]);
  return { boundaryStart, segmentStart: boundaryStart + 1 };
}

// ── Time extraction within a segment (ported + Israeli-hour convention) ────────

function extractMins(text, nowMins) {
  let m;

  // Explicit HH:MM am/pm — never shifted.
  m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)\b/i);
  if (m) {
    let h = +m[1];
    const pm = m[3].toLowerCase() === 'pm';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + +m[2];
  }

  // Explicit bare HH:MM — never shifted.
  m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return +m[1] * 60 + +m[2];

  // Relative phrases (need now).
  if (typeof nowMins === 'number') {
    if (/עוד\s+שעתיים/.test(text)) return nowMins + 120;
    if (/עוד\s+שעה/.test(text))    return nowMins + 60;
    m = text.match(/עוד\s+(\d+)\s+שעות?/); if (m) return nowMins + +m[1] * 60;
    m = text.match(/עוד\s+(\d+)\s+דקות?/); if (m) return nowMins + +m[1];
  }

  const hasMorning = MORNING_RE.test(text);

  // Digit hour with Hebrew prefix: "בשעה 8", "ב-8", "ב 4".
  m = text.match(/(?:בשעה\s+|ב[-–\s]?)(\d{1,2})(?::(\d{2}))?(?!\d)/);
  if (m) {
    let h = +m[1];
    const min = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 23) {
      if (min === 0 && !m[2]) h = israeliHour(h, hasMorning);
      if (h >= 0 && h <= 23) return h * 60 + min;
    }
  }

  // Word hours.
  for (const [word, base] of WORD_HOURS) {
    m = text.match(new RegExp('(?:בשעה\\s+|ב[-–]?)' + word + MOD_RE));
    if (m) return applyMod(israeliHour(base, hasMorning) * 60, m[1]);
  }

  // Part-of-day alone never produces a clock time.
  return null;
}

// ── Date extraction (only the labels the schema supports) ─────────────────────

function extractDateLabel(text) {
  if (/מחרתיים/.test(text)) return 'day-after-tomorrow';
  if (/מחר/.test(text))     return 'tomorrow';
  if (/היום/.test(text))    return 'today';
  return null; // day-of-week etc. left to the AI's own date field
}

// ── Build per-verb temporal segments over the raw transcript ──────────────────

function buildSegments(transcript, nowMins) {
  const verbs = findVerbPositions(transcript);

  if (verbs.length === 0) {
    return [{ start: 0, end: transcript.length, mins: extractMins(transcript, nowMins), date: extractDateLabel(transcript) }];
  }

  // Segment starts: the first segment includes the preamble (so a leading
  // time/date is owned by the first action). Later segments pull their start
  // back over any "ו+temporal" prefix that belongs to them.
  const starts = [0];
  for (let i = 1; i < verbs.length; i++) {
    const fwd = forwardTemporalPrefix(transcript, verbs[i].pos);
    starts.push(fwd ? fwd.segmentStart : verbs[i].pos);
  }

  const segs = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : transcript.length;
    const segText = transcript.slice(start, end);
    segs.push({ start, end, mins: extractMins(segText, nowMins), date: extractDateLabel(segText) });
  }
  return segs;
}

// Locate where an AI task's content sits in the raw transcript, so we can map it
// to the segment that owns its time. Uses the task's first verb (preferred) or
// first word. Returns -1 if not found (caller falls back to the AI's own value).
function locateTask(title, transcript) {
  const t = String(title || '').trim();
  if (!t) return -1;
  const verbs = findVerbPositions(t);
  const needle = verbs.length ? verbs[0].verb : t.split(/\s+/)[0];
  return transcript.indexOf(needle);
}

function segmentForPos(segs, pos) {
  for (const s of segs) if (pos >= s.start && pos < s.end) return s;
  return null;
}

// ── Fragment cleanup (ported from parse-tasks.js mergeTimeDateFragments) ───────
// A task whose whole title is just a time/date is never a real task — merge its
// time/date into a neighbour and drop it.

const TIMEDATE_ONLY_RE = /^ו?\s*(?:בשעה\s*)?(?:\d{1,2}:\d{2}|\d{1,2}|מחרתיים|מחר|היום|בבוקר|בצהריי?ם|אחר[\s-]?הצהריים|בערב|בלילה)(?:\s+(?:בבוקר|בצהריי?ם|בערב|בלילה))?$/;

function isTimeDateOnly(title) {
  return TIMEDATE_ONLY_RE.test(String(title || '').trim());
}

function dropTimeDateFragments(tasks) {
  if (!Array.isArray(tasks) || tasks.length <= 1) return tasks.slice();
  const out = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (isTimeDateOnly(t.title)) {
      const target = out.length ? out[out.length - 1] : tasks[i + 1];
      if (target) {
        if (t.time && !target.time) target.time = t.time;
        if (t.date && !target.date) target.date = t.date;
        continue; // drop the fragment
      }
    }
    out.push(t);
  }
  return out;
}

// ── Public entry point ─────────────────────────────────────────────────────────

function applyTemporalOwnership(transcript, aiTasks, ctx = {}) {
  const tasks = dropTimeDateFragments(Array.isArray(aiTasks) ? aiTasks : []);
  if (!tasks.length) return tasks;

  const src = String(transcript || '');
  const nowMins = typeof ctx.nowMins === 'number' ? ctx.nowMins : null;

  const segs = buildSegments(src, nowMins);
  const globalDate = extractDateLabel(src); // inheritance: nearest spoken date

  for (const task of tasks) {
    const pos = locateTask(task.title, src);
    if (pos === -1) continue; // can't anchor → keep the AI's own time/date

    const seg = segmentForPos(segs, pos);

    // TIME: the deterministic layer fully owns this. A located task with no time
    // in its owning segment gets null (we never invent a clock time).
    task.time = seg ? minsToTime(seg.mins) : null;

    // DATE: segment's own date wins, else inherit the sentence-level date, else
    // keep whatever the AI had.
    const segDate = seg && seg.date;
    task.date = segDate || globalDate || task.date || null;
  }

  return tasks;
}

module.exports = {
  applyTemporalOwnership,
  // exported for focused testing / reuse
  _internals: { buildSegments, extractMins, extractDateLabel, locateTask, dropTimeDateFragments },
};
