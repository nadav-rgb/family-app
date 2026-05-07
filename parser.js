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

  // ─── Family member aliases — fallback for standalone / test use ──────────
  // Production always passes opts.people built from FAMILY + I18N.
  const DEFAULT_PEOPLE = [
    { names: ['יונתן', 'yonatan', 'Yonatan'], id: 'yonatan' },
    { names: ['דודי',  'dudi',    'Dudi'   ], id: 'dudi'    },
    { names: ['אמא',   'mom',     'Mom'    ], id: 'mom'     },
    { names: ['אבא',   'dad',     'Dad'    ], id: 'dad'     },
  ];

  // ─── Task verb whitelist (infinitives only, longest first) ───────────────
  // These are the split signals for free-speech segmentation.
  // If in doubt about a verb, leave it OUT — under-splitting is safer than over-splitting.
  const TASK_VERBS = [
    // multi-syllable first (prevents substring shadowing)
    'להתקשר','להתכונן','להתחיל','להתאמן','להתפנות',
    'להוריד','להעלות','להחזיר','להזמין','להכין','להביא','להוציא','להגיע',
    'לאסוף','לאכול','לאסדר',
    'לבדוק','לבשל',
    'לנסוע','לנקות','לנהוג',
    'לסדר','לסיים',
    'לקנות','לקחת','לקבוע','לקבל','לקרוא',
    'לשלם','לשלוח','לשמור','לשטוף',
    'לטפל','לתקן',
    'לפגוש','לפנות','לפתוח',
    'לרשום',
    'לענות','לעדכן',
    'לחפש','לחזור','לחכות',
    'לדווח','למצוא','למסור',
    'לכתוב',
    // short / risky verbs last — omit ambiguous ones like לבקש
  ].sort((a, b) => b.length - a.length);

  // Verbs that signal an explicit agent role when right after a name
  const AGENT_VERBS_RE = /ייקח|תיקח|יעשה|תעשה|יביא|תביא|ילך|תלך|יקח|יסיע|תסיע|ירים|תרים|יאסוף|תאסוף|יסדר|תסדר|יכין|תכין|ילווה|תלווה|יורד|תורד|יעלה|תעלה|יקנה|תקנה|יוציא|תוציא|יתקשר|תתקשר/;

  // ─── Type keywords ─────────────────────────────────────────────────────────
  const REMINDER_KW = /תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי/;
  const EVENT_KW    = /פגישה|ישיבה|אסיפה|רופא|דנטיסט|שיניים|חוג|ביקור|טיסה|נסיעה|הצגה|סרט|מסיבה|אירוע/;

  // Filler phrases to strip before title extraction
  const FILLER = [
    /תזכיר\s+לי\s*/g, /תזכרי\s+לי\s*/g, /תזכרו\s+לי\s*/g,
    /בבקשה\s*/g,
  ];

  // Common opener phrases that add no task meaning
  const PREAMBLE_RE = /^(אני\s+צריך|אני\s+חייב|אני\s+רוצה|אנחנו\s+צריכים|צריך|חייב|יש\s+לי|אפשר)\s+/;

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

  // ═══════════════════════════════════════════════════════════════════════════
  // FREE SPEECH SEGMENTATION
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Strip opener phrases that add no meaning ─────────────────────────────
  function stripPreamble(text) {
    return text.replace(PREAMBLE_RE, '').trim();
  }

  // ─── Word-boundary check before position idx ─────────────────────────────
  // Valid: start-of-string, space, or ו (which itself must be at word start)
  function isWordStart(text, idx) {
    if (idx === 0) return true;
    const c = text[idx - 1];
    if (c === ' ' || c === '\t') return true;
    if (c === 'ו') return idx === 1 || text[idx - 2] === ' ' || text[idx - 2] === '\t';
    return false;
  }

  // ─── Scan text for task verbs, return sorted position list ───────────────
  function findVerbPositions(text) {
    const seen    = new Set();
    const results = [];

    for (const verb of TASK_VERBS) {
      let i = 0;
      while (true) {
        const idx = text.indexOf(verb, i);
        if (idx === -1) break;
        i = idx + 1;

        // Must end at word boundary
        const after = text[idx + verb.length];
        if (after !== undefined && after !== ' ' && after !== '\t') continue;

        if (!isWordStart(text, idx)) continue;
        if (seen.has(idx)) continue;
        seen.add(idx);

        const hasVav = (idx > 0 && text[idx - 1] === 'ו');
        results.push({ pos: idx, verb, hasVav, reason: 'verb:' + verb });
      }
    }

    return results.sort((a, b) => a.pos - b.pos);
  }

  // ─── Scan for known-name patterns that signal a new task agent ───────────
  // Recognizes: name at position 0, or ו+name at word boundary
  function findNamePositions(text, people) {
    const seen    = new Set();
    const results = [];

    for (const { names } of people) {
      for (const name of names) {
        // Pattern A: name at sentence start
        if ((text.startsWith(name + ' ') || text.startsWith(name + '\t')) && !seen.has(0)) {
          seen.add(0);
          results.push({ pos: 0, name, hasVav: false, reason: 'name_start:' + name });
        }

        // Pattern B: ו + name at word boundary (coordination: "ואמא", "ואבא")
        const needle = 'ו' + name;
        let i = 0;
        while (true) {
          const idx = text.indexOf(needle, i);
          if (idx === -1) break;
          i = idx + 1;

          // ו must be at word start
          const before = idx > 0 ? text[idx - 1] : null;
          if (before !== null && before !== ' ' && before !== '\t') continue;

          // After name must be space or end
          const after = text[idx + needle.length];
          if (after !== undefined && after !== ' ' && after !== '\t') continue;

          const namePos = idx + 1; // position of the name itself (after ו)
          if (seen.has(namePos)) continue;
          seen.add(namePos);

          results.push({ pos: namePos, name, hasVav: true, reason: 'name_vav:' + name });
        }
      }
    }

    return results;
  }

  // ─── Detect subordinate clause: verb + " ש" + conjugated verb prefix ─────
  // "ולבקש שתביא" → subordinate (don't split)
  // "ולשלם שכר"   → "שכר" is a noun (כ not a verb prefix) → NOT subordinate → split
  function isSubordinateVerb(text, pos, verb) {
    const after = text.slice(pos + verb.length).replace(/^\s+/, '');
    if (!after.startsWith('ש')) return false;
    // Conjugated verb prefixes in Hebrew: י (3rd masc), ת (3rd fem/2nd/future), נ (1st plural), א (1st sing)
    return 'יתנא'.includes(after[1]);
  }

  // ─── Main free-speech segmenter ───────────────────────────────────────────
  /**
   * freeSpeechToIntentSegments(text, opts) → IntentSegment[]
   *
   * IntentSegment: { text, splitReason, preambleDate }
   *
   * Splits free Hebrew speech into one segment per task, using task verbs
   * and name-coordination patterns as boundaries — NOT punctuation.
   *
   * Conservative: when in doubt, returns fewer (larger) segments.
   */
  function freeSpeechToIntentSegments(text, opts) {
    const people = (opts && opts.people) || DEFAULT_PEOPLE;
    const now    = (opts && opts.now)    || new Date();
    const lang   = (opts && opts.lang)   || 'he';

    // Non-Hebrew: skip smart splitting — one segment, basic parsing only.
    // Phase 2 will add a real EnglishParser with LANG_CONFIG.en.
    if (lang !== 'he') {
      return [{ text: text.trim(), splitReason: 'lang_fallback', preambleDate: null }];
    }

    // Hard splits first (semicolons, "ובנוסף") — user was explicit there
    const hardParts = text.split(/[;؛]\s*|\s+ובנוסף\s+/).map(s => s.trim()).filter(Boolean);
    if (hardParts.length > 1) {
      return hardParts.flatMap(part => freeSpeechToIntentSegments(part, opts));
    }

    const clean = stripPreamble(text.trim());

    // Collect all candidate split positions from both verbs and name patterns
    const allPositions = [
      ...findVerbPositions(clean),
      ...findNamePositions(clean, people),
    ]
      .sort((a, b) => a.pos - b.pos)
      // Remove exact-position duplicates (verb and name landing on same spot)
      .filter((p, i, arr) => i === 0 || p.pos !== arr[i - 1].pos);

    // No recognizable structure → one segment, low confidence
    if (allPositions.length === 0) {
      return [{ text: clean, splitReason: 'no_split', preambleDate: null }];
    }

    // Everything before the first recognized verb/name = preamble context
    const firstPos    = allPositions[0].pos;
    const preambleStr = clean.slice(0, firstPos).trim();

    // Extract date from preamble ("מחר בבוקר", "היום") as a fallback for segments
    const preambleDate = preambleStr ? extractDate(preambleStr, now) : null;

    // Slice text into raw segments at the split positions
    const segments = [];
    for (let i = 0; i < allPositions.length; i++) {
      const cur  = allPositions[i];
      const next = allPositions[i + 1];

      // Guard: is this verb beginning a subordinate clause? → merge into previous
      if (i > 0 && cur.verb && isSubordinateVerb(clean, cur.pos, cur.verb)) {
        if (segments.length) {
          segments[segments.length - 1].text += ' ' + clean.slice(cur.pos).trim();
        }
        break; // subordinate clause consumes the rest
      }

      // End of this segment = start of next, trimming any "ו" that belongs to the next verb
      const rawEnd = next
        ? (next.hasVav ? next.pos - 1 : next.pos)
        : clean.length;

      const segText = clean.slice(cur.pos, rawEnd).trim();

      // Skip ghost segments (just a bare name with no content after it)
      if (segText.length <= 4 && i < allPositions.length - 1) continue;

      segments.push({
        text:         segText,
        splitReason:  cur.reason,
        preambleDate: preambleDate && preambleDate.fromText ? preambleDate : null,
      });
    }

    return segments.length
      ? segments
      : [{ text: clean, splitReason: 'fallback', preambleDate: null }];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEGMENT PARSING (unchanged logic, adds optional fallbackDate)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Extract time ─────────────────────────────────────────────────────────
  function extractTime(text, now) {
    let m;

    // HH:MM am/pm (English) — must precede bare HH:MM to take priority
    m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)\b/i);
    if (m) {
      let h = +m[1], min = +m[2];
      const pm = m[3].toLowerCase() === 'pm';
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
      return { mins: h * 60 + min, match: m[0], fromText: true };
    }

    m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) return { mins: +m[1] * 60 + +m[2], match: m[0], fromText: true };

    m = text.match(/עוד\s+שעתיים/);
    if (m) return { mins: nowMins(now) + 120, match: m[0], fromText: true };

    m = text.match(/עוד\s+שעה/);
    if (m) return { mins: nowMins(now) + 60,  match: m[0], fromText: true };

    m = text.match(/עוד\s+(\d+)\s+שעות?/);
    if (m) return { mins: nowMins(now) + +m[1] * 60, match: m[0], fromText: true };

    m = text.match(/עוד\s+(\d+)\s+דקות?/);
    if (m) return { mins: nowMins(now) + +m[1], match: m[0], fromText: true };

    m = text.match(/(?:בשעה\s+|ב[-–\s]?)(\d{1,2})(?::(\d{2}))?(?!\d)/);
    if (m) {
      let h = +m[1], min = m[2] ? +m[2] : 0;
      if (h >= 1 && h <= 6 && !/(בוקר|לפני.{0,3}הצהריים)/.test(text)) h += 12;
      if (h >= 0 && h <= 23) return { mins: h * 60 + min, match: m[0], fromText: true };
    }

    for (const [word, hour] of HEB_HOURS) {
      const re = new RegExp('(?:בשעה\\s+|ב[-–]?)' + word + MOD_RE);
      m = text.match(re);
      if (m) return { mins: applyMod(hour * 60, m[1]), match: m[0], fromText: true };
    }

    for (const { re, mins } of TOD) {
      m = text.match(re);
      if (m) return { mins, match: m[0], fromText: true };
    }

    return { mins: null, fromText: false, match: null };
  }

  // ─── Extract date ─────────────────────────────────────────────────────────
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

  // ─── Extract assignee ─────────────────────────────────────────────────────
  function extractAssignee(text, people) {
    // Tier 1: subject at sentence start
    for (const { names, id } of people) {
      for (const name of names) {
        if (text.startsWith(name + ' ') || text.startsWith(name + '\t')) {
          return { id, fromText: true, match: name };
        }
      }
    }
    // Tier 2: name + explicit agent verb
    for (const { names, id } of people) {
      for (const name of names) {
        if (new RegExp(name + '\\s+(?:' + AGENT_VERBS_RE.source + ')').test(text)) {
          return { id, fromText: true, match: name };
        }
      }
    }
    // Tier 3: bare mention, but NOT if preceded by "את" (object marker)
    for (const { names, id } of people) {
      for (const name of names) {
        if (!new RegExp('את\\s+' + name).test(text) && text.includes(name)) {
          return { id, fromText: true, match: name };
        }
      }
    }
    return { id: null, fromText: false, match: null };
  }

  // ─── Detect task type ─────────────────────────────────────────────────────
  function detectType(text) {
    if (REMINDER_KW.test(text)) return 'reminder';
    if (EVENT_KW.test(text))    return 'event';
    return 'task';
  }

  // ─── Build clean title ────────────────────────────────────────────────────
  function cleanTitle(text, matchesToStrip) {
    let s = text;
    for (const re of FILLER) s = s.replace(re, '');
    for (const token of matchesToStrip) {
      if (token) s = s.replace(token, ' ');
    }
    s = s.replace(/\b(תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי)\b/g, '');
    s = s.replace(/\s{2,}/g, ' ')
         .replace(/^[\s,.\-–״׳]+/, '')
         .replace(/[\s,.\-–״׳]+$/, '')
         .trim();
    return s || text.trim();
  }

  // ─── Confidence score ─────────────────────────────────────────────────────
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

  // ─── Parse one intent segment into a structured task ─────────────────────
  // opts.fallbackDate: date from preamble context, used when segment has no explicit date
  function parseSegment(text, now, people, opts) {
    const time     = extractTime(text, now);
    const date     = extractDate(text, now);
    const assignee = extractAssignee(text, people);
    const type     = detectType(text);

    // Use preamble date as fallback only when this segment has no date of its own
    const resolvedDate = date.fromText
      ? date
      : ((opts && opts.fallbackDate && opts.fallbackDate.fromText) ? opts.fallbackDate : date);

    const title = cleanTitle(text, [time.match, resolvedDate.match, assignee.match]);
    const mins  = time.mins !== null
      ? Math.max(0, Math.min(time.mins, 23 * 60 + 59))
      : defaultMins(now);

    const parsed = {
      title,
      mins,
      date:             resolvedDate,
      assignedTo:       assignee.id,
      type,
      timeFromText:     time.fromText,
      dateFromText:     resolvedDate.fromText,
      assigneeFromText: assignee.fromText,
      rawInput:         text,
    };
    parsed.confidence = calcConfidence(parsed);
    return parsed;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * parse(text, opts?) → ParsedTask[]
   *
   * opts.now     — override current time (Date), default: new Date()
   * opts.people  — family member list from app's FAMILY + I18N
   */
  function parse(text, opts) {
    const now    = (opts && opts.now)    || new Date();
    const people = (opts && opts.people) || DEFAULT_PEOPLE;
    if (!text || !text.trim()) return [];

    const segments = freeSpeechToIntentSegments(text.trim(), { now, people });
    return segments.map(seg =>
      parseSegment(seg.text, now, people, { fallbackDate: seg.preambleDate })
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function nowMins(d) { return d.getHours() * 60 + d.getMinutes(); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

  global.HebrewParser = { parse };

})(window);


// ─── Dev console tests (localhost only) ───────────────────────────────────────
if (typeof window !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  (function runTests() {
    const NOW = new Date('2026-05-08T10:00:00');
    const PEOPLE = [
      { id: 'yonatan', names: ['יונתן', 'Yonatan', 'yonatan'] },
      { id: 'dudi',    names: ['דודי',  'Dudi',    'dudi'   ] },
      { id: 'mom',     names: ['אמא',   'Mom',     'mom'    ] },
      { id: 'dad',     names: ['אבא',   'Dad',     'dad'    ] },
    ];
    const opts = { now: NOW, people: PEOPLE };

    // ── Assignee tests (from previous session) ────────────────────────────
    const ASSIGNEE_CASES = [
      { input: 'שי ייקח את יונתן לחוג ביום שלישי', expectAssignee: null,      titleIncludes: 'יונתן' },
      { input: 'אמא תקנה חלב בערב',               expectAssignee: 'mom',     titleIncludes: 'חלב',     expectMins: 19*60 },
      { input: 'אבא יוציא את הילדים ב 13:20',      expectAssignee: 'dad',     titleIncludes: 'הילדים', expectMins: 13*60+20 },
      { input: 'דוד יתקשר לסבתא מחר',              expectAssignee: null,      titleIncludes: 'סבתא' },
      { input: 'יונתן יסדר את החדר אחרי הצהריים',  expectAssignee: 'yonatan', titleIncludes: 'החדר',   expectMins: 14*60 },
    ];

    // ── Free-speech segmentation tests (new) ─────────────────────────────
    const SEGMENT_CASES = [
      {
        label:        'complex free speech',
        input:        'אני צריך היום לקנות חלב וביצים בערב להתקשר לאמא מחר בבוקר לשלם חשמל',
        expectCount:  3,
        expectTitles: ['חלב', 'להתקשר', 'לשלם'],
      },
      {
        label:        'two tasks with ו',
        input:        'לקנות חלב וביצים ולשלם חשבון חשמל',
        expectCount:  2,
        expectTitles: ['חלב', 'לשלם'],
      },
      {
        label:        'subordinate clause — must NOT split',
        input:        'להתקשר לאמא ולבקש שתביא את יונתן',
        expectCount:  1,
        expectTitles: ['להתקשר'],
      },
      {
        label:        'two agents with name+vav',
        input:        'אמא תקנה חלב ואבא יוציא את הילדים',
        expectCount:  2,
        expectTitles: ['חלב', 'הילדים'],
      },
      {
        label:        'preamble date propagation',
        input:        'מחר בבוקר להתקשר לרופא בצהריים לקנות תרופה בערב להכין שיעורים',
        expectCount:  3,
        // All segments should have tomorrow's date
        expectDateOffset: 1,
      },
    ];

    let passed = 0, total = 0;

    console.group('🔍 HebrewParser — assignee tests');
    ASSIGNEE_CASES.forEach(({ input, expectAssignee, titleIncludes, expectMins }) => {
      total++;
      const [r] = window.HebrewParser.parse(input, opts);
      const okA = r.assignedTo === expectAssignee;
      const okT = r.title.includes(titleIncludes);
      const okM = expectMins === undefined || r.mins === expectMins;
      const ok  = okA && okT && okM;
      if (ok) passed++;
      console.log(ok ? '✅' : '❌', `"${input}"`,
        '\n   assignee:', r.assignedTo,  okA ? '' : `← expected ${expectAssignee}`,
        '\n   title:',    r.title,        okT ? '' : `← should include "${titleIncludes}"`,
        '\n   mins:',     r.mins,         okM ? '' : `← expected ${expectMins}`);
    });
    console.groupEnd();

    console.group('🔍 HebrewParser — free-speech segmentation tests');
    SEGMENT_CASES.forEach(({ label, input, expectCount, expectTitles, expectDateOffset }) => {
      total++;
      const results = window.HebrewParser.parse(input, opts);
      const okCount = results.length === expectCount;
      const okTitles = !expectTitles || expectTitles.every((kw, i) =>
        results[i] && results[i].title.includes(kw)
      );
      const okDate = expectDateOffset === undefined || results.every(r => {
        const d = r.date.date;
        const expected = addDays(NOW, expectDateOffset);
        return d.toDateString() === expected.toDateString();
      });
      const ok = okCount && okTitles && okDate;
      if (ok) passed++;
      console.log(ok ? '✅' : '❌', `[${label}] "${input}"`,
        '\n   segments:', results.length, okCount ? '' : `← expected ${expectCount}`,
        '\n   titles:', results.map(r => r.title));
      if (!okTitles) console.log('   ← expected titles containing:', expectTitles);
      if (!okDate)   console.log('   ← expected date offset:', expectDateOffset, 'days');
    });
    console.groupEnd();

    console.log(`\n✅ ${passed}/${total} passed`);

    // helper used in test block only
    function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  })();
}
