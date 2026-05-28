/**
 * BASELINE LOCK — production endpoint regression tests for parse-tasks.
 *
 * Locks the CURRENT good OpenAI parsing behavior so future speed work cannot
 * destroy task splitting / time-date handling / shopping recognition.
 *
 * Asserts on: count, title (substring), time, date, source, fallback.
 * Does NOT assert on: assignee (out of scope for this lock).
 *
 * Run:   node --env-file=.env.local api/test-baseline-lock.js
 *
 * Requires .env.local with:
 *   AI_PROVIDER=openai
 *   OPENAI_API_KEY=sk-...
 */

const handler = require('./parse-tasks');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeFakeRes() {
  return {
    _status: 200,
    _body: null,
    setHeader() { return this; },
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body;   return this; },
    end()        { return this; },
  };
}

let pass = 0, fail = 0;
function check(label, cond, got) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else      { fail++; console.log('  ❌ ' + label + (got !== undefined ? '  GOT: ' + JSON.stringify(got) : '')); }
}

// All cases share these envelope assertions: 200 + source:ai + fallback:false.
function checkEnvelope(b, status) {
  check('http 200',           status === 200,                            status);
  check('source === ai',      b && b.source === 'ai',                    b && b.source);
  check('fallback === false', b && b.fallback === false,                 b && b.fallback);
  check('tasks is Array',     b && Array.isArray(b.tasks),               b && typeof b.tasks);
}

// title-substring matcher (LLM may phrase slightly differently)
const titleHas = (t, sub) => typeof t.title === 'string' && t.title.indexOf(sub) !== -1;

const now = new Date();
async function runCase(label, transcript, asserts) {
  console.log('\n' + '─'.repeat(60));
  console.log(label);
  console.log('INPUT: ' + transcript);

  const req = {
    method: 'POST',
    body: {
      transcript,
      lang: 'he',
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0, 5),
    },
  };
  const res = makeFakeRes();
  try {
    await handler(req, res);
    const b = res._body;
    console.log('RESULT: ' + JSON.stringify(b));
    checkEnvelope(b, res._status);
    if (b && Array.isArray(b.tasks)) asserts(b.tasks);
  } catch (err) {
    console.log('  ❌ EXCEPTION: ' + err.message);
    fail++;
  }
}

async function run() {
  console.log('═'.repeat(60));
  console.log('BASELINE LOCK — production parse-tasks behavior');
  console.log('AI_PROVIDER: ' + (process.env.AI_PROVIDER || '(default)'));
  console.log('═'.repeat(60));

  // ── 1. Shopping with a time — one task, time:14:00, no "בשעה" standalone ────
  await runCase('1. shopping with time stays one task', 'לקנות חלב בשעה 14:00', (tasks) => {
    check('count === 1',                tasks.length === 1,                                       tasks.length);
    check('title includes "לקנות חלב"', tasks[0] && titleHas(tasks[0], 'לקנות חלב'),              tasks[0] && tasks[0].title);
    check('time === "14:00"',           tasks[0] && tasks[0].time === '14:00',                    tasks[0] && tasks[0].time);
    check('no task starts with "בשעה"', !tasks.some(t => /^\s*בשעה/.test((t.title || '').trim())), tasks.map(t => t.title));
  });
  await sleep(1500);

  // ── 2. "ואז" → must split into 2 ───────────────────────────────────────────
  await runCase('2. "ואז" splits into 2 tasks', 'להתקשר לשמעון ואז להשאיר הודעה לסבתא מרי', (tasks) => {
    check('count === 2',                          tasks.length === 2,                                                  tasks.length);
    check('task 1 includes "שמעון"',              tasks[0] && titleHas(tasks[0], 'שמעון'),                             tasks[0] && tasks[0].title);
    check('task 2 includes "סבתא מרי"',           tasks[1] && titleHas(tasks[1], 'סבתא מרי'),                          tasks[1] && tasks[1].title);
    check('task 1 includes "להתקשר"',             tasks[0] && titleHas(tasks[0], 'להתקשר'),                            tasks[0] && tasks[0].title);
    check('task 2 includes "להשאיר"',             tasks[1] && titleHas(tasks[1], 'להשאיר'),                            tasks[1] && tasks[1].title);
  });
  await sleep(1500);

  // ── 3. Two tasks where the time belongs to the second only ─────────────────
  await runCase('3. shared sentence, time on second task only', 'לסדר את הדוח בעירייה ללכת לבנק בשעה 14:00', (tasks) => {
    check('count === 2',                                   tasks.length === 2,                                                                tasks.length);
    check('task 1 includes "לסדר את הדוח בעירייה"',        tasks[0] && titleHas(tasks[0], 'לסדר את הדוח בעירייה'),                            tasks[0] && tasks[0].title);
    check('task 2 includes "ללכת לבנק"',                   tasks[1] && titleHas(tasks[1], 'ללכת לבנק'),                                       tasks[1] && tasks[1].title);
    check('task 2 time === "14:00"',                       tasks[1] && tasks[1].time === '14:00',                                             tasks[1] && tasks[1].time);
    check('no standalone "לסדר את" task',                  !tasks.some(t => (t.title || '').trim() === 'לסדר את'),                            tasks.map(t => t.title));
  });
  await sleep(1500);

  // ── 4. Preamble "מחר בשעה 2" carries date + time to the single task ─────────
  await runCase('4. preamble date + time on one task', 'מחר בשעה 2 לקחת את לאלי לחוג', (tasks) => {
    check('count === 1',                       tasks.length === 1,                                  tasks.length);
    check('title includes "לקחת את לאלי"',     tasks[0] && titleHas(tasks[0], 'לקחת את לאלי'),     tasks[0] && tasks[0].title);
    check('date === "tomorrow"',               tasks[0] && tasks[0].date === 'tomorrow',           tasks[0] && tasks[0].date);
    check('time === "14:00"',                  tasks[0] && tasks[0].time === '14:00',              tasks[0] && tasks[0].time);
  });
  await sleep(1500);

  // ── 5. Plain shopping list — one task, do NOT split items ──────────────────
  await runCase('5. plain shopping list stays one task', 'לקנות עגבניות פלפל בצל', (tasks) => {
    check('count === 1', tasks.length === 1, tasks.length);
    check('title includes "לקנות"', tasks[0] && titleHas(tasks[0], 'לקנות'), tasks[0] && tasks[0].title);
  });
  await sleep(1500);

  // ── 6. Long natural speech — multi-task, neither blob nor over-split ───────
  const longInput = 'ללכת ליוסי להתקשר לעורך דין לשאול אותו מה קורה עם הערכת חוזה עם נעמי לקנות עגבניות פלפל בצל לנסוע לים לברר עם דודי מה קורה עם הדוד שמש';
  await runCase('6. long natural speech splits reasonably', longInput, (tasks) => {
    check('count >= 3 (no giant blob)',  tasks.length >= 3,                              tasks.length);
    check('count <= 9 (no over-split)',  tasks.length <= 9,                              tasks.length);
    check('every task has non-empty title',
      tasks.every(t => t && typeof t.title === 'string' && t.title.trim().length > 0),
      tasks.map(t => t && t.title));
  });

  console.log('\n' + '═'.repeat(60));
  console.log(`BASELINE LOCK: ${pass} passed, ${fail} failed`);
  console.log('═'.repeat(60));
  process.exit(fail ? 1 : 0);
}

run();
