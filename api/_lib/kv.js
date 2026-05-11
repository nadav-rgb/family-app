// KV helper — thin wrapper around Vercel KV with a safe in-memory
// fallback so /api routes don't crash in local dev or before the user
// has provisioned a KV database in the Vercel dashboard. The in-memory
// fallback only persists for the lifetime of a single serverless
// invocation, so production WITHOUT KV will appear to "work" but lose
// all data — by design, to surface misconfiguration loudly via the
// /api/cron-push log output rather than silent data loss.

let kv;
try {
  // @vercel/kv reads KV_REST_API_URL + KV_REST_API_TOKEN from env automatically.
  kv = require('@vercel/kv').kv;
} catch (_) {
  kv = null;
}

const memStore = new Map();
const memSets  = new Map();

function inMemoryOK() {
  return !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN;
}

async function get(key) {
  if (kv && !inMemoryOK()) return kv.get(key);
  const v = memStore.get(key);
  return v === undefined ? null : v;
}

async function set(key, value) {
  if (kv && !inMemoryOK()) return kv.set(key, value);
  memStore.set(key, value);
}

async function del(key) {
  if (kv && !inMemoryOK()) return kv.del(key);
  memStore.delete(key);
}

async function sadd(key, ...members) {
  if (kv && !inMemoryOK()) return kv.sadd(key, ...members);
  const s = memSets.get(key) || new Set();
  members.forEach(m => s.add(m));
  memSets.set(key, s);
  return members.length;
}

async function srem(key, ...members) {
  if (kv && !inMemoryOK()) return kv.srem(key, ...members);
  const s = memSets.get(key) || new Set();
  members.forEach(m => s.delete(m));
  memSets.set(key, s);
  return members.length;
}

async function smembers(key) {
  if (kv && !inMemoryOK()) return kv.smembers(key);
  const s = memSets.get(key);
  return s ? Array.from(s) : [];
}

function configured() {
  return !!(kv && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

module.exports = { get, set, del, sadd, srem, smembers, configured };
