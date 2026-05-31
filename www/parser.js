/**
 * HebrewParser — modular speech-to-task NLP engine.
 *
 * Architecture:
 *   - LANG_CONFIG: language-specific dictionaries (verbs, patterns, expressions)
 *   - Shared pipeline: extractTime / extractDate / extractAssignee /
 *                      cleanTitle / calcConfidence / parseSegment
 *   - freeSpeechToIntentSegments: the smart splitter, config-driven
 *   - parse(): public entry point — resolves config, runs pipeline, returns tasks
 *
 * Logging:
 *   Set window.APP_DEBUG = true in the browser console to enable structured logs.
 *   No log output in production (flag defaults to false).
 */
(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUG LOGGER
  // Enable: window.APP_DEBUG = true  (in browser console or before script load)
  // ═══════════════════════════════════════════════════════════════════════════
  const ts  = () => new Date().toISOString().slice(11, 23);
  const dbg = () => typeof window !== 'undefined' && !!window.APP_DEBUG;
  const Log = {
    group:    (label)       => dbg() && console.group(`[${ts()}] ${label}`),
    groupEnd: ()            => dbg() && console.groupEnd(),
    info:     (label, data) => dbg() && console.log(`    ${label}:`, data),
    warn:     (label, data) => dbg() && console.warn(`    ⚠ ${label}:`, data),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LANGUAGE CONFIG
  // Each language provides its own dictionaries.
  // The shared pipeline (parseSegment, calcConfidence, etc.) is config-driven —
  // no if(lang==='xx') blocks allowed inside shared functions.
  // ═══════════════════════════════════════════════════════════════════════════
  const LANG_CONFIG = {

    // ── Hebrew ───────────────────────────────────────────────────────────────
    he: {
      // Infinitive task-verbs — the primary split signal in free speech.
      // Conservative list: when in doubt, leave the verb OUT.
      taskVerbs: [
        'להתקשר','להתכונן','להתחיל','להתאמן','להתפנות',
        'להוריד','להעלות','להחזיר','להזמין','להכין','להביא','להוציא','להגיע',
        'לאסוף','לאכול',
        'לבדוק','לבשל',
        'לנסוע','לנקות','לנהוג','ללכת',
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
      ].sort((a, b) => b.length - a.length),

      // Time-of-day expressions → minutes from midnight
      tod: [
        { re: /בלילה/,                      mins: 21 * 60 },
        { re: /בערב|ערב/,                   mins: 19 * 60 },
        { re: /אחרי.{0,3}הצהריים|אחה"?צ/,  mins: 14 * 60 },
        { re: /בצהריים|צהריים/,             mins: 12 * 60 },
        { re: /לפני.{0,3}הצהריים|לפה"?צ/,  mins: 10 * 60 },
        { re: /בבוקר|בוקר/,                 mins:  8 * 60 },
        { re: /מוקדם/,                       mins:  7 * 60 },
      ],

      // Word-based hour expressions (multi-word MUST precede single-word)
      wordHours: [
        ['אחת עשרה', 11], ['אחד עשר', 11],
        ['שתים עשרה', 12], ['שנים עשר', 12],
        ['אחת', 1], ['אחד', 1],
        ['שתיים', 2], ['שתים', 2],
        ['שלוש', 3], ['שלש', 3],
        ['ארבע', 4], ['חמש', 5], ['שש', 6], ['שבע', 7],
        ['שמונה', 8], ['תשע', 9],
        ['עשרה', 10], ['עשר', 10],
      ],

      // Regex suffix for half/quarter modifiers after a word-hour
      modRe: '(?:\\s+(וחצי|ורבע|פחות\\s+רבע))?',

      // Opener phrases stripped before verb detection
      preambleRe: /^(אני\s+צריך|אני\s+חייב|אני\s+רוצה|אנחנו\s+צריכים|צריך|חייב|יש\s+לי|אפשר)\s+/,

      // Filler phrases stripped from title
      filler: [
        /תזכיר\s+לי\s*/g, /תזכרי\s+לי\s*/g, /תזכרו\s+לי\s*/g,
        /בבקשה\s*/g,
      ],

      // Task-type detection
      reminderKw: /תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי/,
      eventKw:    /פגישה|ישיבה|אסיפה|רופא|דנטיסט|שיניים|חוג|ביקור|טיסה|נסיעה|הצגה|סרט|מסיבה|אירוע/,

      // Conjugated verb patterns that mark a person as subject (agent)
      agentVerbsRe: /ייקח|תיקח|יעשה|תעשה|יביא|תביא|ילך|תלך|יקח|יסיע|תסיע|ירים|תרים|יאסוף|תאסוף|יסדר|תסדר|יכין|תכין|ילווה|תלווה|יורד|תורד|יעלה|תעלה|יקנה|תקנה|יוציא|תוציא|יתקשר|תתקשר/,

      // ampm: Hebrew uses 24h — no AM/PM adjustment needed
      ampm: false,
    },

    // ── English (Phase 2) ────────────────────────────────────────────────────
    // Stub: all fields present and typed correctly so the engine never crashes.
    // Fill in Phase 2: taskVerbs, tod, wordHours, preambleRe, filler, etc.
    en: {
      taskVerbs:    [],          // e.g. ['to call','to take','to buy','to pay',...]
      tod:          [],          // e.g. [{re:/in the evening/i, mins:19*60},...]
      wordHours:    [],          // e.g. [['three',3],['four',4],...]
      modRe:        '',          // e.g. '(?:\\s+(and a half|quarter past))?'
      preambleRe:   /^$/,        // e.g. /^(I need to|I have to|please|remind me to)\s+/i
      filler:       [],          // e.g. [/remind me to\s*/gi,...]
      reminderKw:   /(?!)/,      // e.g. /remind|remember|don't forget/i
      eventKw:      /(?!)/,      // e.g. /meeting|appointment|doctor|class/i
      agentVerbsRe: /(?!)/,      // e.g. /will take|should call|needs to/i
      ampm:         true,        // English uses AM/PM
    },
  };

  function getLangConfig(lang) {
    return LANG_CONFIG[lang] || LANG_CONFIG.he;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const DOW = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 };

  // Fallback people list — production always passes opts.people from FAMILY + I18N
  const DEFAULT_PEOPLE = [
    { names: ['יונתן', 'yonatan', 'Yonatan'], id: 'yonatan' },
    { names: ['דודי',  'dudi',    'Dudi'   ], id: 'dudi'    },
    { names: ['אמא',   'mom',     'Mom'    ], id: 'mom'     },
    { names: ['אבא',   'dad',     'Dad'    ], id: 'dad'     },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function nowMins(d) { return d.getHours() * 60 + d.getMinutes(); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

  function applyMod(base, mod) {
    if (!mod)                return base;
    if (mod.includes('וחצי')) return base + 30;
    if (mod.includes('ורבע')) return base + 15;
    if (mod.includes('פחות')) return base - 15;
    return base;
  }

  // True when position idx is at a word start (space, tab, ו at word boundary, or string start)
  function isWordStart(text, idx) {
    if (idx === 0) return true;
    const c = text[idx - 1];
    if (c === ' ' || c === '\t') return true;
    if (c === 'ו') return idx === 1 || text[idx - 2] === ' ' || text[idx - 2] === '\t';
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION PIPELINE (config-driven, language-agnostic algorithms)
  // ═══════════════════════════════════════════════════════════════════════════

  function stripPreamble(text, config) {
    return text.replace(config.preambleRe, '').trim();
  }

  // ─── Time ─────────────────────────────────────────────────────────────────
  function extractTime(text, now, config) {
    let m;

    // HH:MM am/pm — must precede bare HH:MM (works for both languages when ampm=true)
    m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)\b/i);
    if (m) {
      let h = +m[1], min = +m[2];
      const pm = m[3].toLowerCase() === 'pm';
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
      Log.info('time', `${m[0]} → ${h}:${String(min).padStart(2,'0')}`);
      return { mins: h * 60 + min, match: m[0], fromText: true };
    }

    // Bare HH:MM
    m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) {
      Log.info('time', `${m[0]} → ${m[1]}:${m[2]}`);
      return { mins: +m[1] * 60 + +m[2], match: m[0], fromText: true };
    }

    // Relative: עוד שעתיים / שעה / X שעות / X דקות
    m = text.match(/עוד\s+שעתיים/);
    if (m) return { mins: nowMins(now) + 120, match: m[0], fromText: true };
    m = text.match(/עוד\s+שעה/);
    if (m) return { mins: nowMins(now) + 60,  match: m[0], fromText: true };
    m = text.match(/עוד\s+(\d+)\s+שעות?/);
    if (m) return { mins: nowMins(now) + +m[1] * 60, match: m[0], fromText: true };
    m = text.match(/עוד\s+(\d+)\s+דקות?/);
    if (m) return { mins: nowMins(now) + +m[1], match: m[0], fromText: true };

    // Digit hour with Hebrew prefix: "בשעה 8", "ב-8", "ב 4"
    m = text.match(/(?:בשעה\s+|ב[-–\s]?)(\d{1,2})(?::(\d{2}))?(?!\d)/);
    if (m) {
      let h = +m[1], min = m[2] ? +m[2] : 0;
      if (h >= 1 && h <= 6 && !/(בוקר|לפני.{0,3}הצהריים)/.test(text)) h += 12;
      if (h >= 0 && h <= 23) {
        Log.info('time', `digit prefix → ${h}:${String(min).padStart(2,'0')}`);
        return { mins: h * 60 + min, match: m[0], fromText: true };
      }
    }

    // Word-hours from config
    const modRe = config.modRe || '';
    for (const [word, hour] of (config.wordHours || [])) {
      const re = new RegExp('(?:בשעה\\s+|ב[-–]?)' + word + modRe);
      m = text.match(re);
      if (m) {
        Log.info('time', `word-hour "${word}" → ${hour}h`);
        return { mins: applyMod(hour * 60, m[1]), match: m[0], fromText: true };
      }
    }

    // Time-of-day words (בוקר/צהריים/ערב/לילה) intentionally do NOT set a clock
    // time — only an explicit hour does. A vague part-of-day leaves the task
    // with no time (the user can add one in "זמן ותאריך" if they want).

    return { mins: null, fromText: false, match: null };
  }

  // ─── Date ─────────────────────────────────────────────────────────────────
  // Currently Hebrew-only. Phase 2: move patterns to LANG_CONFIG.he.datePatterns.
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

  // ─── Assignee ─────────────────────────────────────────────────────────────
  function extractAssignee(text, people, config) {
    const agentRe = config.agentVerbsRe;

    // Tier 1: name at sentence start → subject/doer
    for (const { names, id } of people) {
      for (const name of names) {
        if (text.startsWith(name + ' ') || text.startsWith(name + '\t')) {
          Log.info('assignee', `tier-1 subject-start: ${name} → ${id}`);
          return { id, fromText: true, match: name };
        }
      }
    }

    // Tier 2: name + explicit agent verb anywhere
    for (const { names, id } of people) {
      for (const name of names) {
        if (agentRe && new RegExp(name + '\\s+(?:' + agentRe.source + ')').test(text)) {
          Log.info('assignee', `tier-2 agent-verb: ${name} → ${id}`);
          return { id, fromText: true, match: name };
        }
      }
    }

    // Tier 3: bare mention — but NOT if preceded by "את" (direct object)
    for (const { names, id } of people) {
      for (const name of names) {
        if (!new RegExp('את\\s+' + name).test(text) && text.includes(name)) {
          Log.info('assignee', `tier-3 mention: ${name} → ${id}`);
          return { id, fromText: true, match: name };
        }
      }
    }

    Log.info('assignee', 'none detected');
    return { id: null, fromText: false, match: null };
  }

  // ─── Type ─────────────────────────────────────────────────────────────────
  function detectType(text, config) {
    if (config.reminderKw && config.reminderKw.test(text)) return 'reminder';
    if (config.eventKw    && config.eventKw.test(text))    return 'event';
    return 'task';
  }

  // ─── Title ────────────────────────────────────────────────────────────────
  function cleanTitle(text, matchesToStrip, config) {
    let s = text;
    for (const re of (config.filler || [])) s = s.replace(re, '');
    for (const token of matchesToStrip) {
      if (token) s = s.replace(token, ' ');
    }
    // Strip reminder verb keywords (Hebrew — Phase 2 should move to config)
    s = s.replace(/\b(תזכיר|תזכור|תזכרי|תזכרו|להזכיר|זכור|זכרי)\b/g, '');
    s = s.replace(/\s{2,}/g, ' ')
         .replace(/^[\s,.\-–״׳]+/, '')
         .replace(/[\s,.\-–״׳]+$/, '')
         .trim();
    return s || text.trim();
  }

  // ─── Confidence ───────────────────────────────────────────────────────────
  function calcConfidence(p) {
    let score = 0.4;
    if (p.timeFromText)     score += 0.25;
    if (p.dateFromText)     score += 0.10;
    if (p.assigneeFromText) score += 0.10;
    if (p.title.length > 3) score += 0.15;
    const result = Math.min(score, 1.0);
    Log.info('confidence', result.toFixed(2));
    return result;
  }

  // ─── Default time ─────────────────────────────────────────────────────────
  function defaultMins(now) {
    const h = now.getHours();
    if (h < 7)  return  8 * 60;
    if (h < 11) return 12 * 60;
    if (h < 13) return 15 * 60;
    if (h < 17) return 19 * 60;
    return Math.min((h + 2) * 60, 23 * 60);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FREE SPEECH SEGMENTATION
  // ═══════════════════════════════════════════════════════════════════════════

  function findVerbPositions(text, config) {
    const verbs   = config.taskVerbs || [];
    const seen    = new Set();
    const results = [];

    for (const verb of verbs) {
      let i = 0;
      while (true) {
        const idx = text.indexOf(verb, i);
        if (idx === -1) break;
        i = idx + 1;

        const after = text[idx + verb.length];
        if (after !== undefined && after !== ' ' && after !== '\t') continue;
        if (!isWordStart(text, idx)) continue;
        if (seen.has(idx)) continue;
        seen.add(idx);

        const hasVav = (idx > 0 && text[idx - 1] === 'ו');
        results.push({ pos: idx, verb, hasVav, reason: 'verb:' + verb });
      }
    }

    const sorted = results.sort((a, b) => a.pos - b.pos);
    if (sorted.length) Log.info('verbs found', sorted.map(r => `"${r.verb}" @${r.pos}`));
    return sorted;
  }

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

        // Pattern B: ו+name at word boundary
        const needle = 'ו' + name;
        let i = 0;
        while (true) {
          const idx = text.indexOf(needle, i);
          if (idx === -1) break;
          i = idx + 1;

          const before = idx > 0 ? text[idx - 1] : null;
          if (before !== null && before !== ' ' && before !== '\t') continue;
          const after = text[idx + needle.length];
          if (after !== undefined && after !== ' ' && after !== '\t') continue;

          const namePos = idx + 1;
          if (seen.has(namePos)) continue;
          seen.add(namePos);
          results.push({ pos: namePos, name, hasVav: true, reason: 'name_vav:' + name });
        }
      }
    }

    return results;
  }

  // Guard: verb followed by "ש + conjugated-verb prefix" = subordinate clause → no split
  // "ולבקש שתביא" → subordinate. "ולשלם שכר" → "שכר" is noun (כ not a verb prefix) → split OK.
  function isSubordinateVerb(text, pos, verb) {
    const after = text.slice(pos + verb.length).replace(/^\s+/, '');
    if (!after.startsWith('ש')) return false;
    return 'יתנא'.includes(after[1]); // conjugated verb prefixes
  }

  // Guard: movement verb + purpose verb without ו = compound intent → merge, not split.
  // "לנסוע לקריות לבדוק..." → one task. "לנסוע לתל אביב ולפגוש..." → two tasks (ו present).
  const MOVEMENT_VERBS = new Set([
    'ללכת','לנסוע','לצאת','לקפוץ','להיכנס','לעלות','לרדת','לחזור','לעבור','לטוס','לרוץ','לנהוג'
  ]);

  function segStartsWithMovementVerb(segText) {
    return MOVEMENT_VERBS.has(segText.trim().split(/\s+/)[0]);
  }

  // Noun-phrase completion guard. These construct/preposition words REQUIRE an object
  // after them, so a segment must never END on one ("...לסדר את"). If it does, the
  // object was orphaned into the next segment and we merge it back. Deterministic.
  const DANGLING_TAIL = new Set([
    'את','של','עם','על','אל','אצל','מול','בין','לפי','עבור','בשביל','מן','כדי','לגבי'
  ]);
  function endsWithDanglingWord(text) {
    const w = String(text || '').trim().split(/\s+/);
    return DANGLING_TAIL.has(w[w.length - 1]);
  }

  /**
   * freeSpeechToIntentSegments(text, opts) → IntentSegment[]
   *
   * Converts free Hebrew speech into per-task segments.
   * Non-Hebrew: returns the whole text as a single segment (Phase 2 will add configs).
   * Conservative: when in doubt, fewer segments.
   */
  function freeSpeechToIntentSegments(text, opts) {
    const people = (opts && opts.people) || DEFAULT_PEOPLE;
    const now    = (opts && opts.now)    || new Date();
    const lang   = (opts && opts.lang)   || 'he';
    const config = (opts && opts.config) || getLangConfig(lang);

    Log.group('freeSpeechToIntentSegments');
    Log.info('input', text);
    Log.info('lang', lang);

    // Non-Hebrew: smart splitting deferred to Phase 2
    if (lang !== 'he') {
      Log.info('fallback', 'non-Hebrew → single segment');
      Log.groupEnd();
      return [{ text: text.trim(), splitReason: 'lang_fallback', preambleDate: null }];
    }

    // Hard splits (semicolons, "ובנוסף") — user was explicit
    const hardParts = text.split(/[;؛]\s*|\s+ובנוסף\s+/).map(s => s.trim()).filter(Boolean);
    if (hardParts.length > 1) {
      Log.info('hard split', hardParts.length + ' parts');
      Log.groupEnd();
      return hardParts.flatMap(part => freeSpeechToIntentSegments(part, opts));
    }

    const clean = stripPreamble(text.trim(), config);
    if (clean !== text.trim()) Log.info('preamble stripped', `"${text.trim()}" → "${clean}"`);

    const allPositions = [
      ...findVerbPositions(clean, config),
      ...findNamePositions(clean, people),
    ]
      .sort((a, b) => a.pos - b.pos)
      .filter((p, i, arr) => i === 0 || p.pos !== arr[i - 1].pos);

    if (allPositions.length === 0) {
      Log.info('split', 'no split points → single segment');
      Log.groupEnd();
      return [{ text: clean, splitReason: 'no_split', preambleDate: null }];
    }

    const firstPos    = allPositions[0].pos;
    const preambleStr = clean.slice(0, firstPos).trim();
    const preambleDate = preambleStr ? extractDate(preambleStr, now) : null;
    const preambleTime = preambleStr ? extractTime(preambleStr, now, config) : null;

    if (preambleStr) Log.info('preamble context', `"${preambleStr}"`);

    const segments = [];
    for (let i = 0; i < allPositions.length; i++) {
      const cur  = allPositions[i];
      const next = allPositions[i + 1];

      if (i > 0 && cur.verb && isSubordinateVerb(clean, cur.pos, cur.verb)) {
        Log.info('subordinate', `"${cur.verb}" → merged into previous segment`);
        if (segments.length) {
          segments[segments.length - 1].text += ' ' + clean.slice(cur.pos).trim();
        }
        break;
      }

      const rawEnd  = next ? (next.hasVav ? next.pos - 1 : next.pos) : clean.length;

      // Guard: movement+purpose compound — ו absent before this verb AND previous
      // segment starts with a movement verb → this verb is the PURPOSE, not a new task.
      // Does NOT break: a later ו-prefixed verb can still start a new segment.
      if (i > 0 && !cur.hasVav && segments.length && segStartsWithMovementVerb(segments[segments.length - 1].text)) {
        const purposeText = clean.slice(cur.pos, rawEnd).trim();
        segments[segments.length - 1].text += ' ' + purposeText;
        Log.info('movement-compound', `merged "${purposeText}" into previous`);
        continue;
      }
      const segText = clean.slice(cur.pos, rawEnd).trim();

      if (segText.length <= 4 && i < allPositions.length - 1) {
        Log.warn('skip', `ghost segment "${segText}"`);
        continue;
      }

      Log.info('segment', `[${i}] "${segText}" (${cur.reason})`);
      segments.push({
        text:         segText,
        splitReason:  cur.reason,
        preambleDate: (preambleDate && preambleDate.fromText) ? preambleDate : null,
      });
    }

    // Noun-phrase completion guard: never leave a segment ending on a construct word
    // ("...לסדר את") — merge the next segment in so the object is not orphaned.
    for (let i = 0; i < segments.length - 1; ) {
      if (endsWithDanglingWord(segments[i].text)) {
        segments[i].text = (segments[i].text + ' ' + segments[i + 1].text).trim();
        segments.splice(i + 1, 1);
      } else {
        i++;
      }
    }

    // A time stated in the preamble ("מחר בשעה 2 לקחת...") belongs to the FIRST task
    // only (date carries to all tasks; time only to the adjacent first action).
    if (preambleTime && preambleTime.fromText && segments.length) {
      segments[0].preambleTime = preambleTime;
    }

    Log.info('total segments', segments.length);
    Log.groupEnd();

    return segments.length
      ? segments
      : [{ text: clean, splitReason: 'fallback', preambleDate: null }];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARSE ONE SEGMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function parseSegment(text, now, people, opts) {
    const config   = (opts && opts.config)      || getLangConfig('he');
    const fallback = (opts && opts.fallbackDate) || null;
    const fbTime   = (opts && opts.fallbackTime) || null;

    Log.group('parseSegment: "' + text + '"');

    const time     = extractTime(text, now, config);
    const date     = extractDate(text, now);
    const assignee = extractAssignee(text, people, config);
    const type     = detectType(text, config);

    const resolvedDate = date.fromText
      ? date
      : (fallback && fallback.fromText ? fallback : date);

    // A time spoken in the preamble before the first verb ("מחר בשעה 2 לקחת...")
    // is not inside this segment's text — fall back to it so the time isn't lost.
    const resolvedTime = time.fromText
      ? time
      : (fbTime && fbTime.fromText ? fbTime : time);

    // Beta: keep the spoken text intact. time.match was already excluded (it
    // left dangling "בשעה"/"ב" prepositions); now resolvedDate.match is also
    // excluded so date words ("מחר", "היום") stay in the title verbatim. Only
    // the assignee doer-name is stripped. Time/date are no longer auto-applied.
    const title = cleanTitle(text, [assignee.match], config);
    // No explicit time → leave it empty. We never invent a clock time from a
    // vague part-of-day (or from nothing); the task stays "ללא שעה".
    const mins  = resolvedTime.mins !== null
      ? Math.max(0, Math.min(resolvedTime.mins, 23 * 60 + 59))
      : null;

    Log.info('title', title);
    Log.info('mins', mins + ' (' + Math.floor(mins/60) + ':' + String(mins%60).padStart(2,'0') + ')');
    Log.info('type', type);
    Log.info('date', resolvedDate.fromText ? 'from text' : 'default');

    const parsed = {
      title,
      mins,
      date:             resolvedDate,
      assignedTo:       assignee.id,
      type,
      timeFromText:     resolvedTime.fromText,
      dateFromText:     resolvedDate.fromText,
      assigneeFromText: assignee.fromText,
      rawInput:         text,
    };
    parsed.confidence = calcConfidence(parsed);

    Log.groupEnd();
    return parsed;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * HebrewParser.parse(text, opts?) → ParsedTask[]
   *
   * opts.now     — Date override (useful for testing)
   * opts.people  — family member list from app's FAMILY + I18N
   * opts.lang    — 'he' | 'en' | ... (defaults to 'he')
   */
  function parse(text, opts) {
    const now    = (opts && opts.now)    || new Date();
    const people = (opts && opts.people) || DEFAULT_PEOPLE;
    const lang   = (opts && opts.lang)   || 'he';
    const config = getLangConfig(lang);

    if (!text || !text.trim()) return [];

    Log.group('parse');
    Log.info('input', text);
    Log.info('lang', lang);

    const segments = freeSpeechToIntentSegments(text.trim(), { now, people, lang, config });
    const result   = segments.map(seg =>
      parseSegment(seg.text, now, people, { fallbackDate: seg.preambleDate, fallbackTime: seg.preambleTime, config })
    );

    Log.info('result', result.map(r => ({
      title:      r.title,
      mins:       r.mins,
      assignedTo: r.assignedTo,
      confidence: r.confidence.toFixed(2),
    })));
    Log.groupEnd();

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI PARSER  (async — calls /api/parse-tasks serverless function)
  // Falls back to the local rule-based parser on any network / API error.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * parseTasksWithAI(text, opts?) → Promise<ApiResult>
   *
   * opts.now  — Date override
   * opts.lang — 'he' | 'en' (default 'he')
   */
  async function parseTasksWithAI(text, opts) {
    const now  = (opts && opts.now)  || new Date();
    const lang = (opts && opts.lang) || 'he';
    const date = now.toISOString().split('T')[0];  // YYYY-MM-DD
    const time = now.toTimeString().slice(0, 5);   // HH:MM

    const base = (typeof window !== 'undefined' && window.Capacitor)
      ? 'https://family-app-roan.vercel.app'
      : '';
    // Bound the wait: if the network/LLM is slow, abort and let the caller
    // fall back to the instant local parser instead of hanging.
    const ctrl = new AbortController();
    const to   = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try {
      res = await fetch(base + '/api/parse-tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transcript: text, lang, date, time }),
        signal:  ctrl.signal,
      });
    } finally {
      clearTimeout(to);
    }

    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
    // Returns: { tasks, needsReview, uncertainParts, source: 'ai', fallback: false }
  }

  /**
   * parseTasksLocal(text, opts?) → ApiResult
   *
   * Wraps the synchronous rule-based parser into the canonical output shape.
   * Always needsReview=true — the local parser is not reliable enough to skip review.
   *
   * Canonical task shape: { title, time, date, assignee }
   *   time   — "HH:MM" string or null
   *   date   — "today" | "tomorrow" | "YYYY-MM-DD" | null
   *   assignee — "mom" | "dad" | "dudi" | "yonatan" | null
   */
  function parseTasksLocal(text, opts) {
    const now      = (opts && opts.now) || new Date();
    const todayStr = now.toISOString().split('T')[0];
    const raw      = parse(text, opts);

    const CONFIDENCE_THRESHOLD = 0.7;
    const uncertainParts = [];

    const tasks = raw.map(function (r) {
      // Date → relative label
      let dateLabel = null;
      if (r.date && r.date.date) {
        const d = r.date.date.toISOString().split('T')[0];
        if (d === todayStr) {
          dateLabel = 'today';
        } else {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          dateLabel = d === tomorrow.toISOString().split('T')[0] ? 'tomorrow' : d;
        }
      }

      // mins → "HH:MM" string
      var timeStr = null;
      if (r.timeFromText && typeof r.mins === 'number') {
        var h = Math.floor(r.mins / 60);
        var m = r.mins % 60;
        timeStr = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      }

      if (r.confidence < CONFIDENCE_THRESHOLD) uncertainParts.push(r.title);

      return {
        title:    r.title,
        time:     timeStr,
        date:     dateLabel,
        assignee: r.assignedTo,   // local parser uses assignedTo; we map it here
      };
    });

    // ── Fallback safety: prefer one conservative task over a lossy split ──────
    // The local parser is a fallback, not the brain. It cannot redistribute a
    // shared topic across split titles, so a split here risks producing a
    // context-losing result ("לבדוק חומר") or a bare verb ("להכין"). When the
    // split looks lossy, collapse back to a single task = the original sentence
    // and flag review, rather than emit a half-split.
    const BARE_TRANSITIVE_VERBS = new Set([
      'להכין','לבדוק','לקנות','לסדר','להביא','לקחת','לעשות','להוציא','לשלוח','לתקן',
      'לארגן','לסיים','להתחיל','לכתוב','לקרוא','לאסוף',
    ]);
    const isBareVerb = t => BARE_TRANSITIVE_VERBS.has(String(t.title || '').trim());
    const wordCount  = t => String(t.title || '').trim().split(/\s+/).filter(Boolean).length;

    const droppedBare = tasks.some(isBareVerb);
    const hasShort    = tasks.length > 1 && tasks.some(t => wordCount(t) < 2);
    const lossySplit  = tasks.length > 1 && (droppedBare || hasShort);

    if (lossySplit) {
      const oneTitle = String(text || '').trim();
      return {
        tasks:          [{ title: oneTitle, time: null, date: null, assignee: null }],
        needsReview:    true,
        uncertainParts: [oneTitle],
        source:         'local',
        fallback:       true,
      };
    }

    // Clean split (or single task): still drop any stray bare-verb task.
    const finalTasks = tasks.filter(t => !isBareVerb(t));

    return {
      tasks:          finalTasks,
      needsReview:    true,
      uncertainParts: uncertainParts,
      source:         'local',
      fallback:       true,
    };
  }

  /**
   * parseTasks(text, opts?) → Promise<ApiResult>
   *
   * Primary entry point for the UI.
   * Tries AI first; falls back to local parser transparently on any error.
   * Result MUST go to Day Preview — never inserted directly into Today.
   *
   * ApiResult shape:
   *   tasks:          { title, time, date, assignee }[]
   *   needsReview:    boolean
   *   uncertainParts: string[]   (task titles that need human review)
   *   source:         "ai" | "local"
   *   fallback:       boolean
   */
  async function parseTasks(text, opts) {
    try {
      return await parseTasksWithAI(text, opts);
    } catch (err) {
      Log.warn('AI parser failed, local fallback', err.message);
      return parseTasksLocal(text, opts);
    }
  }

  global.HebrewParser = {
    parse,           // legacy sync API — raw parser output (used by existing code)
    parseTasks,      // primary async API — canonical output shape
    parseTasksLocal, // exposed for offline/unit testing
  };

})(window);


// ─── Dev console tests (localhost only) ────────────────────────────────────
if (typeof window !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  (function runTests() {
    const NOW    = new Date('2026-05-08T10:00:00');
    const PEOPLE = [
      { id: 'yonatan', names: ['יונתן', 'Yonatan', 'yonatan'] },
      { id: 'dudi',    names: ['דודי',  'Dudi',    'dudi'   ] },
      { id: 'mom',     names: ['אמא',   'Mom',     'mom'    ] },
      { id: 'dad',     names: ['אבא',   'Dad',     'dad'    ] },
    ];
    const opts = { now: NOW, people: PEOPLE, lang: 'he' };

    const ASSIGNEE = [
      { input: 'שי ייקח את יונתן לחוג ביום שלישי', xA: null,      xT: 'יונתן' },
      { input: 'אמא תקנה חלב בערב',               xA: 'mom',     xT: 'חלב',    xM: 19*60 },
      { input: 'אבא יוציא את הילדים ב 13:20',      xA: 'dad',     xT: 'הילדים', xM: 13*60+20 },
      { input: 'דוד יתקשר לסבתא מחר',              xA: null,      xT: 'סבתא' },
      { input: 'יונתן יסדר את החדר אחרי הצהריים',  xA: 'yonatan', xT: 'החדר',   xM: 14*60 },
    ];

    const SEGMENTS = [
      { label: 'free speech',          input: 'אני צריך היום לקנות חלב וביצים בערב להתקשר לאמא מחר בבוקר לשלם חשמל', xN: 3, xT: ['חלב','להתקשר','לשלם'] },
      { label: 'ו split',              input: 'לקנות חלב וביצים ולשלם חשבון חשמל', xN: 2, xT: ['חלב','לשלם'] },
      { label: 'subordinate — no split', input: 'להתקשר לאמא ולבקש שתביא את יונתן', xN: 1, xT: ['להתקשר'] },
      { label: 'name+vav split',       input: 'אמא תקנה חלב ואבא יוציא את הילדים', xN: 2, xT: ['חלב','הילדים'] },
      { label: 'preamble date',        input: 'מחר בבוקר להתקשר לרופא בצהריים לקנות תרופה בערב להכין שיעורים', xN: 3, xDateOffset: 1 },
    ];

    let pass = 0, total = 0;

    console.group('🔍 assignee tests');
    ASSIGNEE.forEach(({ input, xA, xT, xM }) => {
      total++;
      const [r] = window.HebrewParser.parse(input, opts);
      const ok = r.assignedTo === xA && r.title.includes(xT) && (xM === undefined || r.mins === xM);
      if (ok) pass++;
      console.log(ok ? '✅' : '❌', `"${input}"`, '→', r.title, '|', r.assignedTo, '|', r.mins + 'min');
    });
    console.groupEnd();

    console.group('🔍 segmentation tests');
    SEGMENTS.forEach(({ label, input, xN, xT, xDateOffset }) => {
      total++;
      const res = window.HebrewParser.parse(input, opts);
      const okN = res.length === xN;
      const okT = !xT || xT.every((kw, i) => res[i] && res[i].title.includes(kw));
      const okD = xDateOffset === undefined || res.every(r => {
        const exp = new Date(NOW); exp.setDate(exp.getDate() + xDateOffset);
        return r.date.date.toDateString() === exp.toDateString();
      });
      const ok = okN && okT && okD;
      if (ok) pass++;
      console.log(ok ? '✅' : '❌', `[${label}]`, '\n   segments:', res.map(r => `"${r.title}"`));
      if (!okN) console.log('   ← expected', xN, 'segments, got', res.length);
    });
    console.groupEnd();

    console.log(`\n✅ ${pass}/${total} passed`);
  })();
}
