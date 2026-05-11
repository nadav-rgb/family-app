// GET /api/vapid-public-key
// Returns the VAPID public key for the client to use when subscribing
// to push via `registration.pushManager.subscribe({applicationServerKey})`.

const { publicKey, isConfigured } = require('./_lib/push');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({ error: 'vapid-not-configured' });
    return;
  }
  res.status(200).json({ publicKey: publicKey() });
};
