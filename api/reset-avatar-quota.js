// TEMPORARY one-off admin endpoint: reset the AI-avatar generation quota.
// Scans all `aigen:*` keys in KV and deletes them so every member starts fresh
// with the full 3 generations. Auth: caller must pass ?token=<KV_REST_API_TOKEN>
// (compared to the server env var — no new secret committed to the repo).
// Pass ?dry=1 to list keys without deleting. DELETE THIS FILE after running.

const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || '';
  const expected = process.env.KV_REST_API_TOKEN || '';
  if (!expected || token !== expected) {
    return res.status(403).json({ ok: false, reason: 'forbidden' });
  }
  const dry = !!(req.query && (req.query.dry === '1' || req.query.dry === 'true'));
  try {
    const keys = await kv.keys('aigen:*');
    const detail = [];
    for (const k of keys) {
      let v = null; try { v = await kv.get(k); } catch (_) {}
      detail.push({ key: k, used: v });
    }
    if (dry) {
      return res.status(200).json({ ok: true, dry: true, count: keys.length, keys: detail });
    }
    let deleted = 0;
    for (const k of keys) { try { await kv.del(k); deleted++; } catch (_) {} }
    return res.status(200).json({ ok: true, dry: false, deleted, keys: detail });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: 'kv_error', error: e.message });
  }
};
