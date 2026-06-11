// FCM sender — wraps firebase-admin Cloud Messaging with a service account
// from env. Mirrors the style of _lib/push.js (web-push). Cross-platform by
// design: the same admin.messaging() multicast delivers to Android (FCM) and
// iOS (APNs-over-FCM) tokens, so adding iPhone later needs NO server change.
//
// Config: set FIREBASE_SERVICE_ACCOUNT to the full service-account JSON
// (as a single-line string) in the Vercel env. Falls back to
// GOOGLE_APPLICATION_CREDENTIALS (a path) if that's how the host is set up.

let admin = null;
try { admin = require('firebase-admin'); } catch (_) { admin = null; }

let _app = null;
let _initError = null;

function _init() {
  if (_app || _initError) return;
  if (!admin) { _initError = 'firebase-admin-not-installed'; return; }
  try {
    // Reuse an already-initialised default app across warm serverless invocations.
    if (admin.apps && admin.apps.length) { _app = admin.apps[0]; return; }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    if (raw) {
      const creds = JSON.parse(raw);
      _app = admin.initializeApp({ credential: admin.credential.cert(creds) });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      _app = admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      _initError = 'no-service-account';
    }
  } catch (e) {
    _initError = 'init-failed: ' + (e && e.message ? e.message : String(e));
  }
}

function isConfigured() {
  _init();
  return !!_app && !_initError;
}

function configError() {
  _init();
  return _initError;
}

function db() {
  _init();
  if (!_app) return null;
  return admin.firestore();
}

// Send one logical message to many tokens. Returns a per-token result summary.
// `data` values must be strings (FCM requirement); `notification` is optional.
// `collapseId` (optional) sets the Android collapse_key + iOS apns-collapse-id +
// notification tag, so a duplicate emit of the same logical event collapses to
// a single delivery on the device.
async function sendWake(tokens, { data, notification, collapseId } = {}) {
  _init();
  if (!_app) throw new Error(_initError || 'fcm-not-configured');
  const list = (tokens || []).filter(Boolean);
  if (!list.length) return { successCount: 0, failureCount: 0, responses: [], tokens: [] };

  const message = {
    tokens: list,
    // Data is delivered to the app's push handler (handleIncomingWakePush),
    // which triggers a sync + local-notification reschedule.
    data: Object.assign({ type: 'wake' }, data || {}),
    // High priority so Android wakes a backgrounded app to process the data.
    android: { priority: 'high' },
    // content-available lets a backgrounded iOS app process the payload later.
    apns: { payload: { aps: { 'content-available': 1 } }, headers: { 'apns-priority': '10' } },
  };
  if (collapseId) {
    message.android.collapseKey = String(collapseId);
    message.apns.headers['apns-collapse-id'] = String(collapseId).slice(0, 64);
  }
  if (notification) {
    message.notification = notification;
    // Tag so duplicate visible notifications replace rather than stack.
    if (collapseId) message.android.notification = { tag: String(collapseId) };
    // When a visible notification is included, iOS should show it normally.
    message.apns.payload.aps['content-available'] = 1;
  }

  const resp = await admin.messaging().sendEachForMulticast(message);
  return {
    successCount: resp.successCount,
    failureCount: resp.failureCount,
    responses: resp.responses.map((r, i) => ({
      token: list[i],
      success: r.success,
      error: r.error ? (r.error.code || r.error.message) : null,
    })),
    tokens: list,
  };
}

module.exports = { isConfigured, configError, db, sendWake };
