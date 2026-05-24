/**
 * A/B model comparison for Hebrew task parsing.
 * Runs the SAME production pipeline (api/parse-tasks → _providers/openai) against
 * several models, swapping only process.env.OPENAI_MODEL between runs.
 *
 * Does NOT change production. Read-only analysis tool.
 *
 * Run:
 *   node --env-file=.env.local api/test-model-compare.js
 * Optional:
 *   TEST_MODELS="gpt-4o-mini,gpt-4.1-mini,gpt-4.1-nano"  (override list)
 *   TEST_DELAY_MS=400                                     (pause between calls)
 *
 * NOTE: this makes real OpenAI API calls on OPENAI_API_KEY (cases × models).
 */

const OpenAI = require('openai');
const handler = require('./parse-tasks');

const MODELS = (process.env.TEST_MODELS ||
  'gpt-4o-mini,gpt-4.1-mini,gpt-4.1-nano').split(',').map(s => s.trim()).filter(Boolean);
const DELAY_MS  = parseInt(process.env.TEST_DELAY_MS || '400', 10);
const BASELINE  = MODELS[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Golden test set (mirrors api/test-parse.js) ──────────────────────────────
const TEST_CASES = [
  { label:'canonical 3-task split', transcript:'להתקשר לאמא לקבוע תור לרופא שיניים מחר בתשע וללכת לבנק בשתיים',
    expectCount:3, expectTitles:['להתקשר לאמא','לקבוע תור לרופא שיניים','ללכת לבנק'],
    expectTimes:[null,'09:00','14:00'], expectDates:['tomorrow','tomorrow','tomorrow'], expectNeedsReview:false },
  { label:'movement+purpose = 1 task', transcript:'לנסוע לסופר לקנות ירקות לארוחת ערב',
    expectCount:1, expectTitles:['לנסוע'], expectNeedsReview:false },
  { label:'subordinate clause = no split', transcript:'להתקשר לגן ולבקש שישלחו את הטופס',
    expectCount:1, expectNeedsReview:false },
  { label:'assignee mom+dad', transcript:'אמא תקנה חלב בערב ואבא יאסוף את יונתן מהאימון בשעה חמש',
    expectCount:2, expectTitles:['חלב','יונתן'], expectAssignees:['mom','dad'] },
  { label:'shared preamble date → 3 tasks', transcript:'מחר בבוקר להתקשר לרופא ולשלוח את הדוח בצהריים ולקנות תרופה בערב',
    expectCount:3, expectDates:['tomorrow','tomorrow','tomorrow'] },
  { label:'no assignee → needsReview false', transcript:'לשלם חשמל ולקנות חלב',
    expectCount:2, expectNeedsReview:false },
  { label:'3 verbs no ו — buy/pay/collect', transcript:'לקנות חלב לשלם חשבון חשמל לאסוף את יונתן',
    expectCount:3, expectTitles:['חלב','חשמל','יונתן'], expectNeedsReview:false },
  { label:'2 verbs no ו — clean+cook', transcript:'לנקות את הבית לבשל ארוחת ערב',
    expectCount:2, expectTitles:['לנקות','לבשל'], expectNeedsReview:false },
  { label:'3 verbs no ו — cooking chain', transcript:'לקנות ירקות לבשל מרק להכין עוגה לשישי',
    expectCount:3, expectTitles:['ירקות','מרק','עוגה'] },
  { label:'ו split — wash+tidy', transcript:'לשטוף כלים ולסדר את הסלון',
    expectCount:2, expectTitles:['כלים','סלון'], expectNeedsReview:false },
  { label:'ו split — pay+renew', transcript:'לשלם ארנונה ולחדש רישיון רכב',
    expectCount:2, expectTitles:['ארנונה','רישיון'], expectNeedsReview:false },
  { label:'office chain — send/read/sign', transcript:'לשלוח מייל לעומר לקרוא חוזה ולחתום על המסמכים',
    expectCount:3, expectTitles:['מייל','חוזה','מסמכים'] },
  { label:'today + time + assignee', transcript:'היום בצהריים לקנות תרופות לדודי',
    expectCount:1, expectDates:['today'], expectTimes:['12:00'] },
  { label:'movement+purpose with time', transcript:'לנסוע לקניון לקנות נעליים ליונתן בשלוש',
    expectCount:1, expectTimes:['15:00'] },
  { label:'one long task with time', transcript:'להזמין שולחן במסעדה לארבעה אנשים לשישי בערב בשמונה',
    expectCount:1, expectTimes:['20:00'] },
  { label:'half-hour time — 2:30', transcript:'לאסוף את דודי מהגן בשתיים וחצי',
    expectCount:1, expectTimes:['14:30'], expectNeedsReview:false },
  { label:'assignee mom — take dudi', transcript:'אמא צריכה לקחת את דודי לחוג בשלוש',
    expectCount:1, expectAssignees:['mom'], expectTimes:['15:00'] },
  { label:'assignee yonatan — 2 tasks', transcript:'יונתן צריך לסדר את החדר ולעשות שיעורים לפני שבע',
    expectCount:2, expectAssignees:['yonatan','yonatan'] },
  { label:'assignee dad — pool tomorrow', transcript:'אבא ייקח את הילדים לבריכה מחר בעשר',
    expectCount:1, expectAssignees:['dad'], expectDates:['tomorrow'], expectTimes:['10:00'] },
  { label:'reminder phrasing', transcript:'תזכיר לי להתקשר לסבתא היום בערב',
    expectCount:1, expectDates:['today'], expectNeedsReview:false },
  { label:'shopping list = 1 task', transcript:'לקנות חלב ביצים לחם ופירות',
    expectCount:1, expectTitles:['לקנות'] },
  { label:'minimal — no date/time/assignee', transcript:'לבדוק את הדואר',
    expectCount:1, expectNeedsReview:false },
  { label:'tomorrow + 2 tasks via ו', transcript:'מחר להתקשר לביטוח לאומי ולהגיש את הטופס',
    expectCount:2, expectDates:['tomorrow','tomorrow'] },
  { label:'pet tasks via ו', transcript:'להזמין מזון לכלב ולשלם לווטרינר',
    expectCount:2 },
];

const now = new Date();

// ─── per-case scoring ─────────────────────────────────────────────────────────
function scoreCase(tc, b) {
  const fields = {};
  const def = v => v !== undefined;
  if (def(tc.expectCount))   fields.count   = b.tasks.length === tc.expectCount;
  if (tc.expectTitles)       fields.titles  = tc.expectTitles.every((kw,i)=> kw===undefined || (b.tasks[i] && b.tasks[i].title.includes(kw)));
  if (tc.expectTimes)        fields.time    = tc.expectTimes.every((t,i)=> t===undefined || (b.tasks[i] && b.tasks[i].time === t));
  if (tc.expectDates)        fields.date    = tc.expectDates.every((d,i)=> d===undefined || (b.tasks[i] && b.tasks[i].date === d));
  if (tc.expectAssignees)    fields.assignee= tc.expectAssignees.every((a,i)=> a===undefined || (b.tasks[i] && b.tasks[i].assignee === a));
  if (def(tc.expectNeedsReview)) fields.needsReview = b.needsReview === tc.expectNeedsReview;
  const pass = Object.values(fields).every(Boolean);
  return { pass, fields };
}

async function probeModel(model) {
  // Direct minimal call to surface a clear "model not available" error.
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await client.chat.completions.create({
      model, max_tokens: 5,
      messages: [{ role:'user', content:'ping' }],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && (e.message || e.code)) || String(e) };
  }
}

