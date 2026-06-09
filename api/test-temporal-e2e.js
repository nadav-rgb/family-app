/**
 * End-to-end verification of the temporal-ownership layer through the REAL
 * parse-tasks handler (real AI split + deterministic temporal layer).
 *
 * Run: node --env-file=.env.local api/test-temporal-e2e.js
 *
 * Asserts temporal OWNERSHIP only (which action carries which time) — task
 * boundaries/titles are the AI's job and may vary slightly run to run.
 */

const handler = require('./parse-tasks');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeFakeRes() {
  return {
    _status: 200, _body: null,
    setHeader() { return this; },
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
  };
}

// For each transcript: which substring should OWN a time, and what time.
// The "other" task(s) must NOT carry that time.
const CASES = [
  { t: 'מחר להתקשר למשה ובשש לקחת את הילדים לחוג', owner: 'לקחת', time: '18:00', notOwner: 'להתקשר' },
  { t: 'מחר לקנות חלב ובשמונה לדבר עם שמעון',       owner: 'לדבר',  time: '20:00', notOwner: 'לקנות' },
  { t: 'מחר בשמונה לדבר עם הרב ובתשע לקנות חלב',    owner: 'לקנות', time: '09:00', notOwner: 'לדבר' },
  { t: 'מחר בבוקר להתקשר לאמא ובערב לקנות מתנה',    owner: 'לקנות', time: null,    notOwner: 'להתקשר' },
];

const now = new Date();

async function run() {
  let pass = 0, fail = 0;
  for (const [i, c] of CASES.entries()) {
    if (i > 0) await sleep(2500);
    const req = { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' }, body: {
      transcript: c.t, lang: 'he',
      date: now.toISOString().split('T')[0], time: now.toTimeString().slice(0, 5),
    }};
    const res = makeFakeRes();
    await handler(req, res);
    const tasks = (res._body && res._body.tasks) || [];

    const ownerTask = tasks.find(x => String(x.title).includes(c.owner));
    const otherTask = tasks.find(x => String(x.title).includes(c.notOwner));
    const ownerOk = ownerTask ? (ownerTask.time === c.time) : false;
    const otherOk = otherTask ? (otherTask.time !== c.time || c.time === null && otherTask.time === null ? otherTask.time !== c.time || true : otherTask.time !== c.time) : true;
    // simpler: the non-owner must not carry the owner's (non-null) time
    const otherClean = !otherTask || c.time === null || otherTask.time !== c.time;

    const ok = ownerOk && otherClean;
    if (ok) pass++; else fail++;
    console.log(ok ? '✅' : '❌', c.t);
    console.log('   tasks:', JSON.stringify(tasks.map(x => ({ title: x.title, time: x.time, date: x.date })), null, 0));
    if (!ok) console.log(`   expected "${c.owner}"→${c.time}, "${c.notOwner}"≠${c.time}`);
  }
  console.log('\n' + '═'.repeat(50));
  console.log(`E2E TEMPORAL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
