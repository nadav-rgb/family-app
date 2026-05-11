// POST /api/schedule-push
// Body: {
//   deviceId: string,
//   pushes: [{ id: string, taskId: string|number, fireAt: number,
//              title: string, body: string, tag: string }, ...]
// }
//
// Stores N scheduled pushes for later delivery by /api/cron-push. Each
// push has its own ID (e.g. `task-123-initial` / `task-123-overdue-0`)
// so /api/cancel-push can remove specific stages without affecting the
// others (in case the user edits a task, completes it, etc.).

const kv = require('./_lib/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const { deviceId, pushes } = body;
    if (!deviceId || !Array.isArray(pushes)) {
      res.status(400).json({ error: 'missing-deviceId-or-pushes' });
      return;
    }
    let stored = 0;
    for (const p of pushes) {
      if (!p || !p.id || !p.fireAt || typeof p.fireAt !== 'number') continue;
      const entry = {
        pushId:  String(p.id),
        deviceId,
        taskId:  String(p.taskId || ''),
        fireAt:  p.fireAt,
        title:   String(p.title || ''),
        body:    String(p.body  || ''),
        tag:     String(p.tag   || p.id),
      };
      await kv.set(`pushq:${entry.pushId}`, entry);
      await kv.sadd('pushq:index', entry.pushId);
      stored++;
    }
    res.status(200).json({ ok: true, stored, kvConfigured: kv.configured() });
  } catch (e) {
    console.error('[schedule-push] error', e);
    res.status(500).json({ error: 'internal', detail: e.message });
  }
};
