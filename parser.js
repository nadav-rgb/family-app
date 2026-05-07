/**
 * HebrewParser — local NLP for family task input.
 * Pure functions only. No DOM. No side effects.
 * Designed to be swappable with an AI API in the future.
 */
(function (global) {
  'use strict';

  // ─── Time-of-day defaults (minutes from midnight) ─────────────────────────
  const TOD = [
    { re: /בלילה|בלילה\b/,             mins: 21 * 60 },
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
  const PERSON_ALIASES = [
    { names: ['אמא', 'mom',    'Mom'   ], id: 'mom'     },
    { names: ['אבא', 'dad',    'Dad'   ], id: 'dad'     },
    { names: ['דודי','dudi',   'Dudi'  ], id: 'dudi'    },
    { names: ['יונתן','yonatan','Yonatan'], id: 'yonatan' },
  ];

  // Verbs that indicate the preceding name is the assignee
  const AGENT_VERBS = /ייקח|תיקח|יעשה|תעשה|יביא|תביא|ילך|תלך|יקח|יסיע|תסיע|ירים|תרים|יאסוף|תאסוף/;

  // ─── Type keywords ─────────────────────────────────────────────────────────
  const REMINDER_KW = /תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי/;
  const EVENT_KW    = /פגישה|ישיבה|אסיפה|רופא|דנטיסט|שיניים|חוג|ביקור|טיסה|נסיעה|הצגה|סרט|מסיבה|אירוע/;

  // Filler phrases to strip before extracting the title
  const FILLER = [
    /תזכיר\s+לי\s+/g, /תזכרי\s+לי\s+/g, /תזכרו\s+לי\s+/g,
    /בבקשה\s+/g,
  ];

  // ─── Hebrew word-hours (multi-word MUST precede single) ───────────────────
  const HEB_HOURS = [
    ['אחת עשרה', 11], ['אחד עשר',   11],
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
    if (!mod) return base;
    if (mod.includes('וחצי'))     return base + 30;
    if (mod.includes('ורבע'))     return base + 15;
    if (mod.includes('פחות'))     return base - 15;
    return base;
  }

  // ─── PHASE 1: Split input into task segments ──────────────────────────────
  // Only split on explicit multi-task markers. "וביצים" must NOT split.
  function splitSegments(text) {
    const parts = text.split(/\s+וגם\s+|\s+ובנוסף\s+|[;؛]\s*/);
    return parts.map(s => s.trim()).filter(Boolean);
  }

  // ─── PHASE 2: Extract time ────────────────────────────────────────────────
  function extractTime(text, now) {
    let m;

    // Digital HH:MM anywhere
    m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) return { mins: +m[1] * 60 + +m[2], match: m[0], fromText: true };

    // "עוד שעתיים"
    m = text.match(/עוד\s+שעתיים/);
    if (m) return { mins: nowMins(now) + 120, match: m[0], fromText: true, relative: true };

    // "עוד שעה"
    m = text.match(/עוד\s+שעה/);
    if (m) return { mins: nowMins(now) + 60, match: m[0], fromText: true, relative: true };

    // "עוד X שעות"
    m = text.match(/עוד\s+(\d+)\s+שעות?/);
    if (m) return { mins: nowMins(now) + +m[1] * 60, match: m[0], fromText: true, relative: true };

    // "עוד X דקות"
    m = text.match(/עוד\s+(\d+)\s+דקות?/);
    if (m) return { mins: nowMins(now) + +m[1], match: m[0], fromText: true, relative: true };

    // "בשעה X" or "ב-X" or "ב X" — digit
    m = text.match(/(?:בשעה\s+|ב[-–\s]?)(\d{1,2})(?::(\d{2}))?(?!\d)/);
    if (m) {
      let h = +m[1], min = m[2] ? +m[2] : 0;
      // Ambiguous hour (1–6): assume PM unless morning context found
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
    if (/מחר/.test(text))     return { date: addDays(now, 1), fromText: true, match: 'מחר' };
    if (/היום/.test(text))    return { date: new Date(now),   fromText: true, match: 'היום' };

    const m = text.match(/ביום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
    if (m) {
      const target = DOW[m[1]];
      const cur    = now.getDay();
      let diff     = target - cur;
      if (diff <= 0) diff += 7;
      return { date: addDays(now, diff), fromText: true, match: m[0] };
    }

    return { date: new Date(now), fromText: false, match: null };
  }

  // ─── PHASE 4: Extract assignee ────────────────────────────────────────────
  function extractAssignee(text) {
    // "Name + agent-verb" pattern wins over bare mention
    for (const { names, id } of PERSON_ALIASES) {
      for (const name of names) {
        const re = new RegExp(name + '\\s+' + AGENT_VERBS.source);
        if (re.test(text)) return { id, fromText: true, match: name };
      }
    }
    // Direct mention (longest name first to avoid partial matches)
    const sorted = PERSON_ALIASES.slice().sort((a, b) => b.names[0].length - a.names[0].length);
    for (const { names, id } of sorted) {
      for (const name of names) {
        if (text.includes(name)) return { id, fromText: true, match: name };
      }
    }
    return { id: null, fromText: false, match: null };
  }

  // ─── PHASE 5: Detect task type ────────────────────────────────────────────
  function detectType(text) {
    if (REMINDER_KW.test(text)) return 'reminder';
    if (EVENT_KW.test(text))    return 'event';
    return 'task';
  }

  // ─── PHASE 6: Clean title ─────────────────────────────────────────────────
  function cleanTitle(text, matchesToStrip) {
    let s = text;

    // Strip filler phrases
    for (const re of FILLER) s = s.replace(re, '');

    // Strip matched time/date/person tokens
    for (const token of matchesToStrip) {
      if (token) s = s.replace(token, ' ');
    }

    // Strip standalone reminder/filler keywords
    s = s.replace(/\b(תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי)\b/g, '');

    // Clean up punctuation and extra whitespace
    s = s.replace(/\s{2,}/g, ' ')
         .replace(/^[\s,.\-–״׳]+/, '')
         .replace(/[\s,.\-–״׳]+$/, '')
         .trim();

    // Fall back to raw text if we stripped everything
    return s || text.trim();
  }

  // ─── PHASE 7: Confidence score ────────────────────────────────────────────
  function confidence(p) {
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
      date,          // { date: Date, fromText, match }
      assignedTo:    assignee.id,
      type,
      timeFromText:  time.fromText,
      dateFromText:  date.fromText,
      assigneeFromText: assignee.fromText,
      rawInput:      text,
    };
    parsed.confidence = confidence(parsed);
    return parsed;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  /**
   * parse(text, opts?) → ParsedTask[]
   * opts.now — override current time (Date), default: new Date()
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
