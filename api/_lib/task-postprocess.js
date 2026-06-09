function normTitle(s) {
  return String(s || '')
    .replace(/[.,;:!?؟،]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeUmbrellaOriginalTask(transcript, tasks) {
  if (!Array.isArray(tasks) || tasks.length <= 1) return tasks;

  const original = normTitle(transcript);
  if (!original) return tasks;

  const filtered = tasks.filter(function(t) {
    return normTitle(t && t.title) !== original;
  });

  return filtered.length ? filtered : tasks;
}

module.exports = {
  removeUmbrellaOriginalTask,
};
