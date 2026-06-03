// Shared lightweight protection for the public AI endpoints
// (parse-tasks, categorize-shopping, summarize-task).
//
// These endpoints proxy paid AI calls and previously had ZERO protection plus
// `Access-Control-Allow-Origin: *`, so anyone could POST and run up the bill /
// DoS them. This helper closes that without changing app behaviour:
//
//   1. CORS  — instead of a blanket `*`, reflect the request Origin only when it
//              is on a known allowlist (the Vercel app + Capacitor/localhost
//              native shells + dev). Unknown browser origins get the canonical
//              app origin back, so a random website's browser fetch is blocked.
//              Requests with no Origin (native WebViews, curl, server-to-server)
//              are NOT blocked here — rate limiting is their backstop.
//   2. Rate limit — per-IP sliding window via KV. SKIPPED when KV is not
//              configured, because these are CORE task-creation endpoints and
//              must never hard-fail the app the way the optional avatar feature
//              can. When KV is present, abusive loops are capped.
//   3. Friction token — OFF by default. If AI_FRICTION_TOKEN is set in the env,
//              a matching `x-app-friction` header is required. This lets the
//              owner opt into header-gating later without a code change. Not
//              real auth (a client token is visible) — just added friction.
//
// Returns true if the request may proceed, false if the helper already sent a
// response (OPTIONS preflight, blocked method, rate-limited, or bad friction).

const kv = require('./kv');

// Known-good origins. Reflecting these keeps web + native clients working while
// denying arbitrary cross-site browser callers.
const ALLOWED_ORIGINS = new Set([
  'https://family-app-roan.vercel.app',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
]);
// Vercel preview deployments: https://family-app-*.vercel.app
const PREVIEW_ORIGIN_RE = /^https:\/\/family-app[a-z0-9-]*\.vercel\.app$/i;
const CANONICAL_ORIGIN  = 'https://family-app-roan.vercel.app';

const FRICTION_TOKEN = process.env.AI_FRICTION_TOKEN || '';

// Rate-limit window: generous enough for a whole family behind one NAT IP
// (several members creating tasks), strict enough to kill an abusive loop.
const RL_WINDOW_SEC = 60;
const RL_MAX        = 60;

function originAllowed(origin) {
  return ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN_RE.test(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    // A real browser origin we don't recognise → hand back the canonical app
    // origin so the cross-site fetch is rejected by the browser's CORS check.
    res.setHeader('Access-Control-Allow-Origin', CANONICAL_ORIGIN);
    res.setHeader('Vary', 'Origin');
  } else {
    // No Origin header (native WebView / curl / server-to-server). CORS is
    // irrelevant for these; rate limiting is the real guard. Echo the canonical
    // origin rather than '*' so we never advertise a wildcard.
    res.setHeader('Access-Control-Allow-Origin', CANONICAL_ORIGIN);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Friction');
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'unknown';
}

async function checkRate(key) {
  const now = Date.now();
  let rec = await kv.get(key);
  if (!rec || typeof rec !== 'object' || (now - rec.windowStart) > RL_WINDOW_SEC * 1000) {
    rec = { count: 0, windowStart: now };
  }
  if (rec.count >= RL_MAX) {
    return { ok: false, retryAfterSec: Math.ceil((RL_WINDOW_SEC * 1000 - (now - rec.windowStart)) / 1000) };
  }
  rec.count += 1;
  await kv.set(key, rec);
  return { ok: true };
}

// Main guard. `name` namespaces the rate-limit bucket per endpoint.
// Usage at the top of a handler:
//   if (!(await guard(req, res, 'parse-tasks'))) return;
async function guard(req, res, name) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') { res.status(200).end(); return false; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return false; }

  // Optional friction (off unless AI_FRICTION_TOKEN is configured).
  if (FRICTION_TOKEN && req.headers['x-app-friction'] !== FRICTION_TOKEN) {
    res.status(401).json({ error: 'forbidden' });
    return false;
  }

  // Per-IP rate limit — only when KV is available; never hard-fail core flow.
  if (kv.configured()) {
    try {
      const r = await checkRate('rl:' + name + ':' + clientIp(req));
      if (!r.ok) {
        res.setHeader('Retry-After', String(r.retryAfterSec));
        res.status(429).json({ error: 'rate_limited', retryAfterSec: r.retryAfterSec });
        return false;
      }
    } catch (_) {
      // KV hiccup must not break task creation — fail open on the limiter only.
    }
  }

  return true;
}

module.exports = { guard };
