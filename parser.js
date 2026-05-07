/**
 * HebrewParser — local NLP for family task input.
 * Pure functions only. No DOM. No side effects.
 * Designed to be swappable with an AI API in the future.
 */
(function (global) {
  'use strict';

  // ─── Time-of-day defaults (minutes from midnight) ─────────────────────────
  const TOD = [
    { re: /בלילה/,                      mins: 21 * 60 },
    { re: /בערב|ערב/,                   mins: 19 * 60 },
    { re: /אחרי.{0,3}הצהריים|אחה"?צ/,  mins: 14 * 60 },
    { re: /בצהריים|צהריים/,             mins: 12 * 60 },
    { re: /לפני.{0,3}הצהריים|לפה"?צ/,  mins: 10 * 60 },
    { re: /בבוקר|בוקר/,                 mins:  8 * 60 },
    { re: /מוקדם/,                       mins:  7 * 60 },
  ];

  // ─── Day-of-week (Sunday=0) ────────────────────────────────────────────────
  const DOW = {
    ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6,
  };

  // ─── Family member aliases → internal ID ──────────────────────────────────
  // Sorted longest-name-first to prevent partial-match (e.g. "אמא" before "מא")
  const PERSON_ALIASES = [
    { names: ['יונתן', 'yonatan', 'Yonatan'], id: 'yonatan' },
    { names: ['דודי',  'dudi',    'Dudi'   ], id: 'dudi'    },
    { names: ['אמא',   'mom',     'Mom'    ], id: 'mom'     },
    { names: ['אבא',   'dad',     'Dad'    ], id: 'dad'     },
  ];

  // Verbs that explicitly signal an agent role when appearing right after a name
  const AGENT_VERBS_RE = /ייקח|תיקח|יעשה|תעשה|יביא|תביא|ילך|תלך|יקח|יסיע|תסיע|ירים|תרים|יאסוף|תאסוף|יסדר|תסדר|יכין|תכין|יביא|תביא|ילווה|תלווה|יורד|תורד|יעלה|תעלה/;

  // ─── Type keywords ─────────────────────────────────────────────────────────
  const REMINDER_KW = /תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי/;
  const EVENT_KW    = /פגישה|ישיבה|אסיפה|רופא|דנטיסט|שיניים|חוג|ביקור|טיסה|נסיעה|הצגה|סרט|מסיבה|אירוע/;

  // Filler phrases to strip before title extraction
  const FILLER = [
    /תזכיר\s+לי\s*/g, /תזכרי\s+לי\s*/g, /תזכרו\s+לי\s*/g,
    /בבקשה\s*/g,
  ];

  // ─── Hebrew word-hours (multi-word MUST precede single-word) ─────────────
  const HEB_HOURS = [
    ['אחת עשרה', 11], ['אחד עשר',    11],
    ['שתים עשרה', 12], ['שנים עשר', 12],
    ['אחת', 1], ['אחד', 1],
    ['שתיים', 2], ['שתים', 2],
    ['שלוש', 3], ['שלש', 3],
    ['ארבע', 4], ['חמש', 5], ['שש', 6], ['שבע', 7],
    ['שמונה', 8], ['תשע', 9],
    ['עשרה', 10], ['עשר', 10],
  ];
  const MOD_RE = '(?:\\s+(וחצי|ורבע|פחות\\s+רבע))?';
  function applyMod(base, mod) {
    if (!mod)                return base;
    if (mod.includes('וחצי')) return base + 30;
    if (mod.includes('ורבע')) return base + 15;
    if (mod.includes('פחות')) return base - 15;
    return base;
  }

  // ─── PHASE 1: Split into segments ────────────────────────────────────────
  // Only splits on explicit connectors. "חלב וביצים" must NOT split.
  function splitSegments(text) {
    return text
      .split(/\s+וגם\s+|\s+ובנוסף\s+|[;؛]\s*/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // ─── PHASE 2: Extract time ────────────────────────────────────────────────
  function extractTime(text, now) {
    let m;

    // Digital HH:MM
    m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) return { mins: +m[1] * 60 + +m[2], match: m[0], fromText: true };

    // Relative: "עוד שעתיים / שעה / X שעות / X דקות"
    m = text.match(/עוד\s+שעתיים/);
    if (m) return { mins: nowMins(now) + 120, match: m[0], fromText: true };

    m = text.match(/עוד\s+שעה/);
    if (m) return { mins: nowMins(now) + 60,  match: m[0], fromText: true };

    m = text.match(/עוד\s+(\d+)\s+שעות?/);
    if (m) return { mins: nowMins(now) + +m[1] * 60, match: m[0], fromText: true };

    m = text.match(/עוד\s+(\d+)\s+דקות?/);
    if (m) return { mins: nowMins(now) + +m[1], match: m[0], fromText: true };

    // Digit hour: "בשעה 8", "ב-8", "ב 4"
    m = text.match(/(?:בשעה\s+|ב[-–\s]?)(\d{1,2})(?::(\d{2}))?(?!\d)/);
    if (m) {
      let h = +m[1], min = m[2] ? +m[2] : 0;
      // Hours 1–6 without morning context → assume PM
      if (h >= 1 && h <= 6 && !/(בוקר|לפני.{0,3}הצהריים)/.test(text)) h += 12;
      if (h >= 0 && h <= 23) return { mins: h * 60 + min, match: m[0], fromText: true };
    }

    // Hebrew word-hours
    for (const [word, hour] of HEB_HOURS) {
      const re = new RegExp('(?:בשעה\\s+|ב[-–]?)' + word + MOD_RE);
      m = text.match(re);
      if (m) return { mins: applyMod(hour * 60, m[1]), match: m[0], fromText: true };
    }

    // Time-of-day keyword
    for (const { re, mins } of TOD) {
      m = text.match(re);
      if (m) return { mins, match: m[0], fromText: true };
    }

    return { mins: null, fromText: false, match: null };
  }

  // ─── PHASE 3: Extract date ────────────────────────────────────────────────
  function extractDate(text, now) {
    if (/מחרתיים/.test(text)) return { date: addDays(now, 2), fromText: true, match: 'מחרתיים' };
    if (/מחר/.test(text))     return { date: addDays(now, 1), fromText: true, match: 'מחר'     };
    if (/היום/.test(text))    return { date: new Date(now),   fromText: true, match: 'היום'     };

    const m = text.match(/ביום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
    if (m) {
      const target = DOW[m[1]], cur = now.getDay();
      let diff = target - cur;
      if (diff <= 0) diff += 7;
      return { date: addDays(now, diff), fromText: true, match: m[0] };
    }

    return { date: new Date(now), fromText: false, match: null };
  }

  // ─── PHASE 4: Extract assignee ────────────────────────────────────────────
  //
  // Three-tier priority:
  //   1. Subject-first: sentence STARTS with a known name → it's the doer
  //      "אמא תקנה חלב"   "יונתן יסדר את החדר"
  //   2. Name + explicit agent-verb anywhere in sentence
  //      "יקח שי את הילדים"
  //   3. Name appears anywhere — but only if NOT preceded by "את" (direct object)
  //      "תזכיר לי להתקשר לאמא" → אמא is assignee
  //      "שי ייקח את יונתן" → יונתן is NOT assignee (it's the object)
  //
  function extractAssignee(text) {
    // Tier 1 — subject at sentence start
    for (const { names, id } of PERSON_ALIASES) {
      for (const name of names) {
        if (isSubjectAtStart(text, name)) {
          return { id, fromText: true, match: name };
        }
      }
    }

    // Tier 2 — name + agent verb (anywhere in sentence)
    for (const { names, id } of PERSON_ALIASES) {
      for (const name of names) {
        if (new RegExp(name + '\\s+(?:' + AGENT_VERBS_RE.source + ')').test(text)) {
          return { id, fromText: true, match: name };
        }
      }
    }

    // Tier 3 — bare mention, but guard against direct-object position ("את NAME")
    for (const { names, id } of PERSON_ALIASES) {
      for (const name of names) {
        const isObject = new RegExp('את\\s+' + name).test(text);
        if (!isObject && text.includes(name)) {
          return { id, fromText: true, match: name };
        }
      }
    }

    return { id: null, fromText: false, match: null };
  }

  // True when `text` starts with `name` followed by whitespace (the verb comes next)
  function isSubjectAtStart(text, name) {
    return text.startsWith(name + ' ') || text.startsWith(name + '\t');
  }

  // ─── PHASE 5: Detect task type ────────────────────────────────────────────
  function detectType(text) {
    if (REMINDER_KW.test(text)) return 'reminder';
    if (EVENT_KW.test(text))    return 'event';
    return 'task';
  }

  // ─── PHASE 6: Build clean title ───────────────────────────────────────────
  function cleanTitle(text, matchesToStrip) {
    let s = text;

    // Strip filler phrases first
    for (const re of FILLER) s = s.replace(re, '');

    // Strip extracted tokens (time / date / assignee name)
    for (const token of matchesToStrip) {
      if (token) s = s.replace(token, ' ');
    }

    // Strip reminder verb keywords
    s = s.replace(/\b(תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי)\b/g, '');

    s = s.replace(/\s{2,}/g, ' ')
         .replace(/^[\s,.\-–״׳]+/, '')
         .replace(/[\s,.\-–״׳]+$/, '')
         .trim();

    return s || text.trim();
  }

  // ─── PHASE 7: Confidence score ────────────────────────────────────────────
  function calcConfidence(p) {
    let score = 0.4;
    if (p.timeFromText)     score += 0.25;
    if (p.dateFromText)     score += 0.10;
    if (p.assigneeFromText) score += 0.10;
    if (p.title.length > 3) score += 0.15;
    return Math.min(score, 1.0);
  }

  // ─── Smart default time ───────────────────────────────────────────────────
  function defaultMins(now) {
    const h = now.getHours();
    if (h < 7)  return  8 * 60;
    if (h < 11) return 12 * 60;
    if (h < 13) return 15 * 60;
    if (h < 17) return 19 * 60;
    return Math.min((h + 2) * 60, 23 * 60);
  }

  // ─── Parse one segment ────────────────────────────────────────────────────
  function parseSegment(text, now) {
    const time     = extractTime(text, now);
    const date     = extractDate(text, now);
    const assignee = extractAssignee(text);
    const type     = detectType(text);

    const title = cleanTitle(text, [time.match, date.match, assignee.match]);
    const mins  = time.mins !== null
      ? Math.max(0, Math.min(time.mins, 23 * 60 + 59))
      : defaultMins(now);

    const parsed = {
      title,
      mins,
      date,
      assignedTo:       assignee.id,
      type,
      timeFromText:     time.fromText,
      dateFromText:     date.fromText,
      assigneeFromText: assignee.fromText,
      rawInput:         text,
    };
    parsed.confidence = calcConfidence(parsed);
    return parsed;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  /**
   * parse(text, opts?) → ParsedTask[]
   * opts.now — override current time (useful for testing), default: new Date()
   */
  function parse(text, opts) {
    const now = (opts && opts.now) || new Date();
    if (!text || !text.trim()) return [];
    return splitSegments(text.trim()).map(seg => parseSegment(seg, now));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function nowMins(d) { return d.getHours() * 60 + d.getMinutes(); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

  global.HebrewParser = { parse };

})(window);


// ─── Dev console tests (localhost only) ───────────────────────────────────────
// Open DevTools → Console to see results.
if (typeof window !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  (function runTests() {
    const NOW = new Date('2026-05-08T10:00:00'); // fixed reference time

    const CASES = [
      {
        input:          'שי ייקח את יונתן לחוג ביום שלישי',
        expectAssignee: null,       // שי unknown; יונתן is object ("את יונתן")
        titleIncludes:  'יונתן',
      },
      {
        input:          'אמא תקנה חלב בערב',
        expectAssignee: 'mom',      // subject-first pattern
        titleIncludes:  'חלב',
        expectMins:     19 * 60,
      },
      {
        input:          'אבא יוציא את הילדים ב 13:20',
        expectAssignee: 'dad',      // subject-first
        titleIncludes:  'הילדים',
        expectMins:     13 * 60 + 20,
      },
      {
        input:          'דוד יתקשר לסבתא מחר',
        expectAssignee: null,       // דוד not in family list
        titleIncludes:  'סבתא',
      },
      {
        input:          'יונתן יסדר את החדר אחרי הצהריים',
        expectAssignee: 'yonatan',  // subject-first
        titleIncludes:  'החדר',
        expectMins:     14 * 60,
      },
    ];

    console.group('🔍 HebrewParser tests');
    let passed = 0;
    CASES.forEach(({ input, expectAssignee, titleIncludes, expectMins }) => {
      const [r] = window.HebrewParser.parse(input, { now: NOW });
      const okA = r.assignedTo === expectAssignee;
      const okT = r.title.includes(titleIncludes);
      const okM = expectMins === undefined || r.mins === expectMins;
      const ok  = okA && okT && okM;
      if (ok) passed++;
      console.log(
        ok ? '✅' : '❌',
        `"${input}"`,
        '\n   assignee:', r.assignedTo, okA ? '' : `← expected ${expectAssignee}`,
        '\n   title:',    r.title,      okT ? '' : `← should include "${titleIncludes}"`,
        '\n   mins:',     r.mins,       okM ? '' : `← expected ${expectMins}`,
        '\n   type:',     r.type,
        '\n   confidence:', r.confidence.toFixed(2),
      );
    });
    console.log(`\n${passed}/${CASES.length} passed`);
    console.groupEnd();
  })();
}
