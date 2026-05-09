/**
 * Regression tests for post-processing aggressiveness.
 * Run: node --env-file=.env.local api/test-regression.js
 */

const handler = require('./parse-tasks');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeFakeRes() {
  const res = {
    _status: 200, _body: null,
    setHeader() { return this; },
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body;   return this; },
    end()        { return this; },
  };
  return res;
}

const CASES = [
  {
    label: '1. לקנות חלב וביצים',
    transcript: 'לקנות חלב וביצים',
    // "וביצים" = ו+noun, regex won't match → expect 1 task
    expectCount: 1,
    note: '"וביצים" לא מתחיל ב-ול → אין split',
  },
  {
    label: '2. להתקשר לאמא ולהגיד לה מזל טוב',
    transcript: 'להתקשר לאמא ולהגיד לה מזל טוב',
    // "ולהגיד" IS ו+infinitive → splitVavInTitle יפצל
    // שאלה: האם זה אגרסיבי מדי?
    expectCount: null, // לא מאסרטים — מציגים את הפלט בלבד
    note: '"ולהגיד" = ו+infinitive → splitVavInTitle יפצל. האם רצוי?',
  },
  {
    label: '3. להכין תיק ואוכל לילד',
    transcript: 'להכין תיק ואוכל לילד',
    // "ואוכל" = ו+noun → אין split
    expectCount: 1,
    note: '"ואוכל" לא מתחיל ב-ול → אין split',
  },
  {
    label: '4. לסדר שולחן וכיסאות',
    transcript: 'לסדר שולחן וכיסאות',
    // "וכיסאות" = ו+noun → אין split
    expectCount: 1,
    note: '"וכיסאות" לא מתחיל ב-ול → אין split',
  },
  {
    label: '5. לקנות חלב ולשלם חשמל',
    transcript: 'לקנות חלב ולשלם חשמל',
    // "ולשלם" = ו+infinitive → צריך split
    expectCount: 2,
    note: '"ולשלם" = ו+infinitive → split רצוי',
  },
];

const now = new Date();

async function run() {
  let pass = 0, fail = 0;

  for (const [i, tc] of CASES.entries()) {
    if (i > 0) await sleep(2000);

    console.log('\n' + '─'.repeat(60));
    console.log(tc.label);
    console.log('NOTE:', tc.note);

    const req = {
      method: 'POST',
      body: {
        transcript: tc.transcript,
        lang: 'he',
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
      },
    };
    const res = makeFakeRes();

    try {
      await handler(req, res);
      const b = res._body;

      console.log('RESULT:', JSON.stringify(b, null, 2));

      const countOk = tc.expectCount === null || b.tasks.length === tc.expectCount;
      const shapeOk = res._status === 200 && Array.isArray(b.tasks) && b.source === 'ai';

      if (shapeOk && countOk) {
        console.log(tc.expectCount === null
          ? '✅ shape OK (count not asserted — see output above)'
          : `✅ count === ${tc.expectCount}`);
        pass++;
      } else {
        if (!shapeOk) console.log('❌ shape failed');
        if (!countOk)  console.log(`❌ count: expected ${tc.expectCount}, got ${b.tasks.length}`);
        fail++;
      }
    } catch (err) {
      console.log('❌ EXCEPTION:', err.message);
      fail++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
}

run();
