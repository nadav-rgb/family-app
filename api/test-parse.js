/**
 * Parser test suite — run with:
 *   node --env-file=.env.local api/test-parse.js
 */

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

const handler = require('./parse-tasks');

const DELAY_MS = parseInt(process.env.TEST_DELAY_MS || '2000', 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── helpers ────────────────────────────────────────────────────────────────
function check(results, label, condition, detail) {
  const ok = !!condition;
  results.push({ ok, label, detail: ok ? '' : (detail || '') });
  return ok;
}

function shapeOk(b) {
  if (!b || !Array.isArray(b.tasks)) return false;
  if (typeof b.needsReview !== 'boolean') return false;
  if (!Array.isArray(b.uncertainParts)) return false;
  if (b.source !== 'ai' && b.source !== 'local') return false;
  if (typeof b.fallback !== 'boolean') return false;
  return b.tasks.every(t =>
    typeof t.title === 'string' &&
    (t.time === null || /^\d{2}:\d{2}$/.test(t.time)) &&
    (t.assignee === null || ['mom','dad','dudi','yonatan'].includes(t.assignee))
  );
}

// ─── test cases ─────────────────────────────────────────────────────────────
// expectCount      exact task count (omit if ambiguous)
// expectTitles     keyword per task[i] title (ordered, omit slots with undefined)
// expectTimes      time string per task[i], undefined = skip
// expectDates      date label per task[i], undefined = skip
// expectAssignees  assignee per task[i], undefined = skip
// expectNeedsReview  if set, must match exactly
// expectFallback   default false

const TEST_CASES = [

  // ── ORIGINAL 6 ─────────────────────────────────────────────────────────────

  {
    label: '⭐ canonical 3-task split',
    transcript: 'להתקשר לאמא לקבוע תור לרופא שיניים מחר בתשע וללכת לבנק בשתיים',
    expectCount: 3,
    // Full substrings — "להתקשר לאמא" fails if AI strips the recipient name
    expectTitles:    ['להתקשר לאמא', 'לקבוע תור לרופא שיניים', 'ללכת לבנק'],
    expectTimes:     [null, '09:00', '14:00'],
    expectDates:     ['tomorrow', 'tomorrow', 'tomorrow'],
    expectNeedsReview: false,
  },
  {
    label: 'movement+purpose = 1 task',
    transcript: 'לנסוע לסופר לקנות ירקות לארוחת ערב',
    expectCount: 1,
    expectTitles: ['לנסוע'],
    expectNeedsReview: false,
  },
  {
    label: 'subordinate clause = no split',
    transcript: 'להתקשר לגן ולבקש שישלחו את הטופס',
    expectCount: 1,
    expectNeedsReview: false,
  },
  {
    label: 'assignee detection mom+dad',
    transcript: 'אמא תקנה חלב בערב ואבא יאסוף את יונתן מהאימון בשעה חמש',
    expectCount: 2,
    expectTitles:    ['חלב', 'יונתן'],
    expectAssignees: ['mom', 'dad'],
  },
  {
    label: 'shared preamble date → 3 tasks',
    transcript: 'מחר בבוקר להתקשר לרופא ולשלוח את הדוח בצהריים ולקנות תרופה בערב',
    expectCount: 3,
    expectDates: ['tomorrow', 'tomorrow', 'tomorrow'],
  },
  {
    label: 'no assignee → needsReview false',
    transcript: 'לשלם חשמל ולקנות חלב',
    expectCount: 2,
    expectNeedsReview: false,
  },

  // ── NEW: consecutive verbs without ו ───────────────────────────────────────

  {
    label: '3 verbs no ו — buy/pay/collect',
    transcript: 'לקנות חלב לשלם חשבון חשמל לאסוף את יונתן',
    expectCount: 3,
    expectTitles: ['חלב', 'חשמל', 'יונתן'],
    expectNeedsReview: false,
  },
  {
    label: '2 verbs no ו — clean+cook',
    transcript: 'לנקות את הבית לבשל ארוחת ערב',
    expectCount: 2,
    expectTitles: ['לנקות', 'לבשל'],
    expectNeedsReview: false,
  },
  {
    label: '3 verbs no ו — cooking chain',
    transcript: 'לקנות ירקות לבשל מרק להכין עוגה לשישי',
    expectCount: 3,
    expectTitles: ['ירקות', 'מרק', 'עוגה'],
  },

  // ── NEW: with ו ────────────────────────────────────────────────────────────

  {
    label: 'ו split — wash+tidy',
    transcript: 'לשטוף כלים ולסדר את הסלון',
    expectCount: 2,
    expectTitles: ['כלים', 'סלון'],
    expectNeedsReview: false,
  },
  {
    label: 'ו split — pay+renew',
    transcript: 'לשלם ארנונה ולחדש רישיון רכב',
    expectCount: 2,
    expectTitles: ['ארנונה', 'רישיון'],
    expectNeedsReview: false,
  },
  {
    label: 'office chain — send/read/sign',
    transcript: 'לשלוח מייל לעומר לקרוא חוזה ולחתום על המסמכים',
    expectCount: 3,
    expectTitles: ['מייל', 'חוזה', 'מסמכים'],
  },

  // ── NEW: date/time context ─────────────────────────────────────────────────

  {
    label: 'today + time + assignee',
    transcript: 'היום בצהריים לקנות תרופות לדודי',
    expectCount: 1,
    expectDates:  ['today'],
    expectTimes:  ['12:00'],
  },
  {
    label: 'movement+purpose with time',
    transcript: 'לנסוע לקניון לקנות נעליים ליונתן בשלוש',
    expectCount: 1,
    expectTimes: ['15:00'],
  },
  {
    label: 'one long task with time',
    transcript: 'להזמין שולחן במסעדה לארבעה אנשים לשישי בערב בשמונה',
    expectCount: 1,
    expectTimes: ['20:00'],
  },
  {
    label: 'half-hour time — 2:30',
    transcript: 'לאסוף את דודי מהגן בשתיים וחצי',
    expectCount: 1,
    expectTimes: ['14:30'],
    expectNeedsReview: false,
  },

  // ── NEW: family phrasing ───────────────────────────────────────────────────

  {
    label: 'assignee mom — take dudi',
    transcript: 'אמא צריכה לקחת את דודי לחוג בשלוש',
    expectCount: 1,
    expectAssignees: ['mom'],
    expectTimes:     ['15:00'],
  },
  {
    label: 'assignee yonatan — 2 tasks',
    transcript: 'יונתן צריך לסדר את החדר ולעשות שיעורים לפני שבע',
    expectCount: 2,
    expectAssignees: ['yonatan', 'yonatan'],
  },
  {
    label: 'assignee dad — pool tomorrow',
    transcript: 'אבא ייקח את הילדים לבריכה מחר בעשר',
    expectCount: 1,
    expectAssignees: ['dad'],
    expectDates:     ['tomorrow'],
    expectTimes:     ['10:00'],
  },
  {
    label: 'reminder phrasing',
    transcript: 'תזכיר לי להתקשר לסבתא היום בערב',
    expectCount: 1,
    expectDates: ['today'],
    expectNeedsReview: false,
  },
  {
    label: 'shopping list = 1 task',
    transcript: 'לקנות חלב ביצים לחם ופירות',
    expectCount: 1,
    expectTitles: ['לקנות'],
  },
  {
    label: 'minimal — no date no time no assignee',
    transcript: 'לבדוק את הדואר',
    expectCount: 1,
    expectNeedsReview: false,
  },
  {
    label: 'tomorrow + 2 tasks via ו',
    transcript: 'מחר להתקשר לביטוח לאומי ולהגיש את הטופס',
    expectCount: 2,
    expectDates: ['tomorrow', 'tomorrow'],
  },
  {
    label: 'pet tasks via ו',
    transcript: 'להזמין מזון לכלב ולשלם לווטרינר',
    expectCount: 2,
  },
];

// ─── runner ──────────────────────────────────────────────────────────────────
const now = new Date();

async function runAll() {
  let totalPass = 0, totalFail = 0;
  const failedCases = [];
  const sampleFullOutputs = [];

  for (const [idx, tc] of TEST_CASES.entries()) {
    if (idx > 0) await sleep(DELAY_MS);
    const req = {
      method: 'POST',
      body: {
        transcript: tc.transcript,
        lang:       'he',
        date:       now.toISOString().split('T')[0],
        time:       now.toTimeString().slice(0, 5),
      },
    };
    const res = makeFakeRes();
    const checks = [];
    let casePass = true;

    try {
      await handler(req, res);
      const b = res._body;

      check(checks, 'status 200',             res._status === 200);
      check(checks, 'canonical shape',        shapeOk(b));
      check(checks, 'source === "ai"',        b && b.source === 'ai');
      check(checks, 'fallback === false',     b && b.fallback === false);

      if (tc.expectCount !== undefined)
        check(checks, `count === ${tc.expectCount}`, b.tasks.length === tc.expectCount,
              `got ${b.tasks.length}`);

      (tc.expectTitles || []).forEach((kw, i) => {
        if (kw === undefined) return;
        check(checks, `tasks[${i}].title ∋ "${kw}"`,
              b.tasks[i] && b.tasks[i].title.includes(kw),
              b.tasks[i] ? `"${b.tasks[i].title}"` : 'missing');
      });

      (tc.expectTimes || []).forEach((t, i) => {
        if (t === undefined) return;
        check(checks, `tasks[${i}].time === ${JSON.stringify(t)}`,
              b.tasks[i] && b.tasks[i].time === t,
              b.tasks[i] ? `got "${b.tasks[i].time}"` : 'missing');
      });

      (tc.expectDates || []).forEach((d, i) => {
        if (d === undefined) return;
        check(checks, `tasks[${i}].date === "${d}"`,
              b.tasks[i] && b.tasks[i].date === d,
              b.tasks[i] ? `got "${b.tasks[i].date}"` : 'missing');
      });

      (tc.expectAssignees || []).forEach((a, i) => {
        if (a === undefined) return;
        check(checks, `tasks[${i}].assignee === "${a}"`,
              b.tasks[i] && b.tasks[i].assignee === a,
              b.tasks[i] ? `got "${b.tasks[i].assignee}"` : 'missing');
      });

      if (tc.expectNeedsReview !== undefined)
        check(checks, `needsReview === ${tc.expectNeedsReview}`,
              b.needsReview === tc.expectNeedsReview, `got ${b && b.needsReview}`);

      casePass = checks.every(c => c.ok);
      if (casePass) {
        totalPass++;
      } else {
        totalFail++;
        failedCases.push({ label: tc.label, transcript: tc.transcript, result: b, checks });
      }

      // Collect first 3 full outputs for display
      if (sampleFullOutputs.length < 3) {
        sampleFullOutputs.push({ label: tc.label, transcript: tc.transcript, result: b });
      }

    } catch (err) {
      check(checks, 'no exception', false, err.message);
      casePass = false;
      totalFail++;
      failedCases.push({ label: tc.label, transcript: tc.transcript, error: err.message, checks });
    }

    const icon = casePass ? '✅' : '❌';
    const failDetails = checks.filter(c => !c.ok).map(c => `    ✗ ${c.label}${c.detail ? ' — ' + c.detail : ''}`).join('\n');
    console.log(`${icon} ${tc.label}`);
    if (failDetails) console.log(failDetails);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`TOTAL: ${totalPass} passed, ${totalFail} failed out of ${TEST_CASES.length}`);

  // ── 3 sample full outputs ─────────────────────────────────────────────────
  console.log('\n── 3 sample full outputs ──────────────────────────────────');
  sampleFullOutputs.forEach(s => {
    console.log(`\n[${s.label}]`);
    console.log('INPUT:', s.transcript);
    console.log(JSON.stringify(s.result, null, 2));
  });

  // ── Failed cases detail ───────────────────────────────────────────────────
  if (failedCases.length > 0) {
    console.log('\n── Failed cases detail ─────────────────────────────────────');
    failedCases.forEach(f => {
      console.log(`\n[FAIL] ${f.label}`);
      console.log('INPUT:', f.transcript);
      if (f.error) {
        console.log('ERROR:', f.error);
      } else {
        console.log('RESULT:', JSON.stringify(f.result, null, 2));
        f.checks.filter(c => !c.ok).forEach(c =>
          console.log(`  ✗ ${c.label}${c.detail ? ' — ' + c.detail : ''}`)
        );
      }
    });
  }

  if (totalFail > 0) process.exit(1);
}

runAll();