async function runModel(model) {
  process.env.OPENAI_MODEL = model;
  const perCase = {};
  const latencies = [];
  let passed = 0, errored = 0, needsReviewCount = 0;
  const fieldTally = { count:[0,0], titles:[0,0], time:[0,0], date:[0,0], assignee:[0,0], needsReview:[0,0] };

  for (const [idx, tc] of TEST_CASES.entries()) {
    if (idx > 0) await sleep(DELAY_MS);
    const req = { method:'POST', body:{ transcript: tc.transcript, lang:'he',
      date: now.toISOString().split('T')[0], time: now.toTimeString().slice(0,5) } };
    const res = { _status:200,_body:null, setHeader(){return this;}, status(c){this._status=c;return this;}, json(b){this._body=b;return this;}, end(){return this;} };

    const t0 = Date.now();
    try { await handler(req, res); } catch (e) { res._status = 500; res._body = { error:e.message }; }
    const dt = Date.now() - t0;

    const b = res._body;
    if (res._status !== 200 || !b || !Array.isArray(b.tasks) || b.fallback) {
      errored++;
      perCase[tc.label] = { pass:false, errored:true };
      continue;
    }
    latencies.push(dt);
    if (b.needsReview) needsReviewCount++;
    const sc = scoreCase(tc, b);
    perCase[tc.label] = sc;
    if (sc.pass) passed++;
    for (const k of Object.keys(fieldTally)) {
      if (sc.fields[k] !== undefined) { fieldTally[k][1]++; if (sc.fields[k]) fieldTally[k][0]++; }
    }
  }

  latencies.sort((a,b)=>a-b);
  const avg = latencies.length ? Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length) : 0;
  const p50 = latencies.length ? latencies[Math.floor(latencies.length*0.5)] : 0;
  const p95 = latencies.length ? latencies[Math.floor(latencies.length*0.95)] : 0;
  return { model, passed, total:TEST_CASES.length, errored, needsReviewCount, avg, p50, p95, perCase, fieldTally };
}

