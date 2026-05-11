// POST /api/subscribe
// Body: { deviceId: string, subscription: PushSubscriptionJSON }
//
// Stores the push subscription per deviceId so /api/cron-push can later
// look up the subscription when delivering a scheduled notification.
// Replaces any existing subscription for that deviceId (subscription
// endpoints can change when the browser refreshes them).

const kv = require('./_lib/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const { deviceId, subscription } = body;
    if (!deviceId || !subscription || !subscription.endpoint) {
      res.status(400).json({ error: 'missing-deviceId-or-subscription' });
      return;
    }
    await kv.set(`device:${deviceId}`, subscription);
    await kv.sadd('devices', deviceId);
    res.status(200).json({ ok: true, deviceId, kvConfigured: kv.configured() });
  } catch (e) {
    console.error('[subscribe] error', e);
    res.status(500).json({ error: 'internal', detail: e.message });
  }
};
