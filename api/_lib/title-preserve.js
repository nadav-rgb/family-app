/**
 * Deterministic title-preservation layer (server-side).
 *
 * Product decision (2026-06-09): time/date EXPRESSIONS must not disappear from
 * the user-visible task title. The AI (weak model) often drops a leading
 * "מחר בשמונה" even though the prompt says to keep it. This layer restores the
 * dropped time/date words to the title — and ONLY those words.
 *
 * Scope: TITLE TEXT ONLY. It never changes time/date/assignee/count/splits.
 * It runs AFTER applyTemporalOwnership in api/parse-tasks.js.
 *
 * CONSERVATIVE BY DESIGN: if it cannot confidently map an expression to exactly
 * one task (verb not found in transcript, or the task's anchor word is
 * ambiguous), it restores NOTHING for that task. Missing a restoration is
 * acceptable; adding the wrong words is not.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SYNC NOTE: the regexes below are an INTENTIONAL, SELF-CONTAINED copy of   │
 * │ the temporal vocabulary in api/_lib/temporal.js. They are deliberately    │
 * │ NOT imported, to keep the proven temporal-ownership layer locked and      │
 * │ untouched. If temporal.js's date/time vocabulary changes, update these    │
 * │ regexes to match. Keep them in sync manually.                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

'use strict';

// ── Temporal vocabulary (keep in sync with temporal.js — see SYNC NOTE) ───────

const DATE_RE = /מחרתיים|מחר|היום|ביום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/g;

const HOUR_WORD = '(?:אחת\\s+עשרה|אחד\\s+עשר|שתים\\s+עשרה|שנים\\s+עשר|שתיים|שתים|שלוש|שלש|ארבע|חמש|שש|שבע|שמונה|תשע|עשרה|עשר|אחת|אחד)';
const MOD       = '(?:\\s+(?:וחצי|ורבע|פחות\\s+רבע))?';
const REL       = '(?:עוד\\s+שעתיים|עוד\\s+חצי\\s+שעה|עוד\\s+שעה|עוד\\s+\\d+\\s+שעות?|עוד\\s+\\d+\\s+דקות?)';
const CLOCK     = '(?:בשעה\\s+\\d{1,2}(?::\\d{2})?|ב[-–]?\\d{1,2}:\\d{2}|ב[-–\\s]\\d{1,2}(?!\\d)|\\d{1,2}:\\d{2})';
const WORDH     = '(?:ב(?:שעה\\s+)?' + HOUR_WORD + MOD + ')';
const PARTOFDAY = '(?:בבוקר|בצהריי?ם|אחר[\\s-]?הצהריים|לפני[\\s-]?הצהריים|בערב|בלילה|מוקדם)';

// Order matters: longest / most-specific first so e.g. "בשש וחצי" wins over "בשש".
const TIME_RE = new RegExp([REL, CLOCK, WORDH, PARTOFDAY].join('|'), 'g');

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s || '').replace(/[.,;:!?״׳"'\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleHas(title, token) {
  return norm(title).includes(norm(token));
}

// A token is a valid word-start match if it begins the string, follows
// whitespace, or follows a connector "ו" (so "ובשש" yields the token "בשש").
function validBoundary(text, idx) {
  if (idx === 0) return true;
  const c = text[idx - 1];
  return c === ' ' || c === '\t' || c === 'ו';
}

function findTokens(text, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] && validBoundary(text, m.index)) out.push({ text: m[0], start: m.index });
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-length loops
  }
  return out;
}

// Tiny stopword set: words too generic to anchor on (appear everywhere).
const STOP = new Set(['את', 'של', 'עם', 'על', 'אל', 'לי', 'לו', 'לה', 'כל', 'גם', 'אז', 'הזה']);

// Task anchor = position in the raw transcript of the FIRST title word that
// actually appears there. We scan past the leading verb (the AI may have
// infinitivized a conjugated verb — "תקנה" → "לקנות" — which won't be in the
// transcript) and past stopwords, anchoring on the first findable content word.
// ambiguous=true when that word appears more than once (can't anchor reliably).
function anchorOf(title, transcript) {
  const words = String(title || '').trim().split(/\s+/);
  for (const w of words) {
    if (w.length < 2 || STOP.has(w)) continue;
    const idx = transcript.indexOf(w);
    if (idx === -1) continue;
    const ambiguous = transcript.indexOf(w, idx + 1) !== -1;
    return { idx, ambiguous };
  }
  return { idx: -1, ambiguous: false };
}

// Which task owns a temporal token: the nearest verb-anchor AFTER it
// (forward-binding); if none after, the nearest anchor BEFORE it (same clause).
// Only considers usable (found, unambiguous) anchors. Returns task index or -1.
function ownerIndex(tokenStart, anchors) {
  let after = -1, afterIdx = Infinity;
  let before = -1, beforeIdx = -Infinity;
  anchors.forEach((a, i) => {
    if (a.idx < 0 || a.ambiguous) return;
    if (a.idx > tokenStart && a.idx < afterIdx) { afterIdx = a.idx; after = i; }
    if (a.idx <= tokenStart && a.idx > beforeIdx) { beforeIdx = a.idx; before = i; }
  });
  return after !== -1 ? after : before;
}

// ── Public entry point ─────────────────────────────────────────────────────────

function restoreTemporalPrefix(transcript, tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks;
  const T = String(transcript || '');
  if (!T) return tasks;

  const anchors    = tasks.map(t => anchorOf(t.title, T));
  const dateTokens = findTokens(T, DATE_RE);
  const timeTokens = findTokens(T, TIME_RE);
  const globalDate = dateTokens.length ? dateTokens[0] : null;

  // Pre-assign each time token to its owning task (forward-binding).
  const timeOwner = timeTokens.map(tok => ownerIndex(tok.start, anchors));

  tasks.forEach((task, i) => {
    const a = anchors[i];
    if (a.idx < 0 || a.ambiguous) return; // CONSERVATIVE: can't place → restore nothing

    const toAdd = [];

    // DATE: nearest date token at/before the anchor; else the sentence-level date.
    let dateTok = null;
    for (const d of dateTokens) {
      if (d.start <= a.idx && (!dateTok || d.start > dateTok.start)) dateTok = d;
    }
    if (!dateTok) dateTok = globalDate;
    if (dateTok && !titleHas(task.title, dateTok.text)) toAdd.push(dateTok);

    // TIME / part-of-day: only the token(s) that forward-bind to THIS task.
    timeTokens.forEach((tok, k) => {
      if (timeOwner[k] === i && !titleHas(task.title, tok.text)) toAdd.push(tok);
    });

    if (!toAdd.length) return;

    // Prepend in spoken order; never reorder the existing title.
    toAdd.sort((x, y) => x.start - y.start);
    const prefix = toAdd.map(t => t.text).join(' ');
    task.title = (prefix + ' ' + task.title).trim();
  });

  return tasks;
}

module.exports = {
  restoreTemporalPrefix,
  _internals: { findTokens, anchorOf, ownerIndex, DATE_RE, TIME_RE },
};
