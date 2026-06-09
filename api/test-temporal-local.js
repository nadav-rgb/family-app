/**
 * Unit tests for the deterministic temporal-ownership layer.
 *
 * Pure — NO network, NO API key. We feed in a transcript + the tasks the AI
 * WOULD return (already split / cleaned by the model) and assert that the
 * deterministic layer assigns time/date ownership correctly.
 *
 * Run: node api/test-temporal-local.js
 *
 * Scope under test (per the locked parser contract):
 *   temporal ownership · temporal inheritance · temporal direction ·
 *   time/date fragment cleanup.
 * NOT under test here: task boundaries, meaning, assignees, shopping — those
 * stay with the AI and are represented by the fixed `aiTasks` inputs below.
 */

const { applyTemporalOwnership } = require('./_lib/temporal');

// now is only consulted for relative phrases ("עוד שעה"); fixed for determinism.
const CTX = { nowMins: 10 * 60 };

let pass = 0, fail = 0;

function check(label, transcript, aiTasks, expected) {
  const got = applyTemporalOwnership(transcript, aiTasks.map(t => ({ ...t })), CTX);
  const norm = got.map(t => ({ time: t.time ?? null, date: t.date ?? null }));
  const ok =
    norm.length === expected.length &&
    expected.every((e, i) => norm[i] && norm[i].time === e.time && norm[i].date === e.date);

  if (ok) { pass++; console.log('✅', label); }
  else {
    fail++;
    console.log('❌', label);
    console.log('   transcript:', transcript);
    console.log('   expected  :', JSON.stringify(expected));
    console.log('   got       :', JSON.stringify(norm));
  }
}

// ── The core failing family: temporal direction (time binds FORWARD) ──────────

check(
  'דירקציה: זמן באמצע נקשר קדימה למשימה 2 (לא אחורה)',
  'מחר להתקשר למשה ובשש לקחת את הילדים לחוג',
  // AI may have WRONGLY put 18:00 on task 1 — the layer must correct it.
  [{ title: 'להתקשר למשה', time: '18:00', date: 'tomorrow' },
   { title: 'לקחת את הילדים לחוג', time: null, date: 'tomorrow' }],
  [{ time: null, date: 'tomorrow' },
   { time: '18:00', date: 'tomorrow' }]
);

check(
  'דירקציה: שמונה שייך ל"לדבר", לא ל"לקנות"',
  'מחר לקנות חלב ובשמונה לדבר עם שמעון',
  [{ title: 'לקנות חלב', time: null, date: 'tomorrow' },
   { title: 'לדבר עם שמעון', time: null, date: 'tomorrow' }],
  [{ time: null, date: 'tomorrow' },
   { time: '20:00', date: 'tomorrow' }]
);

check(
  'חלקי-יום בלבד אינם קובעים שעה (שניהם null)',
  'מחר בבוקר להתקשר לאמא ובערב לקנות מתנה',
  [{ title: 'להתקשר לאמא', time: null, date: 'tomorrow' },
   { title: 'לקנות מתנה', time: null, date: 'tomorrow' }],
  [{ time: null, date: 'tomorrow' },
   { time: null, date: 'tomorrow' }]
);

check(
  'שתי שעות מפורשות → כל אחת למשימה שלה',
  'מחר בשמונה לדבר עם הרב ובתשע לקנות חלב',
  [{ title: 'לדבר עם הרב', time: null, date: 'tomorrow' },
   { title: 'לקנות חלב', time: null, date: 'tomorrow' }],
  [{ time: '20:00', date: 'tomorrow' },
   { time: '09:00', date: 'tomorrow' }]
);

// ── Ownership within a single task (time AFTER the verb, same clause) ──────────

check(
  'שעה אחרי הפועל באותה פסוקית (משימה אחת)',
  'לבדוק חומר ב-11',
  [{ title: 'לבדוק חומר ב-11', time: null, date: null }],
  [{ time: '11:00', date: null }]
);

check(
  'הקשר בוקר: "בשש בבוקר" → 06:00 (לא 18:00)',
  'מחר בשש בבוקר להעיר את יעל לטיול',
  [{ title: 'להעיר את יעל לטיול', time: null, date: 'tomorrow' }],
  [{ time: '06:00', date: 'tomorrow' }]
);

check(
  'דיפולט אחה"צ ישראלי: "בארבע" → 16:00',
  'לקחת את יואבי לחוג כדורגל בארבע',
  [{ title: 'לקחת את יואבי לחוג כדורגל בארבע', time: null, date: null }],
  [{ time: '16:00', date: null }]
);

// ── No invention / preservation ───────────────────────────────────────────────

check(
  'אין שעה → נשאר null (לא ממציאים)',
  'לקנות חלב',
  [{ title: 'לקנות חלב', time: null, date: null }],
  [{ time: null, date: null }]
);

check(
  'ירושת תאריך לכל המשימות; שעה רק לצמודה',
  'היום לשלם חשבון ובשלוש להתקשר לאינסטלטור',
  [{ title: 'לשלם חשבון', time: null, date: 'today' },
   { title: 'להתקשר לאינסטלטור', time: null, date: 'today' }],
  [{ time: null, date: 'today' },
   { time: '15:00', date: 'today' }]
);

// ── Fragment cleanup (time/date-only phantom task) ────────────────────────────

check(
  'ניקוי שבר: משימת-שעה רפאים נבלעת לשכן ונמחקת',
  'לקנות חלב בשעה 14:00',
  [{ title: 'לקנות חלב', time: null, date: null },
   { title: 'בשעה 14:00', time: '14:00', date: null }],
  [{ time: '14:00', date: null }]
);

console.log('\n' + '═'.repeat(50));
console.log(`TEMPORAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
