// AI avatar generation — Phase 0 (server only, isolated).
// Takes a single cropped photo (raw binary body), returns up to 4 illustrated
// options as an NDJSON stream (one line per option, revealed as it completes).
//
// Hard rules this endpoint obeys:
//  - NEVER touches Firebase. The client uploads only the chosen image, via the
//    existing Storage flow.
//  - Cost protection is KV-backed and FAIL-SAFE: if KV is unavailable we refuse
//    to generate (503) rather than risk unbounded OpenAI spend.
//  - Streaming is an enhancement, not a dependency: the body is plain NDJSON, so
//    a client that cannot read it incrementally can buffer the whole response and
//    split on newlines with identical results.

const OpenAI = require('openai');
const kv     = require('./_lib/kv');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const IMAGE_MODEL      = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const FRICTION_TOKEN   = process.env.AVATAR_FRICTION_TOKEN || ''; // light friction, NOT security
const PER_MEMBER_LIMIT = 3;      // successful generations per family member
const OPTIONS_COUNT    = 4;      // options per generation
const MAX_BYTES        = 4 * 1024 * 1024;
const ALLOWED_TYPES    = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RL_WINDOW_SEC    = 60 * 60;
const RL_MAX           = 30;     // generations per window, per family AND per ip
const SLOT_TIMEOUT_MS  = 45000;  // high input_fidelity is slower than the old 30s budget

