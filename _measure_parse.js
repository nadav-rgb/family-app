// Temp latency harness — UTF-8 safe. Hits the live Vercel endpoint.
const URL = 'https://family-app-roan.vercel.app/api/parse-tasks';

const SENTENCES = [
  'לקנות חלב',
  'להתקשר לאמא',
  'לבדוק חומר ב-11',
  'הרצאה של שחר לייבו לבדוק חומר להכין',
];

async function call(transcript) {
  const t0 = Date.now();
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ transcript, lang: 'he', date: 'today', time: '10:00' }),
  });
  const ms = Date.now() - t0;
  const j = await r.json();
  return { ms, j };
}

(async () => {
  const label = process.argv[2] || '';
  for (const s of SENTENCES) {
    try {
      const { ms, j } = await call(s);
      const titles = (j.tasks || []).map(t => t.title + (t.time ? ` @${t.time}` : '')).join('  |  ');
      console.log(`\n[${ms}ms] "${s}"`);
      console.log(`   → ${titles}   needsReview=${j.needsReview}`);
    } catch (e) {
      console.log(`\n["${s}"] ERROR: ${e.message}`);
    }
  }
})();
