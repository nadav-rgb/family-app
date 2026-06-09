/**
 * Unit tests for the deterministic title-preservation layer.
 *
 * Pure — NO network, NO API key. Feeds a transcript + the tasks the AI WOULD
 * return (with time/date words dropped from titles, as observed in production)
 * and asserts that the dropped time/date EXPRESSIONS are restored to the visible
 * title — without duplicating, without restoring doer/filler, and skipping
 * entirely when ownership is ambiguous.
 *
 * Run: node api/test-title-preserve-local.js
 *
 * Scope: title text ONLY. Never asserts time/date/assignee/count (those belong
 * to the temporal layer + AI and are passed through untouched).
 */

const { restoreTemporalPrefix } = require('./_lib/title-preserve');

let pass = 0, fail = 0;

function check(label, transcript, aiTasks, expectedTitles) {
  const got = restoreTemporalPrefix(transcript, aiTasks.map(t => ({ ...t })));
  const titles = got.map(t => t.title);
  const ok = titles.length === expectedTitles.length &&
    expectedTitles.every((e, i) => titles[i] === e);
  if (ok) { pass++; console.log('✅', label); }
  else {
    fail++;
    console.log('❌', label);
    console.log('   transcript:', transcript);
    console.log('   expected  :', JSON.stringify(expectedTitles));
    console.log('   got       :', JSON.stringify(titles));
  }
  // Guard: never mutate non-title fields.
  got.forEach((t, i) => {
    const src = aiTasks[i] || {};
    if (('assignee' in src) && t.assignee !== src.assignee) {
      fail++; console.log('   ❌ assignee mutated!', src.assignee, '→', t.assignee);
    }
  });
}

// ── Core: restore dropped leading date+time ───────────────────────────────────
check('date+time both dropped → restored in spoken order',
  'מחר בשמונה לקחת את הילדים לחוג',
  [{ title: 'לקחת את הילדים לחוג', time: '20:00', date: 'tomorrow', assignee: null }],
  ['מחר בשמונה לקחת את הילדים לחוג']);

check('half-hour + recipient (no doer restored)',
  'היום בשש וחצי להתקשר לאמא',
  [{ title: 'להתקשר לאמא', time: '18:30', date: 'today', assignee: null }],
  ['היום בשש וחצי להתקשר לאמא']);

// ── Forward-binding across a split (date inherits, time per-task) ──────────────
check('split: date to both, time only to its owner (forward)',
  'מחר לדבר עם משה ובשש לקחת את הילדים לחוג',
  [{ title: 'לדבר עם משה', time: null, date: 'tomorrow' },
   { title: 'לקחת את הילדים לחוג', time: '18:00', date: 'tomorrow' }],
  ['מחר לדבר עם משה', 'מחר בשש לקחת את הילדים לחוג']);

// ── No duplication ────────────────────────────────────────────────────────────
check('time already in title → only missing date prepended (no dup)',
  'מחר בשמונה לקחת את הילדים לחוג',
  [{ title: 'לקחת את הילדים לחוג בשמונה', time: '20:00', date: 'tomorrow' }],
  ['מחר לקחת את הילדים לחוג בשמונה']);

check('mid-title time present, no date → unchanged',
  'לבדוק חומר ב-11',
  [{ title: 'לבדוק חומר ב-11', time: '11:00', date: null }],
  ['לבדוק חומר ב-11']);

// ── No temporal at all → untouched ────────────────────────────────────────────
check('no time/date → titles unchanged',
  'לקנות חלב ולחם ואז לקבוע תור לרופא',
  [{ title: 'לקנות חלב ולחם', time: null, date: null },
   { title: 'לקבוע תור לרופא', time: null, date: null }],
  ['לקנות חלב ולחם', 'לקבוע תור לרופא']);

// ── Part-of-day restored; doer NOT restored ───────────────────────────────────
check('part-of-day restored, doer dropped stays dropped',
  'אמא תקנה חלב בערב',
  [{ title: 'לקנות חלב', time: null, date: null, assignee: 'mom' }],
  ['בערב לקנות חלב']);

// ── Filler NOT restored; date restored ────────────────────────────────────────
check('filler not restored, date restored',
  'מחר תזכיר לי להביא אישור לגן',
  [{ title: 'להביא אישור לגן', time: null, date: 'tomorrow' }],
  ['מחר להביא אישור לגן']);

// ── Day-of-week + hour + part-of-day all preserved ────────────────────────────
check('dow + hour + part-of-day all restored',
  'ביום שלישי בשמונה בערב להתקשר למרפאה',
  [{ title: 'להתקשר למרפאה', time: '20:00', date: null }],
  ['ביום שלישי בשמונה בערב להתקשר למרפאה']);

// ── Relative time preserved ───────────────────────────────────────────────────
check('relative time expression restored',
  'עוד שעה להתקשר לשליח',
  [{ title: 'להתקשר לשליח', time: null, date: null }],
  ['עוד שעה להתקשר לשליח']);

// ── Multi-segment part-of-day distribution ────────────────────────────────────
check('two part-of-day tokens each to its own task + date inherits',
  'תזכיר לי מחר בבוקר להתקשר לאמא ובערב לקנות מתנה',
  [{ title: 'להתקשר לאמא', time: null, date: 'tomorrow' },
   { title: 'לקנות מתנה', time: null, date: 'tomorrow' }],
  ['מחר בבוקר להתקשר לאמא', 'מחר בערב לקנות מתנה']);

// ── CONSERVATIVE: ambiguous anchor (verb repeats) → skip, no change ────────────
check('ambiguous anchor (verb appears twice) → skip restoration',
  'לקנות חלב ואז לקנות לחם בשש',
  [{ title: 'לקנות חלב', time: null, date: null },
   { title: 'לקנות לחם', time: '18:00', date: null }],
  ['לקנות חלב', 'לקנות לחם']);

// ── CONSERVATIVE: AI paraphrased verb not in transcript → skip ────────────────
check('locate fail (paraphrase) → skip restoration',
  'מחר בשמונה ללכת לים',
  [{ title: 'לשחות בים', time: '20:00', date: 'tomorrow' }],
  ['לשחות בים']);

console.log('\n' + '═'.repeat(52));
console.log(`TITLE-PRESERVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
