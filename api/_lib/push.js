// Web Push sender — wraps the `web-push` library with VAPID config from
// env vars. The VAPID public key is also surfaced via /api/vapid-public-key
// so the client can use it as `applicationServerKey` when subscribing.

const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT     || 'mailto:family-app@example.com';

let configured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  } catch (e) {
    console.error('[push] setVapidDetails failed', e.message);
  }
}

async function sendPush(subscription, payload) {
  if (!configured) throw new Error('VAPID not configured');
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return webpush.sendNotification(subscription, body, { TTL: 60 * 60 * 24 });
}

function publicKey()       { return VAPID_PUBLIC; }
function isConfigured()    { return configured; }

module.exports = { sendPush, publicKey, isConfigured };
