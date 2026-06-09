/**
 * Integration test: drives the REAL parse-tasks handler with a MOCKED provider,
 * so we verify the full handler path (provider → temporal layer → cleanup →
 * response) without needing a live API key.
 *
 * Run: node api/test-temporal-integration.js
 *
 * The mock returns the split the AI WOULD return, with a deliberately WRONG time
 * on the first task. The deterministic temporal layer must correct ownership.
 */

// Mock the provider BEFORE requiring the handler. The handler destructures
// parseWithClaude/parseWithOpenAI at load, so we overwrite the module export first.
process.env.AI_PROVIDER = 'claude';
const claudeMod = require('./_providers/claude');

// rawTasks shape mirrors normalizeTask(): { title, assignee, time, date, _confidence }
claudeMod.parseWithClaude = async function (transcript) {
  // Simulate the AI splitting correctly but mis-binding the time backward.
  if (transcript.includes('ובשש לקחת')) {
    return { needsReview: false, rawTasks: [
      { title: 'להתקשר למשה', assignee: null, time: '18:00', date: 'tomorrow', _confidence: 0.9 }, // WRONG time
      { title: 'לקחת את הילדים לחוג', assignee: null, time: null, date: 'tomorrow', _confidence: 0.9 },
    ]};
  }
  // Phantom time-only fragment the model sometimes emits.
  return { needsReview: false, rawTasks: [
    { title: 'לקנות חלב', assignee: null, time: null, date: null, _confidence: 0.9 },
    { title: 'בשעה 14:00', assignee: null, time: '14:00', date: null, _confidence: 0.9 },
  ]};
};

const handler = require('./parse-tasks');

function makeFakeRes() {
  return {
    _status: 200, _body: null,
    setHeader() { return this; },
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
    end() { return this; },
  };
}

async function call(transcript) {
  const req = { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' },
    body: { transcript, lang: 'he', date: '2026-06-09', time: '10:00' } };
  const res = makeFakeRes();
  await handler(req, res);
  return res._body;
}

let pass = 0, fail = 0;
function assert(label, cond, detail) {
  if (cond) { pass++; console.log('✅', label); }
  else { fail++; console.log('❌', label, '\n   ', detail); }
}

(async () => {
  // Case 1: backward-bound time gets corrected forward.
  const a = await call('מחר להתקשר למשה ובשש לקחת את הילדים לחוג');
  const call1 = a.tasks.find(t => t.title.includes('להתקשר'));
  const take1 = a.tasks.find(t => t.title.includes('לקחת'));
  assert('handler corrects backward time → forward owner',
    call1 && call1.time === null && take1 && take1.time === '18:00',
    JSON.stringify(a.tasks));

  // Case 2: phantom time-only fragment is dropped and its time merged.
  const b = await call('לקנות חלב בשעה 14:00');
  assert('handler drops phantom time fragment + merges time',
    b.tasks.length === 1 && b.tasks[0].title.includes('לקנות חלב') && b.tasks[0].time === '14:00',
    JSON.stringify(b.tasks));

  console.log('\n' + '═'.repeat(50));
  console.log(`INTEGRATION: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
