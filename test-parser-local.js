// Deterministic regression tests for the LOCAL fallback parser (parser.js).
// The local parser runs when the AI call is aborted (slow network) — these guard
// the P0 fixes (ללכת split, noun-phrase completion, preamble date+time carry).
// No browser, no network. Run:  node test-parser-local.js
const fs   = require('fs');
const path = require('path');

// Minimal window shim so the browser IIFE in parser.js loads under Node.
globalThis.window   = globalThis;
globalThis.location = { hostname: 'node' }; // not localhost → skip parser.js self-tests
eval(fs.readFileSync(path.join(__dirname, 'parser.js'), 'utf8'));
const HP = globalThis.HebrewParser;

const NOW  = new Date('2026-05-27T10:00:00');
const opts = { now: NOW, lang: 'he' };
const L    = (text) => HP.parseTasksLocal(text, opts).tasks;

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { pass++; console.log('✅ ' + label); }
  else      { fail++; console.log('❌ ' + label + (got !== undefined ? '  GOT: ' + JSON.stringify(got) : '')); }
}

// ── P0 #1: split at ללכת, keep the noun phrase whole ──────────────────────────
let t = L('לסדר את הדוח בעירייה ללכת לבנק בשעה 14:00');
check('P0#1 → 2 tasks',                       t.length === 2,                                t.map(x => x.title));
check('P0#1 task1 = "לסדר את הדוח בעירייה"',  t[0] && t[0].title === 'לסדר את הדוח בעירייה', t[0] && t[0].title);
check('P0#1 task2 starts "ללכת לבנק"',        t[1] && t[1].title.startsWith('ללכת לבנק'),    t[1] && t[1].title);
check('P0#1 task2 time = 14:00',              t[1] && t[1].time === '14:00',                 t[1] && t[1].time);

// ── P0 #2: preamble date AND time preserved ───────────────────────────────────
t = L('מחר בשעה 2 לקחת את לאלי לחוג');
check('P0#2 → 1 task',                        t.length === 1,                                t.map(x => x.title));
check('P0#2 title = "לקחת את לאלי לחוג"',     t[0] && t[0].title === 'לקחת את לאלי לחוג',     t[0] && t[0].title);
check('P0#2 date = tomorrow',                 t[0] && t[0].date === 'tomorrow',              t[0] && t[0].date);
check('P0#2 time = 14:00',                    t[0] && t[0].time === '14:00',                 t[0] && t[0].time);
// control: time-only preamble (no "מחר") must also keep the time
t = L('בשעה 2 לקחת את לאלי לחוג');
check('P0#2 control (no מחר): time = 14:00',  t.length === 1 && t[0].time === '14:00',       t.map(x => ({ t: x.title, m: x.time, d: x.date })));

// ── noun-phrase completion guard: never "verb + את" standalone ────────────────
t = L('לסדר את ולקנות חלב');
check('dangling guard: no "לסדר את" alone',   t.every(x => x.title.trim() !== 'לסדר את'),    t.map(x => x.title));
t = L('לסדר את החדר');
check('normal "לסדר את החדר" stays intact',   t.length === 1 && t[0].title === 'לסדר את החדר', t.map(x => x.title));

// ── no regression: REG1 + shopping stay ONE task locally ──────────────────────
t = L('לקנות חלב בשעה 14:00');
check('REG1 local: 1 task @14:00',            t.length === 1 && t[0].time === '14:00',       t.map(x => ({ t: x.title, m: x.time })));
t = L('לקנות חלב גבינה צהובה עגבניות מלפפונים');
check('shopping local: stays 1 task',         t.length === 1,                                t.map(x => x.title));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
