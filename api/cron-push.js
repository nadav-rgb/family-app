// POST /api/cron-push   (also accepts GET for easier cron-job.org setup)
//
// This endpoint is meant to be called by an external cron service
// (cron-job.org recommended, free, 1-min granularity) every minute. It:
//   1. Reads all scheduled pushes from the index.
//   2. Filters those whose fireAt <= now.
//   3. Looks up the recipient device's subscription.
//   4. Sends the push via web-push (FCM/APNs/Mozilla under the hood).
//   5. Removes the push from the index regardless of send result —
//      we don't retry failed deliveries to avoid spamming a stale
//      subscription endlessly.
//
// Response includes counters + per-push detail so the cron service's
// log makes it easy to debug what fired and what didn't.

const kv   = require('./_lib/kv');
const push = require('./_lib/push');

module.exports = async (req, res) => {
  // Allow GET so cron services that only do GET still work.
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  const log = [];
  try {
    if (!push.isConfigured()) {
      res.status(503).json({ error: 'vapid-not-configured' });
      return;
    }
    if (!kv.configured()) {
      res.status(503).json({ error: 'kv-not-configured', detail: 'set KV_REST_API_URL + KV_REST_API_TOKEN' });
      return;
    }

    const now    = Date.now();
    const allIds = await kv.smembers('pushq:index');
    const entries = [];
    for (const id of allIds) {
      const e = await kv.get(`pushq:${id}`);
      if (e) entries.push(e);
    }
    const due = entries.filter(e => e && e.fireAt <= now);

    let sent = 0, failed = 0, expired = 0;
    for (const e of due) {
      const sub = await kv.get(`device:${e.deviceId}`);
      // Remove FIRST so a slow send doesn't get re-attempted on the
      // next cron tick (idempotency over reliability for v1).
      await kv.del(`pushq:${e.pushId}`);
      await kv.srem('pushq:index', e.pushId);

      if (!sub) {
        log.push({ id: e.pushId, status: 'no-subscription' });
        continue;
      }
      try {
        await push.sendPush(sub, { title: e.title, body: e.body, tag: e.tag });
        sent++;
        log.push({ id: e.pushId, status: 'sent' });
      } catch (err) {
        const statusCode = err && err.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is expired / unsubscribed — clean up.
          expired++;
          await kv.del(`device:${e.deviceId}`);
          await kv.srem('devices', e.deviceId);
          log.push({ id: e.pushId, status: 'subscription-expired' });
        } else {
          failed++;
          log.push({ id: e.pushId, status: 'send-failed', detail: err.message });
        }
      }
    }

    res.status(200).json({
      ok: true,
      now,
      totalScheduled: entries.length,
      due:            due.length,
      sent, failed, expired,
      log,
    });
  } catch (e) {
    console.error('[cron-push] error', e);
    res.status(500).json({ error: 'internal', detail: e.message, log });
  }
};