function pct(a,b){ return b ? Math.round(100*a/b) : 0; }

(async () => {
  console.log(`\nModels: ${MODELS.join(', ')}`);
  console.log(`Cases:  ${TEST_CASES.length}  |  delay ${DELAY_MS}ms  |  baseline: ${BASELINE}\n`);

  const results = [];
  for (const model of MODELS) {
    process.stdout.write(`probing ${model} … `);
    const probe = await probeModel(model);
    if (!probe.ok) { console.log(`UNAVAILABLE (${probe.error})`); results.push({ model, unavailable:true, error:probe.error }); continue; }
    console.log('ok — running');
    results.push(await runModel(model));
  }

  console.log('\n══════════════ RESULTS ══════════════');
  console.log('model'.padEnd(16), 'pass'.padEnd(9), 'err'.padEnd(5), 'needsRev'.padEnd(9), 'avg ms'.padEnd(8), 'p50'.padEnd(7), 'p95');
  for (const r of results) {
    if (r.unavailable) { console.log(r.model.padEnd(16), 'UNAVAILABLE — '+r.error); continue; }
    console.log(
      r.model.padEnd(16),
      `${r.passed}/${r.total} (${pct(r.passed,r.total)}%)`.padEnd(9),
      String(r.errored).padEnd(5),
      String(r.needsReviewCount).padEnd(9),
      String(r.avg).padEnd(8),
      String(r.p50).padEnd(7),
      String(r.p95),
    );
  }

  console.log('\n── field-level accuracy (% correct of applicable cases) ──');
  console.log('model'.padEnd(16), 'count'.padEnd(7), 'titles'.padEnd(8), 'time'.padEnd(7), 'date'.padEnd(7), 'assignee');
  for (const r of results) {
    if (r.unavailable) continue;
    const f = r.fieldTally;
    console.log(
      r.model.padEnd(16),
      `${pct(...f.count)}%`.padEnd(7),
      `${pct(...f.titles)}%`.padEnd(8),
      `${pct(...f.time)}%`.padEnd(7),
      `${pct(...f.date)}%`.padEnd(7),
      `${pct(...f.assignee)}%`,
    );
  }

  // Regressions vs baseline
  const base = results.find(r => r.model === BASELINE && !r.unavailable);
  if (base) {
    for (const r of results) {
      if (r.unavailable || r.model === BASELINE) continue;
      const regressions = TEST_CASES.filter(tc =>
        base.perCase[tc.label]?.pass && !r.perCase[tc.label]?.pass).map(tc => tc.label);
      const gains = TEST_CASES.filter(tc =>
        !base.perCase[tc.label]?.pass && r.perCase[tc.label]?.pass).map(tc => tc.label);
      console.log(`\n── ${r.model} vs ${BASELINE} ──`);
      console.log(`  regressions (${regressions.length}): ${regressions.join(' | ') || 'none'}`);
      console.log(`  gains       (${gains.length}): ${gains.join(' | ') || 'none'}`);
    }
  }
  console.log('');
})();