// Locked style prompts. The client NEVER sends prompt text; this array is the
// single source of style truth. One entry per slot — slot index === style index.
// Order is load-bearing: it maps 1:1 to the slot loop below.
const LOCKED_STYLE_PROMPTS = [
  {
    id: 'warm_illustrated_storybook',
    prompt: `Transform the uploaded photo into a premium warm illustrated family storybook artwork.

IMPORTANT:
Preserve identity perfectly.
The people must remain highly recognizable and faithful to the original image.

Preserve:
- face identity
- facial structure
- beard
- smile
- glasses
- hairstyle
- skin tone
- age
- emotional expression

STYLE FREEDOM:
You ARE encouraged to stylize strongly.

Transform the image into a rich hand-painted storybook illustration.

Style references:
premium illustrated children’s books,
warm watercolor,
soft gouache painting,
gentle brush texture,
emotional family illustration.

Visual style:
soft painterly texture,
warm natural light,
organic brush strokes,
beautiful depth,
cozy emotional atmosphere.

Make the image feel:
warm,
loving,
nostalgic,
authentic,
heartwarming.

BACKGROUND:
Keep the same real environment, but artistically repaint it beautifully in the same illustrated language.

IMPORTANT:
This should clearly look like an artistic illustration, not a photo filter.

Negative prompt:
anime, pixar, disney, 3D render, fake skin, over realism, distorted face, giant eyes, plastic texture.`,
  },
  {
    id: 'cute_premium_character',
    prompt: `Edit the uploaded photo.

CRITICAL RULE:
The real person must remain EXACTLY the same person.

This is an identity-locked image edit.

DO NOT redesign the face.

DO NOT reinterpret the person.

DO NOT create a new character.

DO NOT change facial geometry.

Treat the uploaded image as locked reference material.

Preserve EXACTLY:
- facial proportions
- smile shape
- tooth shape
- eye shape
- eye distance
- eyebrow shape
- beard shape
- beard density
- glasses shape
- forehead size
- skin tone
- face width
- jaw structure
- facial asymmetry
- emotional expression
- head angle

The result must clearly look like the exact same real person.

STYLE TRANSFORMATION ONLY:

Apply a premium cute cinematic illustrated style ON TOP of the existing photo.

The style should feel:
adorable,
premium,
heartwarming,
beautiful,
soft,
magical,
warm.

Visual direction:
high-end premium illustration,
gentle magical realism,
soft premium lighting,
warm cinematic atmosphere,
beautiful polished finish.

IMPORTANT:
Keep realism high.

The person must still immediately be recognizable.

The reaction should be:
“Wow, this is literally me.”

Negative prompt:
new face, different person, disney clone, pixar clone, enlarged eyes, larger eyes, giant eyes, cartoon face, altered smile, altered facial structure, ugly AI face, fake beard, distorted identity, exaggerated proportions`,
  },
  {
    id: 'dreamy_magical_realism',
    prompt: `Transform the uploaded photo into a premium dreamy magical realism portrait.

CRITICAL:
Identity preservation is extremely important.

The real person must remain highly recognizable.

Preserve:
- facial structure
- smile
- beard
- glasses
- hairstyle
- age
- skin tone
- emotional expression

STYLE:
Strong beauty stylization is encouraged.

Create a dreamy premium magical realism aesthetic.

Visual style:
soft cinematic glow,
beautiful natural light,
dreamy atmosphere,
warm magical softness,
premium depth,
gentle highlights,
soft elegant realism,
subtle enchanted feeling.

The image should feel:
beautiful,
warm,
dreamy,
heartwarming,
premium,
emotionally uplifting.

IMPORTANT:
This is NOT fantasy cosplay.
This is NOT cartoon.
This is NOT anime.

The person should still look real — just in an elevated magical version of reality.

BACKGROUND:
Keep the same real environment, but transform it into a softer, dreamier, cinematic version of itself.

The result should feel:
“Wow, reality but more beautiful.”

Negative prompt:
anime, cartoon, pixar, fantasy costume, sci-fi, creepy lighting, dark horror, comic book, ugly face, fake skin, distorted identity.`,
  },
  {
    id: 'tropical_fantasy_adventure',
    prompt: `Transform the uploaded photo into a beautiful tropical fantasy adventure portrait.

CRITICAL:
Identity preservation is extremely important.

The person must remain highly recognizable.

Preserve:
- facial structure
- smile
- beard
- glasses
- hairstyle
- age
- skin tone
- emotional expression

STYLE:
Creative transformation is encouraged.

Create an adventurous premium tropical fantasy atmosphere.

Visual style:
beautiful tropical island,
warm cinematic sunset,
palm trees,
turquoise ocean,
golden light,
soft magical realism,
playful tropical details,
premium cinematic travel vibe.

You may creatively add:
palm trees,
tropical birds,
gentle animals in the background,
small playful details,
warm paradise atmosphere.

The image should feel:
joyful,
beautiful,
fun,
magical,
vacation-like,
uplifting.

IMPORTANT:
The person must still clearly look like themselves.

The result should feel:
“Wow, I’m on a dream island.”

Negative prompt:
cheap photoshop look, ugly AI face, distorted identity, creepy animals, dark horror, low quality CGI, unrealistic proportions.`,
  },
];

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Friction');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  // Fail-safe: no KV ⇒ no quota enforcement ⇒ refuse rather than risk abuse.
  if (!kv.configured()) {
    console.warn('[avatar-gen] KV not configured — refusing (fail-safe)');
    return res.status(503).json({ ok: false, reason: 'temporarily_unavailable' });
  }

  // Light friction only (the secret is visible in the client — not real auth).
  if (FRICTION_TOKEN) {
    const provided = req.headers['x-app-friction'];
    if (provided !== FRICTION_TOKEN) {
      return res.status(401).json({ ok: false, reason: 'forbidden' });
    }
  }

  const familyId = String((req.query && req.query.familyId) || '').trim();
  const memberId = String((req.query && req.query.memberId) || '').trim();
  if (!familyId || !memberId) {
    return res.status(400).json({ ok: false, reason: 'bad_input', detail: 'familyId and memberId required' });
  }

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return res.status(400).json({ ok: false, reason: 'bad_input', detail: 'unsupported content-type' });
  }

  let body;
  try {
    body = await readRawBody(req);
  } catch (e) {
    return res.status(400).json({ ok: false, reason: 'bad_input', detail: 'could not read body' });
  }
  if (!body || body.length === 0) {
    return res.status(400).json({ ok: false, reason: 'bad_input', detail: 'empty body' });
  }
  if (body.length > MAX_BYTES) {
    return res.status(400).json({ ok: false, reason: 'bad_input', detail: 'image too large' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // Abuse rate-limit + per-member quota read. Any KV failure here is fail-safe.
  let used;
  try {
    const famRl = await checkAndBumpRate('rl:fam:' + familyId);
    if (!famRl.ok) return res.status(429).json({ ok: false, reason: 'rate_limited', retryAfterSec: famRl.retryAfterSec });
    const ipRl = await checkAndBumpRate('rl:ip:' + ip);
    if (!ipRl.ok) return res.status(429).json({ ok: false, reason: 'rate_limited', retryAfterSec: ipRl.retryAfterSec });

    const raw = await kv.get(quotaKey(familyId, memberId));
    used = typeof raw === 'number' ? raw : 0;
  } catch (e) {
    console.error('[avatar-gen] KV error — refusing (fail-safe):', e.message);
    return res.status(503).json({ ok: false, reason: 'temporarily_unavailable' });
  }

  if (used >= PER_MEMBER_LIMIT) {
    return res.status(403).json({ ok: false, reason: 'limit_reached', remaining: 0, limit: PER_MEMBER_LIMIT });
  }

  // ── All gates passed. From here we stream; status is locked to 200. ──
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
  });

  const slots = [];
  for (let slot = 0; slot < OPTIONS_COUNT; slot++) {
    const style = LOCKED_STYLE_PROMPTS[slot];
    slots.push(
      genWithRetry(body, contentType, ext, style.prompt)
        .then(b64 => { writeLine(res, { type: 'image', slot, style: style.id, format: 'webp', b64 }); return true; })
        .catch(err => { console.warn('[avatar-gen] slot', slot, 'failed:', err.status, err.code, err.message); writeLine(res, { type: 'slot_failed', slot, style: style.id, detail: (err && err.message) || 'unknown', status: err && err.status, code: err && err.code }); return false; })
    );
  }

  const settled  = await Promise.allSettled(slots);
  const produced = settled.filter(r => r.status === 'fulfilled' && r.value === true).length;

  // A generation counts ONLY if it yielded at least one usable image.
  let remaining = PER_MEMBER_LIMIT - used;
  if (produced >= 1) {
    try {
      await kv.set(quotaKey(familyId, memberId), used + 1);
      remaining = PER_MEMBER_LIMIT - (used + 1);
    } catch (e) {
      console.error('[avatar-gen] quota increment failed (images already sent):', e.message);
    }
  }

  console.log('[avatar-gen] family=' + familyId + ' member=' + memberId
    + ' produced=' + produced + '/' + OPTIONS_COUNT + ' remaining=' + remaining);

  writeLine(res, { type: 'done', produced, remaining, limit: PER_MEMBER_LIMIT });
  res.end();
}

