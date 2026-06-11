// POST /api/family-event
// The single entry point of the Family Event System. MVP scope: handles
// exactly two business events — 'TaskCreated' and 'TaskCompleted'. The full
// catalog is intentionally NOT implemented here yet.
//
// Body: {
//   eventId:  string,            // deterministic idempotency key (collapse/tag)
//   type:     'TaskCreated' | 'TaskCompleted',
//   familyId: string,
//   actorId:  string,            // the member who performed the action
//   audience: string[],          // recipient member ids (already excludes actor)
//   taskId:   string,
//   notification?: { title, body },   // CLIENT-built, localized (RTL); relayed as-is
//   data?:    object,            // small string map echoed into the push data
// }
//
// The client owns audience derivation + the localized text (it knows names,
// language, direction). This endpoint stays "dumb": resolve audience tokens →
// send one cross-platform wake (+optional visible) message. Tokens carry
// member.pushPlatform; the same admin.messaging() multicast reaches Android
// (FCM) and iOS (APNs-over-FCM), so adding iPhone needs no change here.

const fcm = require('./_lib/fcm');
const { guard } = require('./_lib/guard');

const ALLOWED_TYPES = { TaskCreated: true, TaskCompleted: true };

module.exports = async (req, res) => {
  // CORS + OPTIONS preflight + method + per-IP rate limit (same helper the
  // working AI endpoints use). The Capacitor WebView origin (https://localhost)
  // is on the guard's allowlist, so the app's cross-origin POST is permitted.
  if (!(await guard(req, res, 'family-event'))) return;
  try {
    if (!fcm.isConfigured()) {
      res.status(503).json({ error: 'fcm-not-configured', detail: fcm.configError() });
      return;
    }
    const body = req.body || {};
    const { type, familyId, taskId, eventId } = body;
    const actorId  = body.actorId || null;
    const audience = Array.isArray(body.audience) ? body.audience : [];

    if (!type || !ALLOWED_TYPES[type]) { res.status(400).json({ error: 'bad-type', detail: String(type) }); return; }
    if (!familyId || !taskId)          { res.status(400).json({ error: 'missing-familyId-or-taskId' }); return; }

    const recipients = audience.filter(id => id && id !== actorId);
    if (!recipients.length) {
      res.status(200).json({ ok: true, skipped: 'no-recipients' });
      return;
    }

    const db = fcm.db();
    if (!db) { res.status(503).json({ error: 'admin-firestore-unavailable' }); return; }

    // Resolve each recipient's FCM token from their member doc.
    const tokens = [];
    const seen = {};
    const detail = [];
    const membersCol = db.collection('families').doc(String(familyId)).collection('members');
    await Promise.all(recipients.map(async (mid) => {
      try {
        const snap = await membersCol.doc(String(mid)).get();
        const d = snap.exists ? snap.data() : null;
        const tok = d && d.pushToken;
        if (tok && d.pushProvider === 'fcm' && !seen[tok]) {
          seen[tok] = true;
          tokens.push(tok);
          detail.push({ memberId: mid, platform: d.pushPlatform || 'unknown', hasToken: true });
        } else {
          detail.push({ memberId: mid, hasToken: false });
        }
      } catch (e) {
        detail.push({ memberId: mid, error: e.message });
      }
    }));

    if (!tokens.length) {
      res.status(200).json({ ok: true, skipped: 'no-tokens', detail });
      return;
    }

    // Deterministic eventId doubles as the FCM collapse key + notification tag,
    // so a duplicate emit of the same logical event collapses to one delivery.
    const collapseId = String(eventId || `${type}:${taskId}:${actorId}`);
    const data = Object.assign(
      { type: String(type), taskId: String(taskId), eventId: collapseId },
      (body.data && typeof body.data === 'object') ? body.data : {}
    );
    const notification = (body.notification && body.notification.body)
      ? { title: String(body.notification.title || ''), body: String(body.notification.body).slice(0, 240) }
      : undefined;

    const result = await fcm.sendWake(tokens, { data, notification, collapseId });

    res.status(200).json({ ok: true, type, recipients: recipients.length, detail, fcm: result });
  } catch (e) {
    console.error('[family-event] error', e);
    res.status(500).json({ error: 'internal', detail: e.message });
  }
};
