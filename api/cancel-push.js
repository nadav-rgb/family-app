// POST /api/cancel-push
// Body: { taskId: string|number, ids?: string[] }
//
// Either:
//   - Pass `ids` = explicit list of push IDs to remove (e.g.
//     ["task-123-initial","task-123-overdue-0"]); OR
//   - Pass `taskId` alone — we'll scan the index and remove every push
//     whose ID starts with `task-${taskId}-`. Useful when a task is
//     deleted entirely.

const kv = require('./_lib/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const { taskId, ids } = body;
    let toRemove = [];
    if (Array.isArray(ids) && ids.length) {
      toRemove = ids.map(String);
    } else if (taskId !== undefined && taskId !== null) {
      const all = await kv.smembers('pushq:index');
      const prefix = `task-${taskId}-`;
      toRemove = all.filter(id => id.startsWith(prefix));
    } else {
      res.status(400).json({ error: 'missing-taskId-or-ids' });
      return;
    }
    let removed = 0;
    for (const id of toRemove) {
      await kv.del(`pushq:${id}`);
      await kv.srem('pushq:index', id);
      removed++;
    }
    res.status(200).json({ ok: true, removed, kvConfigured: kv.configured() });
  } catch (e) {
    console.error('[cancel-push] error', e);
    res.status(500).json({ error: 'internal', detail: e.message });
  }
};