function quotaKey(familyId, memberId) {
  return 'aigen:' + familyId + ':' + memberId;
}

// Sliding window via stored windowStart — no TTL needed, so kv.js stays untouched.
async function checkAndBumpRate(key) {
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

async function genWithRetry(buf, contentType, ext, prompt) {
  try {
    return await withTimeout(genOne(buf, contentType, ext, prompt), SLOT_TIMEOUT_MS);
  } catch (e) {
    return await withTimeout(genOne(buf, contentType, ext, prompt), SLOT_TIMEOUT_MS);
  }
}

async function genOne(buf, contentType, ext, prompt) {
  // Fresh File per call so a consumed stream is never reused across the 4 slots.
  const file = await OpenAI.toFile(buf, 'source.' + ext, { type: contentType });
  const result = await client.images.edit({
    model:         IMAGE_MODEL,
    image:         file,
    prompt:        prompt,
    n:             1,
    size:          '1024x1024',
    quality:       'medium',   // 'high' doubled latency and blew past the slot/function timeouts
    output_format: 'webp',
    input_fidelity: 'high',  // preserve face/identity — closes the chat-vs-API gap
  });
  const b64 = result && result.data && result.data[0] && result.data[0].b64_json;
  if (!b64) throw new Error('no image in response');
  return b64;
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error('slot timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function writeLine(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body && req.body.type === 'Buffer' && Array.isArray(req.body.data)) {
    return Buffer.from(req.body.data);
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'binary') : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = handler;
module.exports.config = { maxDuration: 120 };
