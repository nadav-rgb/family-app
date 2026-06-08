const { removeUmbrellaOriginalTask } = require('./_lib/task-postprocess');

let pass = 0;
let fail = 0;

function check(label, cond, got) {
  if (cond) {
    pass++;
    console.log('OK ' + label);
  } else {
    fail++;
    console.log('FAIL ' + label + (got !== undefined ? ' GOT: ' + JSON.stringify(got) : ''));
  }
}

const bug1 = 'ללכת למכות לקנות תותים לחזור הביתה לנעול נעליים';
let tasks = removeUmbrellaOriginalTask(bug1, [
  { title: bug1 },
  { title: 'ללכת למכות' },
  { title: 'לקנות תותים' },
  { title: 'לחזור הביתה' },
  { title: 'לנעול נעליים' },
]);
check('bug#1 removes full original when split tasks exist',
  tasks.length === 4 && !tasks.some(t => t.title === bug1),
  tasks.map(t => t.title));

tasks = removeUmbrellaOriginalTask(bug1, [{ title: bug1 }]);
check('single original remains when there are no split tasks',
  tasks.length === 1 && tasks[0].title === bug1,
  tasks.map(t => t.title));

const bug2 = 'ללכת לסופר לקנות תותים לקנות נעליים';
tasks = removeUmbrellaOriginalTask(bug2, [
  { title: 'ללכת לסופר' },
  { title: 'לקנות תותים' },
  { title: 'לקנות נעליים' },
]);
check('bug#2 leaves normal split tasks untouched',
  tasks.length === 3,
  tasks.map(t => t.title));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
