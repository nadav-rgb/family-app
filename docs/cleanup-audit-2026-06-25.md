# 🧹 דוח ניקוי קוד — Family App
**תאריך:** 2026-06-25  
**מטרה:** זיהוי קוד/קבצים מתים לקראת סגירה והגשה לחנות. **דוח בלבד — לא נמחק כלום.** נעבור על זה יחד בערב.

## סיכום
| דרגה | משמעות | כמות |
|------|---------|------|
| **1** | חובה למחוק — בטוח, אפס הפניות, לא יפגע | **32** |
| **2** | מומלץ למחוק — סביר שמת, דורש מבט אנושי | **35** |
| **3** | מומלץ לבדוק — עלול לפגוע בלוגיקה, מחיקה מסוכנת | **31** |
| | **סה״כ** | **98** |

> **איך נסרק:** 21 סוכנים מקבילים סרקו את כל הקוד (15 פלחים של app.html בן 21,678 שורות + api/ + parser + service-worker + נכסים + config/www/branches). כל ממצא **אומת ב-grep** על כל הריפו, ועל כל ממצא "דרגה 1" עבר **פס אימות אדוורסרי** שניסה להפריך אותו.

## ⚠️ אזהרות צולבות חשובות (לקרוא לפני מחיקה)
- **www/ הוא תוצר build** (עותק של קבצי השורש, נוצר ע"י `npm run sync`). אל תמחק/תערוך ידנית — נקה את קבצי השורש ואז `npm run sync` מחדש. מומלץ להוסיף את www/ ל-.gitignore.
- כמה כללי CSS **מתים ב-app.html אבל חיים בקבצים אחרים** (`add-task.html`, `www/index.html`). המחיקה היא **רק מ-app.html** — לא למחוק את אותו שם גלובלית. הפריטים האלה (6) מסומנים למטה.
- מחק תמיד מ-app.html (המקור), ואז הרץ `npm run sync` כדי לעדכן את www/. אל תערוך את www/index.html ישירות.

## 🎯 פעולות מהירות מומלצות (batch)
- **קבצי preview ישנים** בשורש: `today-v2-preview.html`, `today-v3-preview.html`, `mockup_home.html`, `font-preview.html`, `_fr_preview.html` — גרסאות ישנות שאיש לא טוען (today-v4 הוא הנוכחי).
- **קבצי scratch/dev** בשורש: `_measure_parse.js`, `_sample.js`, `EMERGENCY-firestore-rollback.DO-NOT-DEPLOY.txt`.
- **9 קבצי `api/test-*.js`** — בדיקות dev שנשלחות לפרודקשן ללא צורך.
- **`design-references/` (~28MB)** — קבצי עיצוב שלא נטענים באפליקציה.
- **`sounds/candidates/`** — הקלטות audition לא בשימוש (רק rec-start/rec-stop בשימוש).
- **`.idea/`** — קונפיג IDE שלא צריך להיות ב-git.
- **ענפים תקועים**: `deploy/today-v4-web` (כבר מוזג), `deploy/backend-only`, `deploy/title-preserve`.


## דרגה 1 — חובה למחוק (בטוח, לא יפגע)  
_32 ממצאים_

> כל פריט כאן אומת: אפס הפניות, אפס סיכון. עדיין — מחק בקבוצות קטנות ובדוק build אחרי.

### `_fr_preview.html`

- **_fr_preview.html** — שורות 1-123 · _dev-test-file_
  - **למה:** Underscore-prefixed scratch/preview page (first-run preview), never loaded by the app.
  - **ראיה:** VERIFIED ZERO REFS. Grep for '_fr_preview' across whole repo: 0 matches. Not referenced by app.html, today-v4-preview.html, service-worker.js, manifest.json, package.json, vercel.json, or capacitor.config.json. Tier 1 confirmed.

### `_measure_parse.js`

- **_measure_parse.js** — שורות 1-35 · _dev-test-file_
  - **למה:** Underscore-prefixed dev measurement scratch script. Not imported by the app or any build step.
  - **ראיה:** VERIFIED ZERO REFS. Grep for '_measure_parse' across whole repo: 0 matches. Not in package.json scripts (only 'sync' script exists), not required/imported anywhere, not in www sync (sync copies only app.html, parser.js, vendor, sounds, assets). Tier 1 confirmed.

### `_sample.js`

- **_sample.js** — שורות 1-46 · _dev-test-file_
  - **למה:** Underscore-prefixed dev sample/scratch script. Not used by app or build. (Note: capacitor.config.json 'ic_stat_icon_config_sample' is an unrelated substring, NOT this file.)
  - **ראיה:** VERIFIED ZERO REFS. Grep for '_sample' across whole repo: single hit capacitor.config.json:18 smallIcon='ic_stat_icon_config_sample' — that is the Android LocalNotifications small-icon resource name, NOT a reference to _sample.js. No import/require/script tag references _sample.js. Tier 1 confirmed.

### `api/parse-tasks.js`

- **mergeTimeDateFragments + isTimeDateOnly + timeFromFragment + dateFromFragment + TIMEDATE_ONLY_RE** — שורות 39-93 · _dormant-block_
  - **למה:** Explicitly self-labeled DORMANT block (comment lines 39-43: 'intentionally NOT called ... Do not call it'). mergeTimeDateFragments is defined once and never invoked; isTimeDateOnly/timeFromFragment/dateFromFragment are called ONLY inside this cluster; TIMEDATE_ONLY_RE is used only by isTimeDateOnly. The whole block (line 39 comment header through line 93) is dead. Removing it cannot affect behavior — the live flow uses applyTemporalOwnership (_lib/temporal.js), which has its own ported copy of this logic.
  - **ראיה:** VERIFIED (adversarial): grep whole repo for all five identifiers. Within parse-tasks.js: mergeTimeDateFragments defined line 74, CALLED 0 times (handler lines 118-223 never invoke it). isTimeDateOnly def 52 -> only line 79 (inside merge). timeFromFragment def 56 -> only line 83. dateFromFragment def 65 -> only line 84. TIMEDATE_ONLY_RE def 50 -> only line 53. The app.html hits (_isTimeDateOnlyTitle:10314, isTimeDateOnlySegment:10595) are DIFFERENT function names — not these. The temporal.js hits (lines 231-246) are a SEPARATE ported copy with its own local definitions, not calls into parse-tasks.js. CONFIRMED dead. extractPreambleAssignee (lines 95-114) is NOT part of this block — it IS called live at line 152 and used at 174-177 — KEEP it. Tier 1 confirmed for the merge cluster only.

### `api/test-model-compare.js`

- **test-model-compare.js** — שורות 1-209 · _dev-test-file_
  - **למה:** Dev-only model-comparison scratch script. Not imported by any live endpoint; standalone node run per its header. Safe to delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — identifier appears only in its own header comment (line 9) plus an internal 'mirrors api/test-parse.js' note (line 26). Zero require()/import references anywhere (app.html, www, parser.js, api/, configs). No package.json script, no CI, no .husky, no vercel route, not referenced from app.html/www. Already in .vercelignore (api/test-*.js). CONFIRMED tier 1 — zero references, zero risk.

### `api/test-regression.js`

- **test-regression.js** — שורות 1-112 · _dev-test-file_
  - **למה:** Dev-only regression script, standalone node run (header: node --env-file=.env.local api/test-regression.js). Not imported anywhere; safe to delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — identifier only in its own header comment (line 3). Zero require/import. No package.json script, no CI/.github, no .husky, no vercel route, not in app.html/www. Already in .vercelignore (api/test-*.js). CONFIRMED tier 1 — zero references, zero risk.

### `api/test-task-postprocess-local.js`

- **test-task-postprocess-local.js** — שורות 1-44 · _dev-test-file_
  - **למה:** Dev-only local unit test for removeUmbrellaOriginalTask. Requires _lib/task-postprocess but is itself imported by nothing. Standalone node script; safe to delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — file requires ./_lib/task-postprocess (line 1, module exists) but NOTHING requires this file. Identifier appears nowhere else in the repo. No package.json script, no CI, no .husky, no vercel route, not in app.html/www. Already in .vercelignore. CONFIRMED tier 1 — zero references, zero risk.

### `api/test-temporal-e2e.js`

- **test-temporal-e2e.js** — שורות 1-65 · _dev-test-file_
  - **למה:** Dev-only end-to-end temporal test, standalone node run per header. Not imported by any live endpoint; safe to delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — identifier only in own header comment (line 5). Zero require/import references from any file. No package.json script, no CI, no .husky, no vercel route, not in app.html/www. Already in .vercelignore. CONFIRMED tier 1 — zero references, zero risk.

### `api/test-temporal-integration.js`

- **test-temporal-integration.js** — שורות 1-77 · _dev-test-file_
  - **למה:** Dev-only integration test; monkeypatches _providers/claude export to stub the network call. Standalone node run; imported by nothing; safe to delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — this file requires ./_providers/claude (line 15) and overwrites claudeMod.parseWithClaude (line 18), but NOTHING requires this file. Identifier appears nowhere else. The parseWithClaude grep hits here are this file consuming the provider, not anything consuming this file. No package.json script, no CI, no vercel route. Already in .vercelignore. CONFIRMED tier 1 — zero references, zero risk.

### `api/test-temporal-local.js`

- **test-temporal-local.js** — שורות 1-133 · _dev-test-file_
  - **למה:** Dev-only local unit test for applyTemporalOwnership. Requires _lib/temporal but is imported by nothing. Standalone node run; safe to delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — file requires ./_lib/temporal (line 17, module exists) but NOTHING requires this file. Identifier only in own header (line 8). No package.json script, no CI, no .husky, no vercel route, not in app.html/www. Already in .vercelignore. CONFIRMED tier 1 — zero references, zero risk.

### `api/test-title-preserve-local.js`

- **test-title-preserve-local.js** — שורות 1-124 · _dev-test-file_
  - **למה:** Dev-only local unit test for restoreTemporalPrefix. Requires _lib/title-preserve but is imported by nothing. Standalone node run; safe to delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — file requires ./_lib/title-preserve (line 16, module exists) but NOTHING requires this file. Identifier appears only in its own header (line 10). No package.json script, no CI, no .husky, no vercel route, not in app.html/www. Already in .vercelignore. CONFIRMED tier 1 — zero references, zero risk.

### `app.html`

- **/* ── Time strip manual button ── */** — שורות 735-736 · _duplicate_
  - **למה:** The exact same CSS section comment is written twice on consecutive lines (735 and 736) before the .ts-manual-btn rule. One is a pure copy-paste duplicate with zero effect on rendering.
  - **ראיה:** VERIFIED tier-1 stands. Read app.html 735-736: both lines are byte-identical comments '/* ── Time strip manual button ── */'; CSS comments have no runtime effect, so deleting one cannot change behavior. Whole-repo grep found the duplicate ALSO at www/index.html:510-511, but that is a separate (Capacitor-bundle) file and irrelevant to this app.html finding — no shared reference. Zero risk; keep tier-1.

- **#firstRunScreen .fr-sep / .fr-join-inp** — שורות 1801-1802 · _dead-css_
  - **למה:** Two leftover helper CSS rules from the OLD device-setup-era first-run design, superseded by the newer .fr-state / .fr-input / .fr-code-box structure (lines 1909+ and HTML at 6360+). Neither class is applied to any HTML element. The actual join-name input uses class="fr-input" (app.html:6421), not .fr-join-inp, and there is no .fr-sep separator element. Pure orphan CSS — removing it cannot affect rendering.
  - **ראיה:** ADVERSARIAL VERIFY CONFIRMED tier-1. Whole-repo grep 'fr-sep|fr-join-inp' = exactly 4 occurrences total: app.html (2: the CSS decls at 1801 + 1802) and www/index.html (2: synced copies at 1531/1532). ZERO class="..." usages, ZERO JS/classList refs, ZERO in today-v4-preview.html / parser.js / api/ / manifest.json / package.json / onclick handlers. First-run HTML at 6360-6432 uses fr-state/fr-card/fr-input/fr-code-box/fr-err/fr-reconnect but never fr-sep or fr-join-inp. Holds as tier-1.

- **SVG portrait sprite block (symbols #p-ima,#p-aba,#p-dudi,#p-yonatan,#hero-dad + all gradient defs bgA-D,skin1-4,hairA-D,shirtA-D,cheekRose,g-skin-h,g-jacket-h)** — שורות 3471-3741 · _dead-css_
  - **למה:** The hidden offscreen <svg> sprite sheet (lines 3472-3741, wrapped by the comment at 3471 'legacy/unused — default avatar is now neutral 👤'). Every <symbol> is defined exactly once and rendered via <use href="#...">/url(#...) NOWHERE. The default avatar is now a neutral 👤 glyph, so none of these portraits are reachable. Safe to delete the whole <svg width=0 height=0> wrapper including the <defs> gradients, which feed only these symbols.
  - **ראיה:** ADVERSARIAL VERIFY — CONFIRMED tier-1. Whole-repo grep: symbol ids p-ima/p-aba/p-dudi/p-yonatan/hero-dad appear ONLY in app.html (3500/3548/3601/3642/3688, each its own definition) and the mirror www/index.html (3177/3225/3278/3319/3365 — same dead block). '<use' element count across the ENTIRE repo = 0 (no matches in app.html, www/index.html, today-v4-preview.html, parser.js, api/, manifest.json, package.json). All 58 gradient-id occurrences (bgA-D/skin1-4/hairA-D/shirtA-D/cheekRose/g-skin-h/g-jacket-h) live within 3475-3697; all 28 url(#…) consumers fall within 3501-3697 — every consumer internal to the sprite. Zero dynamic '#p-'/'#hero' string refs, zero getElementById('hero-dad'). No onclick/JS reference. Zero functional references → MUST DELETE.

- **#splEditBtn ("ערוך ידנית" ghost button)** — שורות 5892-5896 · _dormant-block_
  - **למה:** Dead button in the #s-split screen: rendered with style="display:none" + aria-hidden="true", carries a data-todo="edit-manual" placeholder, and has NO event handler. The wiring code at line 19608 explicitly states '// splEditBtn: data-todo="edit-manual" — no navigation yet', and the preceding comment (5892) self-documents it as a 'dead button ... no handler yet'. It can never do anything; removing it cannot affect behavior. The actual <button> element spans 5893-5896; the proposed 5892-5896 range correctly includes the leading explanatory comment.
  - **ראיה:** ADVERSARIAL VERIFY PASSED — kept tier 1. Repo-wide grep 'splEditBtn|edit-manual' = exactly 6 hits in app.html (and 6 mirror hits in www/index.html build copy): HTML comment(5892), element decl(5893), no-op wiring comment(19608), plus CSS .spl-ghost-btn(3163-3165). ZERO references found via: addEventListener, onclick, getElementById('splEditBtn'), querySelector, or any generic [data-todo] selector — explicitly searched querySelectorAll('[data-todo') and found NO matches, so there is no dynamic/string-built wiring. data-todo is an inert placeholder attribute nothing reads. Identical dead button also in www/index.html:5505-5506. Confirmed zero references, zero risk.

- **sharedWithEmojis** — שורות 7445-7447 · _unused-function_
  - **למה:** Single-line helper that builds an emoji string from visibleTo; never called anywhere. Share UI uses other rendering paths. Dead.
  - **ראיה:** VERIFIED (refutation attempt failed): repo-wide grep 'sharedWithEmojis' = 2 hits total = own def app.html:7445 + mirror def www/index.html:6587. Zero call sites in either file. Not in parser.js, api/, today-v4-preview.html. No onclick= handler and no window[...] dynamic reference. Read of 7443-7451 confirms standalone def. Tier 1 CONFIRMED.

- **_silentPing** — שורות 7867-7874 · _unused-function_
  - **למה:** 0-volume buffer helper that is never invoked. The only other mentions are comments (line 7794 doc and line 8462 'previously called _silentPing()' note in recognition.onend explaining it was removed). The looping _keepAlive buffer (_startKeepAlive) replaced it. Dead.
  - **ראיה:** VERIFIED (refutation attempt failed): repo-wide grep '_silentPing' = 6 hits = app.html {def 7867, comment 7794, comment 8462} + www/index.html mirror {6936, 6877, 7484}. Read of 7867-7891 confirms the live replacement _startKeepAlive/_stopKeepAlive (looping inaudible buffer) is used instead. Zero real call sites. No onclick/window dynamic ref. Tier 1 CONFIRMED.

- **_tone** — שורות 7893-7905 · _unused-function_
  - **למה:** WebAudio tone-synthesis helper that is never called. The synthesized recording tones were rejected in favor of user-provided sound files (_playSfx via _beepStart/_beepStop). Safe to delete — removing it cannot change behavior.
  - **ראיה:** VERIFIED (refutation attempt failed): repo-wide grep '_tone\b' = 2 hits total, both definitions (app.html:7893, www/index.html:6962). Zero call sites. Read of app.html:7893-7937 confirms _beepStart/_beepStop call _playSfx('start'/'stop'), NOT _tone. No matches in parser.js, api/, or today-v4-preview.html. No onclick= or window[...] dynamic reference. Tier 1 CONFIRMED.

- **_note** — שורות 7906-7934 · _unused-function_
  - **למה:** WebAudio 'soft warm note' synth helper (plus its 3-line leading doc comment at 7906-7908) that is never called. Recording chimes now use file-based _playSfx, not synthesized notes. Dead.
  - **ראיה:** VERIFIED (refutation attempt failed): grep '_note\b' app.html = def at 7909 + the 6994/7073/7513 hits which are the UNRELATED i18n key 'share_note' (string 'share_note:' / t('share_note')). Read of 7935-7937 confirms _beepStart/_beepStop use _playSfx, not _note. Zero real call sites. Mirror def www/index.html:6978. Not in parser.js/api/today-v4. No dynamic ref. Tier 1 CONFIRMED.

- **extractTimeFromText** — שורות 9773-9826 · _unused-function_
  - **למה:** Pure read-only helper (its own comment: 'Does NOT modify any task or state — pure function, read-only'). Detects a clock time from Hebrew/numeric text but is never invoked anywhere in the live file. Removing it cannot affect behavior. Include the preceding comment block (lines 9773-9776).
  - **ראיה:** ADVERSARIAL VERIFICATION CONFIRMS TIER-1. Whole-repo grep 'extractTimeFromText' = 2 hits, both DEFINITIONS (app.html:9777, www/index.html:8780). Within app.html, grep 'extractTime|extractTimeFrom' = 1 hit (line 9777, the definition) → ZERO call sites. No dynamic/string-built reference: grep for window[..]/this[..]/['extract'] in app.html = no matches; grep 'onclick=' shows no onclick invokes it. CRITICAL: app.html is the LIVE shipped file — capacitor.config.json server.url = https://family-app-roan.vercel.app/app.html, so this is NOT a dead-duplicate where everything is moot; the function is genuinely dead in the production file. Tier-1 held.

- **SPLIT_MIN_LEN** — שורות 10552-10552 · _dead-css_
  - **למה:** const SPLIT_MIN_LEN = 20; is declared but never read anywhere in the codebase. It is a leftover threshold from the long-press split prototype shell (comment above it at lines 10550-10551 says 'prototype shell ... interaction feel only'); the actual split logic uses mockSplit/sanitizeSegments/SPLIT_TASK_VERBS and never consults this constant. Removing it cannot change behavior.
  - **ראיה:** ADVERSARIAL VERIFY (confirmed tier-1): grep 'SPLIT_MIN_LEN' over whole repo (incl. app.html, www/index.html, today-v4-preview.html, parser.js, api/, manifest.json, package.json) = exactly 2 hits, both pure declarations: app.html:10552 and www/index.html:9446 (mirror copy). Broadened grep 'SPLIT_MIN' (catches any partial/dynamic ref) = same 2 declaration lines, zero other matches. No onclick=/string-built reference. Read of surrounding context (10550-10564) confirms mockSplit() at 10556 does the tokenizing and never reads SPLIT_MIN_LEN. Zero read/call sites, zero risk -> tier-1 CONFIRMED, could not refute. NOTE: the www/index.html:9446 mirror copy lives outside this audit window and should be deleted in tandem.

- **// id offsets: 0=advance, 1=at-time, 2-4=overdue stages 0-2** — שורות 14117-14118 · _duplicate_
  - **למה:** Two byte-identical comment lines back to back inside _capScheduleTask. The second is a pure copy-paste duplicate; deleting one line cannot affect behavior (comments are inert).
  - **ראיה:** Lines 14117 and 14118 are character-for-character identical comments. ADVERSARIAL VERIFY CONFIRMED tier-1: whole-repo grep for the comment text returns exactly 4 lines — app.html:14117 + app.html:14118 (the adjacent pair) and www/index.html:12870 + www/index.html:12871 (the deployed OTA copy carries the same dup). No code references a comment string; comments are inert. Note for human: www/index.html is the Capacitor bundle copy of app.html, so it carries an identical duplicate, but this finding's scope is app.html only and the zero-risk claim holds. Stays tier-1.

- **_ASSIGNEE_TO_MEMBER_ID** — שורות 16746-16751 · _dormant-block_
  - **למה:** Const object mapping legacy assignedTo IDs to memberIds, defined once and never read anywhere. Its own comment notes it is incomplete ('dudi / yonatan intentionally omitted'). Pure dead data — removing it cannot affect behavior since nothing references it.
  - **ראיה:** ADVERSARIAL VERIFY (repo-wide): _ASSIGNEE_TO_MEMBER_ID grep across app.html + www/index.html + parser.js + api/ + manifest.json + package.json + today-v4-preview.html = ONLY the two definitions (app.html:16748, www/index.html:15069). ZERO reads, ZERO dynamic/string-built/onclick references. Confirmed genuinely dead — tier 1 SUSTAINED. NOTE: an identical dead copy also exists in www/index.html:15069 (parallel/built bundle); delete from both files for a clean removal.

- **_ownerCan** — שורות 19775-19783 · _unused-function_
  - **למה:** Self-described 'generic gate so future capabilities can be delegated' helper that wraps _amIOwner(). It is defined exactly once and never called. Removing it cannot change behavior. The 3-line doc comment (19775-19777) belongs to it and goes with it.
  - **ראיה:** ADVERSARIAL RE-VERIFY (whole repo): grep '_ownerCan'/'ownerCan' across app.html + www/index.html → exactly 2 non-comment hits, both definitions (app.html:19783, www/index.html:17626). The ONLY '_ownerCan(' with parens is inside its own doc comment ('_ownerCan('cap')' at 19777/17620). ZERO call sites, no onclick=, no string-built/dynamic ref, not in parser.js/api/manifest/package.json/today-v4-preview.html. The wrapped helper _amIOwner() IS live (real calls at app.html:19825 and 20647) so deleting _ownerCan cannot affect those paths. TIER-1 CONFIRMED — zero references, zero risk.

### `design-references/FINAL - Family App Screens/FINAL_01_משימות_היום.png`

- **design-references/ (entire directory, ~28MB)** — (קובץ שלם) · _unused-asset_
  - **למה:** Design SOURCE mockup screens (the FINAL_xx renders, the 'Family App claude design try' subfolder, and the 'עיצובי אווטאר בינה מלאכותית' AI-avatar concepts). These are reference images for designing the UI, never loaded by the running app. Removing the whole design-references/ tree reclaims ~28MB from the repo before store submission.
  - **ראיה:** VERIFIED (adversarial): Grep of whole repo for 'design-references', 'FINAL_01', 'FINAL_', 'claude design', 'אווטאר בינה' = No matches anywhere (app.html, www/index.html, today-v4-preview.html, parser.js, api/, manifest.json). Also grepped android/ subtree separately = No files found. du -sk design-references = 28272k (~28MB). Tree confirmed: 11 FINAL_xx screens + 'Family App claude design try' (12 faceless variants) + 'עיצובי אווטאר בינה מלאכותית' (4 avatar concepts) — all pure design source, none loaded by code. NOTE: the live confirmation background is the SEPARATE file assets/FINAL_CONFIRMATION_BACKGROUND_APPROVED.png (app.html), NOT these FINAL_xx refs — do not confuse them. Zero references, zero risk → tier 1 upheld.

### `font-preview.html`

- **font-preview.html** — שורות 1-61 · _dev-test-file_
  - **למה:** Dev-only font preview scratch page. Not part of the shipped app shell.
  - **ראיה:** VERIFIED ZERO REFS. Grep for 'font-preview' across whole repo: 0 matches. No src/href, not in SW cache list, manifest, package.json sync, or build output. Tier 1 confirmed.

### `index.html`

- **index.html (root)** — שורות 1-679 · _old-version-file_
  - **למה:** Orphan standalone static mockup titled 'Family — Today' (lang=en, Nunito phone-shell), a precursor to the today-v* previews. Not the app entry point: capacitor server.url, vercel.json rewrite, manifest start_url, service-worker SHELL_FILES, and package.json sync all target app.html. The build artifact www/index.html is generated by copying app.html, not this file.
  - **ראיה:** VERIFIED ZERO REAL REFS. Grep across repo for index.html: only hit is package.json:6 sync script copyFileSync('app.html','www/index.html') — copies app.html, NOT root index.html. Grep for href=/src=/location index.html: 0 matches. Confirmed entry chain: vercel.json rewrites / and /join -> /app.html; manifest start_url=/app.html; capacitor.config server.url=.../app.html; SW SHELL_FILES=['/app.html','/manifest.json','/icon.svg','/parser.js'] (no index.html). PROVED build artifacts are app.html copies: root index.html=21178 bytes (en mockup, title 'Family — Today'), while www/index.html AND android/app/src/main/assets/public/index.html are BOTH 1121156 bytes (synced copy of app.html=1281039), so the served index.html never originates from this root file. Tier 1 confirmed.

### `mockup_home.html`

- **mockup_home.html** — שורות 1-542 · _old-version-file_
  - **למה:** Standalone home-screen mockup superseded by today-v4-preview.html. Nothing loads it.
  - **ראיה:** VERIFIED ZERO REFS. Grep for 'mockup_home' across whole repo: 0 matches (no iframe/src/href/SW/manifest/package.json/vercel/capacitor reference). The only iframe in app.html is line 3914 src='today-v4-preview.html?v=19'. Tier 1 confirmed.

### `parser.js`

- **defaultMins** — שורות 291-299 · _unused-function_
  - **למה:** Helper that computes a default clock time from the current hour. It is dead: parseSegment deliberately sets mins=null when no explicit time is found (parser.js:649-653, comment 'We never invent a clock time from a vague part-of-day (or from nothing); the task stays "ללא שעה"'), the exact opposite of what defaultMins does. The function was orphaned when that policy changed. NOT part of the intentional local-fallback parser path — parseTasksLocal/parse/parseSegment never reference it, so removing it cannot change any output. Includes its '─── Default time ───' comment banner on line 291.
  - **ראיה:** ADVERSARIAL VERIFICATION CONFIRMS TIER 1. Grep 'defaultMins' across whole repo (excl node_modules) = exactly 2 lines: parser.js:292 (own declaration) and www/parser.js:327 (build-synced copy). ZERO call sites. Checked all live load points: app.html:6765 + www/index.html:5910 load parser.js but never call defaultMins (0 matches in both); service-worker.js:30 only caches '/parser.js' as a string path (not a code ref); api/ dir = 0 matches (server path uses separate port api/_lib/temporal.js which does NOT include defaultMins). No dynamic/string-built reference possible (it is a local function inside the IIFE, not exported on window.HebrewParser). Confirmed inside parser.js it appears only once (line 292). Tier 1 upheld — zero references, zero risk.

### `sounds/candidates/boom.mp3`

- **sounds/candidates/*.mp3 (17 audition takes, ~1.8MB total)** — (קובץ שלם) · _unused-asset_
  - **למה:** Audition/scratch sound takes (pop, click, whoosh, whoosh-alt1, whoosh-alt2, reverse-whoosh, swoosh, notification, magic-reveal, success, keyboard, error, riser, shutter, glitch, boom, drone). None is referenced by any code path. The only sounds the app actually plays are sounds/rec-start.mp3 and sounds/rec-stop.mp3. The in-app sound picker (BASE='sounds/candidates/v2/', app.html:21573) loads from a v2/ subdir that does NOT exist on disk and uses entirely different filenames (start-1-feltpiano.mp3 etc.). So these 17 flat candidate files are orphaned regardless.
  - **ראיה:** VERIFIED (adversarial): ls confirms exactly 17 .mp3 flat in sounds/candidates/ and NO v2/ subdir; `find sounds -type d` returns only 'sounds' and 'sounds/candidates' — no v2/v3. Grep whole repo for 'candidates/' = single hit: app.html:21573 `var BASE='sounds/candidates/v2/'` (targets non-existent dir). Grep for 'candidates/boom|candidates/click|candidates/whoosh|...' (all 17 by name) = No matches. Grep for bare filenames 'boom.mp3|drone.mp3|riser.mp3|shutter.mp3|glitch.mp3|magic-reveal.mp3|reverse-whoosh.mp3|whoosh-alt.mp3|swoosh.mp3' = No matches. android/ subtree grep for 'candidates' = No files. The picker's DATA ids (start-1-feltpiano, stop-1-feltpiano, etc.) are different filenames that also don't exist on disk. ~1.8MB total (keyboard 251k, shutter 246k, drone 213k, reverse-whoosh 183k, boom 134k, swoosh 128k, riser 126k, glitch 82k, ...). Zero references, zero risk → tier 1 upheld.

### `today-v2-preview.html`

- **today-v2-preview.html** — שורות 1-662 · _old-version-file_
  - **למה:** Superseded earlier iteration of the Today home; current home is today-v4-preview.html (the only iframe app.html loads).
  - **ראיה:** VERIFIED ZERO REFS. Grep for 'today-v2-preview' across whole repo: 0 matches. Broader grep 'today-v[0-9]' across all .html: single hit app.html:3914 iframe src='today-v4-preview.html?v=19' — only v4 referenced, no v2. Tier 1 confirmed.

### `today-v3-preview.html`

- **today-v3-preview.html** — שורות 1-712 · _old-version-file_
  - **למה:** Superseded prior iteration of the Today home; current home is today-v4-preview.html. Nothing loads v3.
  - **ראיה:** VERIFIED ZERO REFS. Grep for 'today-v3-preview' across whole repo: 0 matches. Broader grep 'today-v[0-9]' across all .html: only app.html:3914 today-v4-preview.html?v=19; no v3 reference. Tier 1 confirmed.


## דרגה 2 — מומלץ למחוק (לבדוק במבט)  
_35 ממצאים_

> סביר שמת. הצצה אנושית מהירה לפני מחיקה.

### `.git/refs/heads/deploy/title-preserve`

- **branch deploy/title-preserve** — (קובץ שלם) · _stale-branch_
  - **למה:** All of its commits are already in master: 'git log --oneline master..deploy/title-preserve' returns 0 commits (0 unmerged). It is 10 ahead / 0 behind only because of fast-forward ancestry, but 0 commits are missing from master, so deleting it loses no history. Its tip (73087b0, 'feat(parser): deterministic title preservation layer') diffs against master identically to deploy/backend-only - the title-preservation work landed on master. Local-only branch (no remote counterpart) -> safe to delete with 'git branch -d'. Tier 2: glance to confirm the parser title-preservation layer is indeed live on master before pruning.
  - **ראיה:** git log --oneline master..deploy/title-preserve -> 0 commits. rev-list --left-right master...deploy/title-preserve -> '10 0' (0 commits unique to branch). git diff master deploy/title-preserve --stat == git diff master deploy/backend-only --stat (same 20 files, 414+/5714-). No origin/deploy/title-preserve in 'git branch -r' (local only).

### `.git/refs/heads/deploy/today-v4-web`

- **branch deploy/today-v4-web** — (קובץ שלם) · _stale-branch_
  - **למה:** Fully merged into master and contributes nothing unique. 'git rev-list --left-right --count master...deploy/today-v4-web' = 0 0 (zero commits on either side - the branch tip is identical to master). It exists both locally and as origin/deploy/today-v4-web. Safe to delete the local and remote branch; the today-v4 web-deploy work is already on master. Tier 2 (not 1) only because it has a remote counterpart a human may want to prune deliberately with 'git push origin --delete'.
  - **ראיה:** git rev-list --left-right --count master...deploy/today-v4-web -> '0 0' (identical to master). Last commit 2026-06-25 'deploy(web): serve today-v4 design from Vercel (preview)' is reachable from master. Present in 'git branch -r' as origin/deploy/today-v4-web.

### `.idea/`

- **.idea/ (JetBrains IDE config, 6 tracked files)** — (קובץ שלם) · _build-artifact_
  - **למה:** JetBrains/IntelliJ per-developer IDE configuration tracked in git: .idea/.gitignore, .idea/caches/deviceStreaming.xml, .idea/family-app.iml, .idea/misc.xml, .idea/modules.xml, .idea/vcs.xml. These are machine/IDE-specific and should not be version-controlled (standard practice is to gitignore the whole .idea/ folder). Removing from tracking and gitignoring has zero effect on the app, the build, or any non-IDE workflow. Kept at tier 2 (not tier 1) only because a human should confirm no teammate relies on shared run configs; here it is a solo prototype so it is safe, but a glance is cheap.
  - **ראיה:** git ls-files .idea/ -> .idea/.gitignore, .idea/caches/deviceStreaming.xml, .idea/family-app.iml, .idea/misc.xml, .idea/modules.xml, .idea/vcs.xml (6 files). .idea/.gitignore itself only ignores /shelf/ and /workspace.xml, so the rest is committed. No code/build references .idea (IDE-only). Not present in .vercelignore/.gitignore as a folder.

### `api/test-baseline-lock.js`

- **test-baseline-lock.js** — שורות 1-226 · _dev-test-file_
  - **למה:** Dev-only regression/baseline script for parse-tasks. Not imported by any live endpoint; runs as a standalone node script (per its own header). Tier 2 (not 1) because it is the canonical parsing-regression lock a human may want to keep in the repo and move out of api/ rather than lose.
  - **ראיה:** VERIFIED (adversarial): grep whole repo (app.html, www/index.html, today-v4-preview.html, parser.js, api/, manifest.json, package.json, configs) — name appears only in its own header comments (lines 13,20,59,60) and one comment reference in root test-parser-local.js:55. Zero require()/import. No package.json scripts, no CI/.github, no .husky, no json/yaml/md config. NOTE: .vercelignore line 1 'api/test-*.js' already excludes it from the Vercel deploy, so the 'ships to prod' angle is moot, but it remains uncalled dev code. Tier unchanged (2).

### `api/test-parse.js`

- **test-parse.js** — שורות 1-380 · _dev-test-file_
  - **למה:** Dev-only parser test harness (largest of the test scripts). Not imported by any live endpoint. Tier 2 because it is a substantial test suite a human may want to relocate out of api/ rather than delete outright.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — only self-references (header line 3) plus a 'mirrors api/test-parse.js' comment in test-model-compare.js:26 (a comment, not an import). No require()/import from any non-test file; no package.json scripts entry; no vercel.json route; no CI/.husky; absent from app.html and www/index.html. Tier unchanged (2).

### `app.html`

- **.zone-heart / .btn-heart / .heart-svg / .heart-pos + @keyframes heartIdle/heartRec** — שורות 204-211 · _dead-css_
  - **למה:** Old voice-screen 'heart' mic-shape skin. The recording screen was redesigned to the rec-skin golden circle (#s-voice.rec-skin .mic-zone). The heart wrap (#wrap-heart) is now an empty div inside the display:none legacy-mic-compat container; switchMode() only toggles off/fade classes and never injects heart markup, so these classes are never applied.
  - **ראיה:** Within app.html: btn-heart/zone-heart/heart-svg appear ONLY in their own CSS rules (lines 204-211); 0 class= attributes; 0 JS injection (classList/className/innerHTML/insertAdjacent/createElement grep with these names = 0 matches repo-wide). wrap-heart (line 3832) is an empty 'mwrap off' div; switchMode (line 8732) only toggles fade-out/off/fade-in. ADVERSARIAL NOTE: these class names DO appear as live class= attributes in OTHER files — add-task.html:245-247 and www/index.html:3461-3463 (the Capacitor bundle copy) — so the CSS is dead in app.html but MUST NOT be removed from those files. Stays tier-2 (human glance recommended).

- **.zone-star / .btn-star + @keyframes starIdle/starRec** — שורות 213-218 · _dead-css_
  - **למה:** Old 'star' mic-shape skin, superseded by rec-skin redesign. wrap-star is an empty hidden div; switchMode never injects star markup. Note .sparkle-c (line 214) IS still present in HTML (line 3833 #sparkleCont) so it was intentionally left out of this finding.
  - **ראיה:** Within app.html: btn-star/zone-star appear only in CSS defs (213,215,218); 0 class= attributes; 0 JS injection repo-wide. wrap-star (line 3833) is empty 'mwrap off' (holds only #sparkleCont). @keyframes starIdle/starRec referenced only by .btn-star. ADVERSARIAL NOTE: btn-star/zone-star are live class= attributes in OTHER files — add-task.html:270-272 and www/index.html:3469-3471 — so dead in app.html only. Stays tier-2.

- **.btn-classic / .btn-classic:active** — שורות 225-226 · _dead-css_
  - **למה:** Old 'classic' round mic-shape skin, superseded by rec-skin. #wrap-classic is an empty hidden div; switchMode never injects classic markup.
  - **ראיה:** Within app.html: btn-classic appears only at its own CSS defs (225,226); 0 class= attributes; 0 JS injection repo-wide. wrap-classic (line 3834) empty 'mwrap off' inside display:none legacy-mic-compat (line 583). ADVERSARIAL NOTE: btn-classic is a live class= attribute in OTHER files — add-task.html:289 and www/index.html:3477 — dead in app.html only. Stays tier-2.

- **.btn-blob + @keyframes blobIdle/blobRec** — שורות 228-231 · _dead-css_
  - **למה:** Old 'blob' mic-shape skin, superseded by rec-skin. #wrap-blob is an empty hidden div; switchMode never injects blob markup.
  - **ראיה:** Within app.html: btn-blob appears only at its own CSS defs (228,231); 0 class= attributes; 0 JS injection repo-wide. wrap-blob (line 3835) empty 'mwrap off' inside display:none legacy-mic-compat (line 583). @keyframes blobIdle/blobRec referenced only by .btn-blob. ADVERSARIAL NOTE: btn-blob is a live class= attribute in OTHER files — add-task.html:303 and www/index.html:3481 — dead in app.html only. Stays tier-2.

- **#firstRunScreen .fr-err (redundant duplicate)** — שורות 1803-1803 · _duplicate_
  - **למה:** Duplicate selector. The same '#firstRunScreen .fr-err' is defined again at line 1923 with identical color/font/min-height plus 'text-align:right'. Since 1923 comes later and is fully equal-or-stronger, the 1803 declaration is dead (always overridden). The .fr-err CLASS itself is still used in HTML (frCreateErr/firstRunErr), so only this redundant first copy at 1803 should go, not the class. Tier 2 because a human should confirm 1923 fully covers it.
  - **ראיה:** VERIFIED (left as tier-2). Grep 'fr-err' in app.html: CSS at 1803 (color #c03020, no text-align) AND 1923 (color #C03020 + text-align:right, otherwise identical); class used in HTML at 6401 (id frCreateErr) and 6432 (id firstRunErr). Later identical-or-stronger rule wins → 1803 is dead-but-harmless. Class stays live.

- **#s-member-profile .mp-color-name** — שורות 2258-2258 · _dead-css_
  - **למה:** Orphaned CSS rule. The selector appears only as its own '{display:none}' declaration and is never applied to any element in HTML or JS. It is a remnant of a member-profile color row where the color name label was removed. Zero behavioral effect either way; safe to delete. Tier 2 so a human can confirm www/index.html (a synced copy) is regenerated from app.html.
  - **ראיה:** VERIFIED (left as tier-2). Whole-repo grep 'mp-color-name' = 2 occurrences: app.html:2258 (CSS decl) and www/index.html:1988 (synced copy of same decl). No class="mp-color-name" usage, no JS reference anywhere.

- **@keyframes bioRing** — שורות 2901-2901 · _dead-css_
  - **למה:** Keyframe animation 'bioRing' is consumed only by the .bio-ring class on the line directly above (2900), and .bio-ring itself is never applied to any HTML element or added by JS. The biometric step in the device-reset screen uses .del-step-num (line 5534), not .bio-ring. Both the keyframe and its sole consumer .bio-ring are dead. Tier 2 because the paired .bio-ring at line 2900 sits just outside the assigned 2901-4350 range and should be removed together.
  - **ראיה:** ADVERSARIAL VERIFY — CONFIRMED tier-2 (no references found, kept at 2 per task rules). Whole-repo grep 'bio-ring|bioRing' (case-insensitive): matches ONLY the CSS defs in app.html (2900 .bio-ring + 2901 @keyframes) and the mirror www/index.html (2585-2586). Zero usages as class attribute, getElementById, querySelector, classList.add/remove/toggle('bio-ring'), className=, or innerHTML string anywhere in the repo. Biometric reset step confirmed to use .del-step-num (app.html:2907-2908 CSS, 5533-5535 markup) not .bio-ring. No dynamic construction found.

- **s-sync "Connected devices" demo card (devModelDad/devModelMom/devModelLaali)** — שורות 4732-4797 · _demo-seed_
  - **למה:** Hidden fake demo card showing 4 mock devices ("הטלפון של חבר 1-4", "Samsung Galaxy S24"/"Samsung Galaxy"). The card div is explicitly marked `display:none` with comment 'Connected devices — hidden for testers (fake demo content)'. None of its content is populated or read by JS. Safe to delete; human should glance because the inner data-avatar-for slots are generic avatar markup.
  - **ראיה:** Comment at line 4732 'hidden for testers (fake demo content)'; card wrapper has style="display:none". IDs devModelDad/devModelMom/devModelLaali grep = 3 total occurrences in app.html, all 3 are these HTML definitions (lines 4751,4764,4777); getElementById('devModel...') = 0 references. (Mirrored identically in www/index.html.)

- **#appr-voices duplicate voice tile data-voice="star" ("הדמות")** — שורות 5162-5167 · _duplicate_
  - **למה:** Hidden duplicate voice-style tile. Inline comment at 5162 states it 'mapped to the same mic mode as לב (heart), so it was a duplicate/fake choice'. Element is style="display:none" aria-hidden, so it cannot be clicked/selected. It is still iterated by querySelectorAll('#appr-voices .tile') in renderAppearance and the click-listener loop, but being display:none it is inert. Safe to delete; tier 2 because a human should confirm removal doesn't affect the radiogroup ordering.
  - **ראיה:** data-voice="star" grep: one tile definition (line 5163) + CSS .v-star at 2775 + an unrelated data-mode="star" at 6488. The tile is consumed only by generic loops at lines 6902 and 6929 (querySelectorAll('#appr-voices .tile')); no JS targets the star tile specifically. _VOICE_TO_MODE maps star→heart (duplicate).

- **s-visibility .vis-task-summary block (visSummaryTitle / visSummaryMeta)** — שורות 5292-5301 · _dormant-block_
  - **למה:** Mini summary card hidden via style="display:none!important" with inline comment 'Task summary mini-card (hidden, replaced by hero)'. Its IDs are never populated by JS — the visHeroCard hero below replaced it. Dead UI markup, safe to remove; tier 2 because the screen itself is live.
  - **ראיה:** Line 5293 div has display:none!important and comment 'hidden, replaced by hero'. grep visSummaryTitle|visSummaryMeta = 2 total occurrences in app.html (the 2 HTML definitions at lines 5298,5299); getElementById('visSummary...') and querySelector('.vis-task-summary') = 0 references.

- **s-visibility hidden vis-divider + 'אל תשלח התראה שוב' vis-opt-row** — שורות 5439-5448 · _dormant-block_
  - **למה:** A divider and an entire option row ('אל תשלח התראה שוב לאחר סימון בוצעה') both hard-hidden via style="display:none!important". The row carries no id and its checkbox is never wired/read by JS. Dead, never-rendered UI; safe to remove.
  - **ראיה:** Lines 5439 (vis-divider) and 5440 (vis-opt-row) both have style="display:none!important". No id on the row or its input; no JS selector targets this row (the live option above it, visOptReminderRow at 5429, is the only one referenced).

- **buildParserPeople** — שורות 7286-7297 · _unused-function_
  - **למה:** Builds a parser people list from FAMILY+I18N; never called. Likely superseded after the parser was moved to the AI path. Lives in the parser-ownership area (memory flags this code as sensitive), so a human should confirm the deterministic parser no longer needs it before deleting.
  - **ראיה:** VERIFIED: repo-wide grep 'buildParserPeople' = 2 hits = own def app.html:7288 + mirror www/index.html:6430. Zero call sites. Not referenced in parser.js (which exposes HebrewParser.parse globally) or api/. No dynamic ref found. Tier 2 retained (parser architecture is a documented sensitive area; human glance warranted).

- **openUserSwitcher** — שורות 7416-7434 · _orphan-screen_
  - **למה:** Opens the DEMO user-switcher drawer (uswBg) but has ZERO call sites — nothing triggers it, so the switcher can never be opened. The drawer DOM (uswBg/uswRows) and closeUserSwitcher/backdrop handler still exist, so this is the dead 'open' half of an orphaned DEMO feature. A human should confirm the user switcher is retired (and decide whether to also remove the drawer markup) before deleting.
  - **ראיה:** VERIFIED: targeted grep 'openUserSwitcher' app.html = exactly 1 hit (own def 7416), zero callers. Not present as a caller in www/index.html (def only) or as an onclick= handler. Not in parser.js/api/today-v4. Tier 2 retained — closeUserSwitcher and the uswBg drawer DOM still exist (uswBg in OVERLAYS escape list + a click handler), so the markup decision needs a human; deletion of just the open() function is low-risk but the orphan-screen scope warrants a glance.

- **parsedToTask** — שורות 7549-7600 · _unused-function_
  - **למה:** Converts a deterministic HebrewParser result into an app task. Superseded by aiParsedToTask (which IS called at 10097/10117/10371). parsedToTask has no real call sites — only comments and a diagnostics string literal mention its name. Tier 2 (not 1) because it sits in the parser pipeline which memory marks as sensitive; confirm the HebrewParser→parsedToTask fallback is truly retired before removing. Includes its leading comment at line 7549.
  - **ראיה:** VERIFIED: grep in app.html — def 7550; lines 7604/7606 are COMMENTS inside aiParsedToTask; line 16616 is a STRING literal in a diagnostics dump ('→ parsedToTask defaultVisibleTo = '+...). All three live HebrewParser result paths (10095/10097, 10115/10117, 10371) map through aiParsedToTask, NOT parsedToTask. Zero actual invocations of parsedToTask. Not in parser.js/api/. Mirror www/index.html same pattern. Tier 2 retained.

- **openStyleDrawer** — שורות 8745-8748 · _unused-function_
  - **למה:** Opens the mic-style drawer (#styleBg) by adding .open. In app.html nothing calls it: vSettingsBtn is wired to goto('s-today') at line 8754, not to this drawer. The #styleBg element and its click/overlay/option handlers stay live (closeStyleDrawer is wired at 8755, drawerOpts handler at 8756, styleBg in OVERLAYS at 20307), so ONLY this opener function is dead — do NOT also remove styleBg/closeStyleDrawer/drawerOpts. Human glance recommended because the style-drawer subsystem is partly live.
  - **ראיה:** Whole-repo grep 'openStyleDrawer' = 3 hits: app.html:8745 (definition, no caller) and www/index.html:7767 (def) + 7776 (caller vSettingsBtn->openStyleDrawer, in the OTHER file). Within app.html, grep 'openStyleDrawer|StyleDrawer|drawerOpts|dopt' confirms openStyleDrawer appears ONLY at its definition (8745/8746) and is never invoked; vSettingsBtn's listener (app.html:8754) instead does goto('s-today'). No onclick= invokes it (grep 'onclick=' over app.html = no openStyleDrawer). No window[..]/string-built dispatch. The www/index.html wiring is the bundled-fallback file, not the live app.html (capacitor server.url=app.html). Tier-2 retained.

- **_attachConfShoppingBtn** — שורות 9842-9854 · _unused-function_
  - **למה:** Adds a 'רשימת קניות מסודרת' shopping button to a confirmation task element. Within app.html it is defined but never called — the sibling helpers _attachDpShoppingBtn and _attachTodayShoppingBtn ARE called, this one is not. A human should glance because the identical function IS live (with callers) in the separate www/index.html bundled-fallback build, so it may have been left in app.html by accident or kept in sync deliberately.
  - **ראיה:** Whole-repo grep '_attachConfShoppingBtn' = 4 hits: app.html:9842 (definition only) and www/index.html:8845 (def) + 8982 + 8997 (callers, in the OTHER file). Within app.html, grep '_attachConfShoppingBtn|_attachDpShoppingBtn|_attachTodayShoppingBtn' = defs at 9828/9842/9856 plus callers ONLY for Dp (10913,10916) and Today (11772,11781) — never Conf. The www/index.html callers are in the bundled-fallback file (webDir=www) which does NOT make the app.html copy live (live file = app.html per capacitor server.url). No dynamic/onclick reference found. Tier-2 retained (no new app.html reference to downgrade further).

- **_weekViewMode** — שורות 11474-11474 · _dormant-block_
  - **למה:** const _weekViewMode = 'cols'; is assigned but never read. The comment above (lines 11471-11473) explains the legacy 'list' week view was removed and only 'cols' remains; the const is a vestige of the old two-mode toggle. The independent localStorage.setItem on the very next line (11475) does the actual force-migration, so the const has no runtime effect. A human should glance to confirm no future read-point is intended and decide whether to keep the explanatory comment.
  - **ראיה:** ADVERSARIAL VERIFY (left at tier-2 per instructions; could not find references to upgrade-or-clear concern): grep '_weekViewMode' over whole repo = exactly 2 hits, both pure declarations: app.html:11474 and www/index.html:10332 (mirror copy). Broadened grep 'weekViewMode|week-mode|family-app-week-mode' = the two const declarations PLUS the localStorage.setItem('family-app-week-mode','cols') WRITE lines (app.html:11475, www/index.html:10333). Those setItem lines are a WRITE that does not read the const, so they are not references to _weekViewMode. Zero read sites anywhere (incl. today-v4-preview.html, parser.js); renderWeek()/_wkTaskRow() hardcode 'cols'. Remains tier-2 (human glance on the explanatory comment). NOTE: www/index.html:10332 mirror copy is outside this audit window and should be deleted in tandem.

- **_wireDiagLongPress (temporary tester diagnostic long-press)** — שורות 12772-12787 · _dormant-block_
  - **למה:** Self-invoking IIFE that wires a touch/mouse long-press (~900ms) on #tTitle to open _showSyncDiag() on ANY build (no dev mode). The leading comment explicitly says: 'Temporary tester diagnostic (diag-2026-06-03) ... Safe/read-only. Remove once the local-mode bug is fixed.' It duplicates diagnostic access that already exists via the dev-only triple-tap (line 12771), the settings dev-status onclick (line 5029), and the ?diag=1 URL path (line 12787). Removing it only drops a tester-only long-press shortcut. A human should confirm the local-mode identity bug is considered closed before deleting (per project memory the local-mode identity area is still tracked).
  - **ראיה:** _wireDiagLongPress appears exactly once (its own IIFE definition at 12775, never called by name). _showSyncDiag (the only thing it triggers) is independently reachable: defined 14729; also invoked at 5029 (settings onclick), 12771 (dev triple-tap), 12787 (?diag=1). So this block is redundant + self-flagged 'Remove once ... fixed'.

- **DataAdapter.readTasks / writeTasks / subscribe (Firestore stubs)** — שורות 14708-14711 · _dormant-block_
  - **למה:** Three no-op stub methods explicitly labeled 'Firestore stubs — implemented in Phase 3' inside the DataAdapter literal whose header comment says 'Phase 1: skeleton only. Nothing in the existing app calls this yet.' The app never went through this API surface: real Firestore writes go through _daWriteTask/_daSoftDeleteTask and reads/subscription through _rtUnsubscribe/_daStartListener. These three methods are pure dead skeleton. Tier 2 (not 1) because they are object methods and a human should confirm intent before removing the reserved API shape.
  - **ראיה:** grep across app.html + www/index.html: 'readTasks'/'writeTasks' appear only at their own definitions (app.html:14709-14710 and the mirror www/index.html:13307-13308) — ZERO call sites. 'subscribe(_onChange)' likewise only at app.html:14711 / www/index.html:13309. No dynamic dispatch: grep 'DataAdapter[' = no matches. The unrelated subscribe( at app.html:13854 is reg.pushManager.subscribe, not DataAdapter.

- **_checkDeviceSetup / _showDeviceSetupScreen / _selectDeviceMember (Device Setup Flow)** — שורות 16708-16734 · _orphan-screen_
  - **למה:** Dead code island for the old blocking 'who uses this device?' setup screen. The only entry point, _checkDeviceSetup(), has ZERO callers anywhere. Inline comments at lines 7346, 14686, 15168 explicitly state device-member identity is now chosen later in the avatar/profile screen and the blocking setup screen is intentionally skipped on boot. _showDeviceSetupScreen() is called only by the dead _checkDeviceSetup() (16713); _selectDeviceMember() is reachable only via the onclick string _showDeviceSetupScreen() emits (16720). The whole trio is unreachable. Tier 2 (not 1) because deleting also leaves the static #deviceSetupScreen HTML (6351) + its dev-preview hide CSS (21340) + .device-setup-* CSS (1799-1814), so a human should remove the cluster together.
  - **ראיה:** ADVERSARIAL VERIFY (repo-wide): _checkDeviceSetup grep across app.html + www/index.html + parser.js + api/ + manifest.json + package.json + today-v4-preview.html = ONLY definitions (app.html:16710, www/index.html:15031). ZERO call sites, ZERO dynamic/string-built/onclick references. _showDeviceSetupScreen referenced only from dead _checkDeviceSetup (16713) + own def (16716). _selectDeviceMember referenced only inside the onclick string it emits (16720) + own def (16728). Broad grep 'DeviceSetup|deviceSetup|device-setup|selectDeviceMember' confirms no other callers — only the trio, the static element/CSS, and explanatory comments confirming the screen is intentionally skipped. NOTE: identical dead trio also exists in www/index.html (15031-15066) — parallel/built copy; remove from both. Tier 2 unchanged.

- **renderSplitScreen** — שורות 19016-19035 · _orphan-screen_
  - **למה:** Populates the #s-split full-screen splitter. Never called: there is no goto('s-split') and no renderSplitScreen() call in the real flow. The shipped split feature uses the openSplitSheet bottom-sheet (def app.html:10681) and openConfTools/#ctoolsBg instead. #s-split is reachable ONLY via the test hash '#s-split' in designScreenRouter (19338). Dead together with the #s-split screen HTML (5806) + CSS (3100+); a human should remove the screen as a unit.
  - **ראיה:** VERIFIED: grep 'renderSplitScreen(' whole repo → only def 19017 (+ www copy 17143) and doc comment 19016; ZERO call sites. grep 'goto('s-split'/goto('s-split → ZERO. designScreenRouter (19328) reaches '#s-split' only via the literal test hash 19338 and calls goto(screenId) DIRECTLY — it never invokes renderSplitScreen(), so even the test route renders the screen unpopulated. 'openSplitSheet' is the live splitter. Tier 2 unchanged.

- **splitSave** — שורות 19038-19067 · _orphan-screen_
  - **למה:** Commits the #s-split choice. Wired ONLY to #splSaveBtn, which lives exclusively inside the orphan #s-split screen (HTML at 5888). Since that screen is never entered in the real flow, splitSave is dead together with renderSplitScreen.
  - **ראיה:** VERIFIED: grep 'splitSave' whole repo → def 19038, plus only the #splSaveBtn click handler (19604-19605) inside the dead #s-split wiring block (+ www mirror 17164/17467). #splSaveBtn id appears only at 5888 (inside #s-split) and 19602-19604. No live entry point reaches it (no goto('s-split') anywhere). Tier 2 unchanged.

### `assets/recording-bg.png`

- **assets/recording-bg.png (~1.4MB)** — (קובץ שלם) · _unused-asset_
  - **למה:** Unreferenced background image, ~1.4MB. Superseded earlier copy of the recording-screen background — the LIVE recording background is assets/morning-desk.png (img.rec-bg at app.html:3763). recording-bg.png is never loaded. Tier 2 (human glance) because it is byte-identical to the live morning-desk.png, so a quick confirmation it isn't swapped in via build/config is warranted before deleting.
  - **ראיה:** VERIFIED (adversarial, kept tier 2): Grep for 'recording-bg' across whole repo (app.html, www/index.html, today-v4-preview.html, parser.js, api/, manifest.json) = No matches; android/ subtree = No files. By contrast 'morning-desk' IS referenced at app.html:3763 (<img class="rec-bg" src="assets/morning-desk.png">). CONFIRMED md5sum: recording-bg.png and morning-desk.png are byte-identical (1b1b98958741da7a6fbade6b43219ba3, both 1431983 bytes) — recording-bg.png is a pure duplicate of the live file under a stale name. Left at tier 2 per original author (no upgrade attempted; downgrade not warranted since zero references). Other assets/ PNGs are referenced and KEEP: welcome-hero.png, create-family-hero.png, join-family-hero.png, FINAL_CONFIRMATION_BACKGROUND_APPROVED.png, 'Time and Date Background.png', morning-desk.png, table-bg.png.

### `design-reference-today.png`

- **design-reference-today.png** — (קובץ שלם) · _unused-asset_
  - **למה:** 1.3MB design reference image not shipped in the app. Looks like a design comp kept for reference; likely safe to delete for store cleanup but a human should confirm it isn't a wanted design artifact.
  - **ראיה:** Grep for 'design-reference-today' across whole repo: 0 matches. No <img src>, CSS url(), SW cache entry, or build-sync reference. Not copied into www by package.json sync (sync only copies app.html, parser.js, vendor, sounds, assets dirs). Left as tier 2 (human should confirm it's not a wanted design comp).

### `parser.js`

- **runTests (dev console self-tests, localhost-only IIFE)** — שורות 880-940 · _dev-test-file_
  - **למה:** Self-invoking test block (ASSIGNEE + SEGMENTS suites) that runs only when location.hostname is 'localhost' or '127.0.0.1' (guard on lines 881-882). It never executes in production (Capacitor/Vercel hostnames) and is pure dev scratch tooling. A separate, maintained Node regression suite already exists at test-parser-local.js, so this inline block is redundant dead weight for a store build. Tier 2 (not 1) because a human may still rely on it as a quick in-browser sanity check during local dev; harmless if kept but a clean deletion candidate before submission.
  - **ראיה:** VERIFICATION CONFIRMS TIER 2 (left as-is). Grep 'runTests' across whole repo = exactly 2 lines: parser.js:883 and www/parser.js:817 (build-synced copy) — both are the self-invoking declaration itself, ZERO external callers. The block is gated behind hostname==='localhost'||'127.0.0.1' (lines 881-882). Inner vars runTests/ASSIGNEE/SEGMENTS/PEOPLE are local to the IIFE and referenced nowhere else. The only 'ASSIGNEE' hit in app.html (line 16748 _ASSIGNEE_TO_MEMBER_ID) is an unrelated constant, NOT a reference to the parser test array (substring coincidence). No dynamic access (HebrewParser[..]/HP[..]) exists = 0 matches. test-parser-local.js:10 sets location.hostname='node' specifically to SKIP this self-test block, and provides equivalent coverage via HP.parseTasksLocal. www/parser.js carries identical copy (build artifact). Tier 2 retained.

### `test-parser-local.js`

- **test-parser-local.js** — שורות 1-69 · _dev-test-file_
  - **למה:** Local node-only parser test harness ('node test-parser-local.js'). Not wired into package.json test script or any CI; safe to remove but a human may want to keep it for local parser regression checks.
  - **ראיה:** Grep for 'test-parser-local' across whole repo: only self-reference at its own line 4 header comment ('Run: node test-parser-local.js'). package.json has only a 'sync' script — no 'test' script references it; not imported anywhere. Left as tier 2 (dev regression harness a human may want to keep).

### `today-v4-preview.html`

- **.frame image-slot / .frame image-slot::part(frame)** — שורות 271-272 · _dead-css_
  - **למה:** CSS rules style a custom element <image-slot> that never appears in the markup. The arch frames use <img class="slot-img"> instead (lines 636-646, and the JS rebuild at line 942 also emits <img class="slot-img">). ::part(frame) only matches a shadow-DOM web component which does not exist here. Leftover from an earlier avatar-component approach.
  - **ראיה:** grep '<image-slot' = 0 occurrences repo-wide; grep 'image-slot' = 6 occurrences, all CSS selectors (lines 271-272,320-321,446-447); markup uses class slot-img only. Removing changes nothing visually.

- **.nt-photo image-slot / .nt-photo image-slot::part(frame)** — שורות 320-321 · _dead-css_
  - **למה:** Same as the .frame image-slot rules: targets a non-existent <image-slot> custom element. The hero photo is an <img class="slot-img"> (line 651). Dead selector.
  - **ראיה:** grep '<image-slot' = 0 occurrences; the nt-photo markup at line 651 is '<div class="nt-photo"><img class="slot-img" ...>' — no image-slot element ever created in markup or JS.

- **.task .av image-slot / .task .av image-slot::part(frame)** — שורות 446-447 · _dead-css_
  - **למה:** Same dead <image-slot> pattern. Task-row avatars are built in _avMarkup() (lines 846-854) as '<span class="av"><img class="slot-img" ...>' — never an image-slot element. Dead selector.
  - **ראיה:** grep '<image-slot' = 0 occurrences; _avMarkup at lines 848/851 emits class="av"/class="av-mini" with <img class="slot-img">, no image-slot. ::part has no shadow host to match.

### `www/`

- **www/ (27 tracked files)** — (קובץ שלם) · _build-artifact_
  - **למה:** www/ is a pure build artifact. package.json script 'sync' regenerates it on every build: it copies app.html->www/index.html, parser.js->www/parser.js, and cpSync's vendor/, sounds/, assets/ into www/, then runs 'npx cap sync android'. All 27 tracked files are byte-duplicates of root sources (www/index.html=app.html, www/parser.js=parser.js, www/sounds/=sounds/, www/assets/=assets/, www/vendor/=vendor/). Committing it bloats the repo (~1.2MB on disk, the index.html alone is ~1.1MB) and the committed copy is already stale vs root (app.html is 1281039 bytes / Jun 25; www/index.html is 1121156 bytes / Jun 22). Recommend adding 'www/' to .gitignore and regenerating via 'npm run sync' instead of committing. Housekeeping only - does not affect app behavior since the real Android bundle is regenerated at build time.
  - **ראיה:** git ls-files www/ -> 27 files. package.json scripts.sync copies app.html/parser.js/vendor/sounds/assets into www/ then 'npx cap sync android'. .gitignore (8 lines) does NOT list www/. Root app.html=1281039B Jun25 vs www/index.html=1121156B Jun22 -> committed copy already stale. No source references www/ as input (it is output only).


## דרגה 3 — מומלץ לבדוק (עלול לפגוע בלוגיקה)  
_31 ממצאים_

> מחיקה מסוכנת — לבדוק היטב/לבדוק בזמן ריצה לפני נגיעה.

### `.git/refs/heads/deploy/backend-only`

- **branch deploy/backend-only** — (קובץ שלם) · _stale-branch_
  - **למה:** Has exactly 1 commit not in master: cf5b51a 'feat(parser): deterministic title preservation layer'. However this is the SAME logical change as deploy/title-preserve's tip (73087b0) - both branches produce an IDENTICAL diff against master (same 20 files, +414/-5714), meaning the title-preservation work is effectively already on master and these two SHAs are duplicate/parallel commits of one feature. Tier 3 (not 2) because there IS one commit technically absent from master's history, so a human should confirm cf5b51a contains nothing master is missing before deleting (use 'git branch -d', which refuses if truly unmerged, or cherry-check the diff). Local-only branch, no remote.
  - **ראיה:** git log --oneline master..deploy/backend-only -> 1 commit (cf5b51a). git diff master deploy/backend-only --stat == git diff master deploy/title-preserve --stat (identical: 20 files, 414 insertions / 5714 deletions, incl. parser.js 172 lines, drops today-v4-preview.html + photo.jpeg). SHAs cf5b51a vs 73087b0 differ but same content. No origin counterpart (local only).

### `.git/refs/heads/night-run-2026-06-05`

- **branch night-run-2026-06-05** — (קובץ שלם) · _stale-branch_
  - **למה:** Carries real unmerged history: 28 commits exist on this branch that are NOT in master (12 ahead-of-divergence on master side, 28 on branch side). Per project memory this branch holds today-v4/1.5.0, the UX batch (s-unfinished screen), Phase 3 split/merge, and the recording redesign that were never pushed to master. DELETING THIS LOSES WORK. Do not prune until each of those 28 commits is confirmed landed or intentionally abandoned. Also has a remote counterpart origin/night-run-2026-06-05. Tier 3 - keep / requires explicit human decision per commit, not a housekeeping delete.
  - **ראיה:** git log --oneline master..night-run-2026-06-05 -> 28 commits. rev-list --left-right --count master...night-run-2026-06-05 -> '12 28'. Last commit 2026-06-22 'parser(reconcile): adopt AI re-split...'. Present as origin/night-run-2026-06-05 in 'git branch -r'. Project memory: night-run carries today-v4/1.5.0 + UX batch not on master.

### `EMERGENCY-firestore-rollback.DO-NOT-DEPLOY.txt`

- **EMERGENCY-firestore-rollback.DO-NOT-DEPLOY.txt** — שורות 1-27 · _other_
  - **למה:** Permissive Firestore security-rules rollback (allow read,write: if true) kept as a deliberate manual CLI emergency fallback. Not auto-loaded by any config, but it is an intentional safety/security artifact — deletion removes a documented incident-recovery path. Keep unless the team explicitly retires it.
  - **ראיה:** Grep for 'EMERGENCY'/'firestore-rollback' across repo: only self-reference (its own line 4 header comment). No firebase.json or firebase.rollback.json points at it. firebase.json exists separately and references firestore.rules (the live rules). Documented manual fallback used by temporarily repointing firebase config. Left as tier 3 (intentional security/recovery artifact).

### `api/_providers/claude.js`

- **parseWithClaude (whole module)** — שורות 1-162 · _dormant-block_
  - **למה:** Alternate AI provider. Production runs AI_PROVIDER=openai so this path is not exercised in prod, BUT it is wired in and selected dynamically by env: parse-tasks.js line 8 'process.env.AI_PROVIDER || claude' (default IS claude), and parseWithClaude is actually called at lines 140 and 159 whenever PROVIDER !== 'openai'. Deleting it would break any deploy that does not set AI_PROVIDER. FLAG ONLY - do not delete.
  - **ראיה:** VERIFIED (adversarial): grep whole repo — required at parse-tasks.js:1, called at lines 140 & 159 (env-driven, default branch resolves to claude per line 8); module.exports at claude.js:162. Also stubbed by test-temporal-integration.js:15-18 (a test). Selection is dynamic/env-built. CONFIRMED tier 3 — live load-bearing fallback, NOT safe to delete.

### `app.html`

- **.mic-aura / .mic-particles (+ #micZone.rec/.processing variants)** — שורות 184-202 · _dead-css_
  - **למה:** Ambient halo + particle ring for the OLD voice mic (#micZone). The recording redesign (rec-skin) drives the golden mic via JS recMicPulse and a separate .vtp-orb/.vtp-particles processing visual; no element carrying .mic-aura/.mic-particles exists in app.html and nothing injects them. Marked tier 3 because #micZone is still live infrastructure and these could plausibly be injected by JS paths not fully traced, so a human must confirm before removal.
  - **ראיה:** Within app.html: mic-aura/mic-particles appear only in CSS (lines 185-201). #micZone exists and is heavily used by JS, but no app.html element or innerHTML carries class 'mic-aura'/'mic-particles' (class= grep = 0 in app.html; JS-injection grep = 0 repo-wide). auraBreath/auraSpin keyframes are ALSO used by live .vtp-orb/.vtp-particles (lines 328,330) → those keyframes must be KEPT; only .mic-aura/.mic-particles selectors are candidates. ADVERSARIAL NOTE: mic-aura/mic-particles ARE live class= attributes in www/index.html:3458-3459 (Capacitor bundle copy with #micAura/#micParticles markup), so the CSS is dead in app.html only and must remain in www/index.html. Stays tier-3 (risky / dynamic infra).

- **#dbgOverlay / #dbgHead / #dbgLog / .dbg-g / .dbg-i / .dbg-w / .dbg-ts (mobile debug overlay CSS)** — שורות 1527-1534 · _debug-logging_
  - **למה:** CSS for the mobile debug overlay shown when ?debug=1 or window.APP_DEBUG=true. Dev-only, but actively referenced: the overlay DOM is built at 6802-6808 and AppLog.group/info/warn push styled rows using these classes (6829-6832). Deleting the CSS would unstyle a still-functional debug feature. RISKY — remove only together with its JS, not as standalone CSS.
  - **ראיה:** VERIFIED (left as tier-3). Grep 'dbgOverlay|dbgHead|dbgLog|dbg-g|dbg-i|dbg-w|dbg-ts' in app.html: CSS 1527-1534; JS builds overlay wrap.id='dbgOverlay' 6802, innerHTML uses dbgHead/dbgLog 6804-6806, _overlayLog=getElementById('dbgLog') 6808; ts.className='dbg-ts' 6817; AppLog.group/info/warn _overlayPush('dbg-g'/'dbg-i'/'dbg-w',...) 6829/6831/6832. Live references — not dead.

- **#qaBtn / #qaPanel / #qaClose (QA Panel temp CSS)** — שורות 1793-1797 · _debug-logging_
  - **למה:** CSS for a dev-only QA diagnostic panel explicitly marked '/* QA Panel (temp) */'. It looks like a deletion candidate, but the matching HTML (#qaBtn/#qaPanel/#qaClose at 6344-6346) and JS (_qaShow at 16572, _qaHide at 16703, classList add/remove at 16701/16704, plus the debug-gated show at 6836-6837) are still present and wired. Deleting this CSS without also removing that HTML+JS would leave a broken/unstyled panel. RISKY — load-bearing for an existing (if hidden) feature; should be removed as a unit, not piecemeal in this range.
  - **ראיה:** VERIFIED (left as tier-3). Grep 'qaBtn|qaPanel|qaClose|_qaShow|_qaHide' in app.html: CSS 1793-1797; HTML button/panel/close at 6344-6346 (onclick="_qaShow()" / onclick="_qaHide()"); debug-gated show qaBtn.style.display='block' at 6836-6837; _qaShow def 16572; classList.add('open') 16701; _qaHide def 16703; classList.remove('open') 16704. Multiple live references — not zero-ref.

- **#s-time-date .td-options-row / .td-opt-card / .td-opt-body / .td-opt-t / .td-opt-s** — שורות 3224-3230 · _dead-css_
  - **למה:** #s-time-date .td-options-row is force-hidden with display:none!important (3224) and its child option cards (.td-opt-card/.td-opt-body/.td-opt-t/.td-opt-s) style the markup at lines 5726-5743 ('התראה בזמן' / 'חזרה שבועית') which is permanently hidden. The CSS+markup look deprecated (superseded by the td-action-row / reminder section), but the HTML block still exists and JS may reference the option toggles. Tier 3: the matching markup lives OUTSIDE this range (5726-5743) and must be removed in the same pass, and the disable could be a deliberate feature-flag rather than removal — a human must confirm before deleting.
  - **ראיה:** ADVERSARIAL VERIFY — stays tier-3 (selectors DO match live elements, not zero-ref). Whole-repo grep 'td-options-row|td-opt-card|td-opt-body|td-opt-t|td-opt-s': CSS at app.html:3224-3230 + matching force-hidden markup at app.html:5726-5743 (mirror www/index.html:2908-2914 CSS + 5381-5398 markup). .td-options-row carries display:none!important. Removal would require also deleting the out-of-range markup at 5726-5743 → risk confirmed, do not delete in isolation.

- **div.legacy-mic-compat (#wrap-orb,#wrap-heart,#wrap-star,#wrap-classic,#wrap-blob,#sparkleCont)** — שורות 3830-3836 · _dormant-block_
  - **למה:** The 'legacy-mic-compat' container in #s-voice is force-hidden via CSS (#s-voice.rec-skin .legacy-mic-compat{display:none!important} at line 583) and aria-hidden, marked 'legacy'. It looks dead visually, BUT its child ids are still read by live JS — wrapIds map at line 7741 ({orb:'wrap-orb',...}) and getElementById('sparkleCont') at 8715 drive the mic-pulse animation. Deleting the block would make those lookups return null and could throw in the recognizer animation path. Tier 3 / do NOT delete without first removing the JS that references wrapIds and sparkleCont.
  - **ראיה:** ADVERSARIAL VERIFY — stays tier-3, live JS consumers CONFIRMED. Whole-repo grep 'legacy-mic-compat|wrap-orb|wrap-heart|wrap-star|wrap-classic|wrap-blob|sparkleCont': CSS hide at app.html:583; markup at 3830-3836; LIVE JS consumers at app.html:7741 (const wrapIds = { orb:'wrap-orb', heart:'wrap-heart', star:'wrap-star', classic:'wrap-classic', blob:'wrap-blob' }) and 8715 (const sc = document.getElementById('sparkleCont')). Same pattern mirrored in www/index.html (6870/7737) and the separate add-task.html (244-352, its own copy of wrapIds+sparkleCont). Referenced by JS → NOT safe to delete in isolation.

- **#qaBtn / #qaPanel QA diagnostic panel** — שורות 6343-6348 · _dev-test-file_
  - **למה:** Temp diagnostic panel ('QA Panel (temp diagnostic)'). It IS functional but only ever shown when a dev flag is set (?debug=1 / ?diag=1 / window.APP_DEBUG via _devUiEnabled() at 6835-6838); CSS hides #qaBtn by default (1793 display:none). For store cleanup this dev tooling is a removal candidate, but its onclick handlers _qaShow()/_qaHide() (16572/16703) and the gate (6835-6838) live OUTSIDE this range — deleting only the in-range HTML would orphan those references. Needs a coordinated human decision, not a blind in-range delete.
  - **ראיה:** VERIFIED — stays tier 3 (referenced, not orphan). Repo-wide grep '_qaShow|_qaHide|qaBtn|qaPanel|qaContent|qaClose' in app.html → 11 hits: CSS 1793-1797, in-range HTML 6344-6347 (onclick="_qaShow()" at 6344, onclick="_qaHide()" at 6346), dev gate 6836-6837 (un-hides qaBtn), fn defs 16572/16703, body refs 16700-16704. The in-range HTML is wired via inline onclick to out-of-range functions; removing it alone leaves live _qaShow/_qaHide/gate referencing a deleted DOM. Mirror copy in www/index.html. Confirmed risky — correct tier 3.

- **set('vPromptEyebrow', t('voice_eyebrow'))** — שורות 7471-7471 · _dead-css_
  - **למה:** i18n line that targets element id 'vPromptEyebrow', which no longer exists in app.html's DOM (the voice eyebrow was removed; only #vPromptText remains). The set() helper no-ops on a missing element, so the line is harmless but dead. Tier 3 because it lives inside the live _applyLang() function and removal is cosmetic cleanup, not junk removal; the matching id still exists in the older www/index.html build.
  - **ראיה:** VERIFIED: grep 'vPromptEyebrow' app.html = only line 7471 (the set() call); the id is NOT in app.html markup. The id DOES still exist in www/index.html:3445 (older build) — so deleting it from app.html is fine but www/index.html must NOT be blindly mirrored. i18n key voice_eyebrow defined at 6944/7023 (and www 6089/6168) but consumed only by this single set() call. Tier 3 retained (lives inside live _applyLang).

- **console.log('[capLN] reschedule after time edit')** — שורות 11875-11875 · _debug-logging_
  - **למה:** Unconditional trace log emitted on every in-place task-time edit, immediately before _capRescheduleAll(). Pure diagnostics, no behavior. Tier 3 because it matches the file's standing [capLN]/[DA] logging convention used throughout the reminders/notification code; trimming it is a logging-policy decision.
  - **ראיה:** console.log at 11875 inside the tcol time-edit handler in renderToday; paired with [DA] time-edit traces at 11877/11879/11880. Same unconditional-log style as the many [capLN] logs at 14053-14212.

- **console.log/[DA] time edit sync start|success + console.warn on fail (time-edit Firestore trace)** — שורות 11877-11880 · _debug-logging_
  - **למה:** Three trace statements wrapping the _daWriteTask() call after a time edit: a start log (11877), a success log in .then (11879), and a failure warn in .catch (11880). They only narrate the sync; the actual write/error handling does not depend on them (the .catch swallows the error either way). Tier 3 because they follow the file's pervasive [DA] logging convention, so removal is a logging-policy choice, and the .catch must be preserved (only the log call inside it would go).
  - **ראיה:** console.log [DA] time edit sync start at 11877; .then(()=>console.log success) at 11879; .catch(e=>console.warn failed) at 11880. Matches the broader [DA] log family (e.g. 15102 '[FB] task written', 15125/15132 soft-delete traces). Unconditional, no debug gate.

- **console.log('[delete] surgical refresh — no list rebuild (smooth-delete v2)')** — שורות 12065-12065 · _debug-logging_
  - **למה:** Unconditional debug-trace log fired on every Today-screen surgical refresh in _refreshTodayMetadata(). It references an internal milestone ('smooth-delete v2') and adds no user-facing behavior. Tier 3 (not 1/2) because the file uses unconditional console.log as its pervasive operational-logging convention (hundreds of occurrences, plus a permanent build banner at 17263); removing individual logs is low-risk but is a logging-policy decision, not clearly-dead code.
  - **ראיה:** Direct console.log call, single occurrence at 12065 inside _refreshTodayMetadata (defined 12064, called at 12184 and 12220). Matches the file-wide unconditional console.log pattern (e.g. 11875, 12170, 13733+, 14053+). Not gated by any debug flag.

- **console.log('[delete] preview — surgical meta refresh (smooth-delete v2)')** — שורות 12170-12170 · _debug-logging_
  - **למה:** Unconditional debug-trace log in doDelete() for the preview-delete path; internal milestone string, no behavioral effect. Tier 3 for the same reason as the other [delete] log: it conforms to the file's unconditional-logging convention, so removal is a logging-policy call rather than provably-dead code.
  - **ראיה:** Single console.log occurrence at 12170 inside doDelete (defined 12162, called from confirmDelete at 12299). Not behind a debug guard; same convention as 12065 and dozens of other [DA]/[capLN]/[RT] logs.

- **console.log('[reminders] tick ...') in checkOverdueReminders** — שורות 13733-13733 · _debug-logging_
  - **למה:** Per-tick diagnostic console.log fired every 30s by setInterval(checkOverdueReminders) (line 13802). Explicitly self-described as 'Diagnostic: surface everything we evaluate so the user can see in DevTools console' (comment line 13731-13732). Pure logging — removing it cannot change reminder logic. Tier 3 because it is intentionally placed debug instrumentation the author may want to keep for field debugging; a human should confirm before stripping for store submission.
  - **ראיה:** Single console.log at 13733. ADVERSARIAL VERIFY: checkOverdueReminders is LIVE — defined once at 13723, scheduled via setInterval at 13802, and also invoked at startup (17278). Log is pure diagnostics; surrounding if/return reminder logic is unaffected if removed. Stays tier-3 (intentional instrumentation, not stray).

- **per-task console.log diagnostics in checkOverdueReminders** — שורות 13738-13741 · _debug-logging_
  - **למה:** Inside the AppState.tasks.forEach of checkOverdueReminders: console.log of each task's id/title/date/mins plus '→ skipped: ...' traces. Pure DevTools diagnostics that run on every 30s tick for every task; no logic depends on them. Candidate to strip before store submission but intentionally authored, so human review.
  - **ראיה:** console.log lines 13738,13739,13740,13741 (and further at 13765,13772,13779,13787). ADVERSARIAL VERIFY: all are logging-only; the surrounding if/return logic and _fireRealNotification calls are unaffected if the log calls are removed. checkOverdueReminders confirmed live (setInterval 13802 + startup 17278). Stays tier-3.

- **console.log/console.warn diagnostics in _capInit** — שורות 14053-14092 · _debug-logging_
  - **למה:** _capInit logs plugin availability, raw permission result JSON, channel-created, and pending-notification dumps. These are startup diagnostics for Android notification setup; none feed back into logic. Reasonable to remove for production but author-intended instrumentation.
  - **ראיה:** console.log at 14053,14058,14085,14090 and console.warn at 14060 within _capInit (defined 14051). ADVERSARIAL VERIFY: _capInit is LIVE — called at startup line 17283 (_capInit().then(() => _capRescheduleAll())). Only the log statements are dead-weight candidates; the permission/channel/schedule init is real and must stay. Stays tier-3.

- **console.log scheduling diagnostics in _capScheduleTask** — שורות 14143-14147 · _debug-logging_
  - **למה:** Logs 'no future notifications' and a dump of scheduled notification times on every task schedule. Diagnostic-only; the await ln.schedule call is the real work. Removable for store build, human-review.
  - **ראיה:** console.log at 14143 and 14146 inside _capScheduleTask (14095). ADVERSARIAL VERIFY: _capScheduleTask is LIVE — called from _capRescheduleAll (14206) and from newTasks.forEach at 10986. Logic (notifs array build + ln.schedule) is independent of these logs. Stays tier-3.

- **console.log diagnostics in _capRescheduleAll** — שורות 14186-14213 · _debug-logging_
  - **למה:** Multiple console.log calls dumping plugin availability, cancelled count, processed count, and a full pending-notifications dump after reschedule. Pure diagnostics on a function that runs on wake/reschedule. Candidate for production cleanup, intentional instrumentation so tier 3.
  - **ראיה:** console.log at 14186,14194,14209,14212 inside _capRescheduleAll (14184). ADVERSARIAL VERIFY: _capRescheduleAll is HEAVILY LIVE — 20+ call sites across app.html (9597,10475,11798,11876,12039,12047,12183,12213,12366,12373,12564,13460,14364,14470,14631,17283,17736,19679,21428, etc.). The reschedule loop and ln.schedule/cancel calls do not depend on the logs. Stays tier-3.

- **_qaShow / _qaHide (QA Panel temp diagnostic)** — שורות 16571-16705 · _debug-logging_
  - **למה:** ~135-line dev-only diagnostic panel explicitly labeled '// QA Panel (temp diagnostic)'. It dumps internal identity/visibility/notify state to an overlay. The trigger button #qaBtn is display:none in CSS and only un-hidden when _devUiEnabled() is true (lines 6835-6837), so it never appears in production. Strong cleanup candidate before store submission, but kept at tier 3 because it is still wired to a LIVE (dev-gated) onclick handler and reads many live app internals (AppState, DataAdapter, shareTask, resolveMember), so deleting it must be paired with removing the #qaBtn/#qaPanel HTML + the un-hide block (6835-6837) + the #qaBtn CSS (1793) — a human should confirm.
  - **ראיה:** ADVERSARIAL VERIFY (repo-wide): _qaShow referenced at def 16572 + onclick on #qaBtn (6344). _qaHide referenced at def 16703 + onclick on #qaClose (6346). #qaBtn is display:none by default (CSS 1793) and only set to display:block under _devUiEnabled() gate (6835-6837) — confirmed LIVE wiring, NOT fully dead. Identical copies in www/index.html (_qaShow 14893, _qaHide 15024, #qaBtn 5516, #qaClose 5518). Tier 3 SUSTAINED — still reachable in dev mode; not safe to blind-delete.

- **_splChosen / _splitTargetId** — שורות 19011-19014 · _dormant-block_
  - **למה:** Module-level state for the orphan #s-split screen. _splChosen and _splitTargetId are read/written only by renderSplitScreen and splitSave (both dead). They become dead the moment those functions are removed; flagged tier 3 because their lifetime is tied to that screen-removal decision.
  - **ראיה:** VERIFIED: grep '_splChosen' → only 19012(def),19030,19039,19590,19595 (all inside renderSplitScreen/splitSave/dead wiring). grep '_splitTargetId' → only 19014(def),19042,19045,19054 (all inside splitSave). No live consumer outside the orphan split feature. Tier 3 unchanged.

- **#s-split splOpt1/splOpt2/splSaveBtn click wiring** — שורות 19585-19608 · _orphan-screen_
  - **למה:** addEventListener wiring for splOpt1/splOpt2/splSaveBtn and the splEditBtn note. All of these ids exist ONLY inside the orphan #s-split screen, so the listeners never fire in the real flow. Tier 3 because it is interconnected with the screen HTML/CSS/router that live outside this range — should be removed as one unit, not piecemeal.
  - **ראיה:** VERIFIED: grep splOpt1/splOpt2/splSaveBtn/splEditBtn → every id defined only inside #s-split (5847,5859,5888,5893) and referenced only by renderSplitScreen (19031-19034) and this wiring (19586-19608). The screen is reached only via the test hash route at 19338. Tier 3 unchanged.

- **window._vCaptions** — שורות 20183-20185 · _dormant-block_
  - **למה:** Write-only global: set to false at 20183 and reassigned inside setVoiceCaptions at 20185, but its value is never read anywhere. The actual caption toggle works through the '.no-captions' CSS class (toggled at 20187). The variable itself is inert. Tier 3 (not tier 1) only because it is exposed on window, so external/preview code could in theory read it.
  - **ראיה:** VERIFIED: grep '_vCaptions' whole repo → app.html only 20183 (set) + 20185 (set), never read; www/index.html mirrors write-only (18026/18028). The functional path is the '.no-captions' class (CSS 2860; toggled 20187 by setVoiceCaptions, which IS live — called from onclick at 3778/3782). The variable is genuinely inert but stays Tier 3 because it is on window. Tier 3 unchanged.

- **?screen=<id> DEV-ONLY direct-preview <script> block** — שורות 21323-21350 · _dev-test-file_
  - **למה:** A dev-only visual-review hatch that force-shows any .app-screen when the URL contains ?screen=<id>. The IIFE always runs at boot; it is a no-op for real users (guarded by the query param) but it is NOT dead code in the strict sense - it executes every load and reads location.search. It is an internal review tool, not user functionality, so it is a deletion candidate for store submission, but removing it is a judgment call (the team uses it for on-device screen review, same convention as ?previewFirstRun=1). Tier 3 because it runs on every boot and a human should confirm the review workflow is no longer needed before deleting.
  - **ראיה:** Self-contained IIFE at 21329-21350. The token 'screen=' / new URLSearchParams(...).get('screen') appears only here (this block); no other code depends on it. Header comment explicitly labels it DEV-ONLY. Mirrors ?previewFirstRun=1 convention.

- **DEV/TEMP s-share-sheet wiring <script> (openShareSheet/commitAndReturn capture-phase listener)** — שורות 21352-21485 · _dormant-block_
  - **למה:** Header comment says 'DEV/TEMP — local-only wiring of s-share-sheet (REMOVE to disable)' and 'To remove this temporary wiring: delete this entire <script> block.' DESPITE the TEMP label this block is LOAD-BEARING LIVE FUNCTIONALITY: a capture-phase document click listener intercepts the per-task menu in #s-confirmation and the #optsShareVis row, routes them to the s-share-sheet screen via goto(), and commitAndReturn() persists visibleTo/notifyTo to Firestore (_daWriteTask) and reschedules notifications. Deleting it would break the 'מי רואה ומי מקבל התראה' share flow. Reported only because the in-code comment invites deletion; classified Tier 3 = DO NOT DELETE without confirming the share-sheet feature is being retired. The 'TEMP/REMOVE' comment is stale and misleading.
  - **ראיה:** openShareSheet referenced at 21364,21462,21470; commitAndReturn wired to #ssCta at 21482; #ssCta exists (6153) and has its own visibility CSS (6056); #optsShareVis exists (6746) and is referenced at 21466; _ssReturnTo used at 21362,21365,21389,21440,21480. The dev-preview block at 21345 also calls window._ssSyncMembers which this feature relies on. All references are live - functional, not dead.

### `docs/`

- **docs/ (11 markdown files)** — (קובץ שלם) · _other_
  - **למה:** AUDIT RESULT: KEEP - do NOT delete. All 11 files are legitimate planning, QA, and tester-facing documentation, not scratch files: avatar-profile-parity-plan-he.md, family-next-session-recovery-plan-he.md, founder-test-findings-wave2.md, manual-founder-test-runbook-he.md, parsing-test-bank-he.md, parsing-test-bank-tiers-he.md, sound-library-proposal.md, tester-feedback-template.md, tester-instructions-he.md, tester-known-goals.md, tester-ready-qa-checklist.md. The parsing-test-bank files (31KB + 18KB) are substantial reference assets for parser QA. None look like dev scratch. Reported tier 3 / keep so nothing here is removed before store submission.
  - **ראיה:** git ls-files docs/ -> 11 files, all .md, all Hebrew planning/QA/tester docs. Largest are parsing-test-bank-he.md (31812B) and parsing-test-bank-tiers-he.md (18399B) - reference test banks. No file matches a scratch/temp pattern. NOTHING to delete here.

### `package.json`

- **dependencies (all 11)** — שורות 8-21 · _stale-dep_
  - **למה:** AUDIT RESULT: NO unused dependencies found - do NOT delete any. Verified every dependency is referenced: @anthropic-ai/sdk (api/_providers/claude.js:1), @vercel/kv (api/_lib/kv.js:12), openai (api/categorize-shopping.js, summarize-task.js, generate-avatar.js, _providers/openai.js, test-model-compare.js), firebase-admin (api/_lib/fcm.js:11), web-push (api/_lib/push.js:5), and all @capacitor/* + @aparajita/capacitor-biometric-auth are loaded at runtime via window.Capacitor.Plugins in app.html (LocalNotifications app.html:14035, App :17308, SplashScreen :17402/17409/21346, BiometricAuthNative :20222-20223). There are no devDependencies and only one script ('sync'). Reporting as tier 3 / keep-all so nothing here is mistakenly removed before store submission.
  - **ראיה:** grep over api/ + app.html: every dep has >=1 real import/usage. @anthropic-ai/sdk:1 ref; @vercel/kv:1 ref; openai:5 refs; firebase-admin:1 ref; web-push:1 ref; capacitor plugins:7 Plugin lookups in app.html. No devDependencies block exists; scripts has only 'sync'. NOTHING to delete.

### `today-v4-preview.html`

- **.bg-layer { display:none; }** — שורות 87-87 · _dormant-block_
  - **למה:** Intentional no-op: the author retired the old full-height background layer (the photo now lives on .viewport) but kept the empty .bg-layer rule + its <div class="bg-layer"> (line 588) 'to avoid markup churn' per the comment at lines 84-86. Both the rule and the empty div are dead (display:none, no content). Deliberately kept by the author, so tier 3 rather than a delete recommendation.
  - **ראיה:** grep 'bg-layer' = 2 hits only: the display:none rule (87) and the empty <div> (588). No JS references it. Comment at 84-86 documents it as a retired no-op.

- **@media (prefers-reduced-motion: no-preference){ .stage{animation:none} }** — שורות 498-500 · _dormant-block_
  - **למה:** No-op: the .stage selector (definition lines 74-81) declares no animation property anywhere, so overriding it to animation:none does nothing. The only real keyframe animation (skShimmer) is on .v4-skel .sk and is handled by its own reduced-motion rule at line 109. Harmless to remove, but behavioral-adjacent CSS so kept at tier 3.
  - **ראיה:** grep '.stage' = 3 hits: definition (74), this no-op (499), and a JS code-comment (793). grep 'animation:' on .stage scope shows none; .stage has only transform via zoom. No @keyframes references .stage.

- **window.focusFace = focusFace (export line)** — שורות 778-779 · _unused-function_
  - **למה:** focusFace itself is heavily used internally (lines 777,878,897,898,947,969). But the window.* export exists only so the live host app could call it after swapping a real avatar; the host (app.html) never calls focusFace. The export line + its preceding comment are dead external API surface. Conservative tier 3: it is intentional API, removing it is harmless but it is not strictly junk by author intent.
  - **ראיה:** grep 'focusFace' across all .html = matches only inside today-v4-preview.html (8 hits); 0 hits in app.html or www/index.html. The internal forEach(focusFace) calls keep the function itself alive; only the window assignment at 779 has no external consumer.


## 📎 נספח: פריטים עם הפניה חיה בקבצים אחרים (6)
_מחק רק מ-app.html — לא גלובלית:_

- **.mic-aura / .mic-particles (+ #micZone.rec/.processing variants)** (`app.html:184-202`, דרגה 3) — Within app.html: mic-aura/mic-particles appear only in CSS (lines 185-201). #micZone exists and is heavily used by JS, but no app.html element or innerHTML carries class 'mic-aura'/'mic-particles' (class= grep = 0 in app.html; JS-injection grep = 0 repo-wide). auraBreath/auraSpin keyframes are ALSO 

- **.zone-heart / .btn-heart / .heart-svg / .heart-pos + @keyframes heartIdle/heartRec** (`app.html:204-211`, דרגה 2) — Within app.html: btn-heart/zone-heart/heart-svg appear ONLY in their own CSS rules (lines 204-211); 0 class= attributes; 0 JS injection (classList/className/innerHTML/insertAdjacent/createElement grep with these names = 0 matches repo-wide). wrap-heart (line 3832) is an empty 'mwrap off' div; switch

- **.zone-star / .btn-star + @keyframes starIdle/starRec** (`app.html:213-218`, דרגה 2) — Within app.html: btn-star/zone-star appear only in CSS defs (213,215,218); 0 class= attributes; 0 JS injection repo-wide. wrap-star (line 3833) is empty 'mwrap off' (holds only #sparkleCont). @keyframes starIdle/starRec referenced only by .btn-star. ADVERSARIAL NOTE: btn-star/zone-star are live clas

- **.btn-classic / .btn-classic:active** (`app.html:225-226`, דרגה 2) — Within app.html: btn-classic appears only at its own CSS defs (225,226); 0 class= attributes; 0 JS injection repo-wide. wrap-classic (line 3834) empty 'mwrap off' inside display:none legacy-mic-compat (line 583). ADVERSARIAL NOTE: btn-classic is a live class= attribute in OTHER files — add-task.html

- **.btn-blob + @keyframes blobIdle/blobRec** (`app.html:228-231`, דרגה 2) — Within app.html: btn-blob appears only at its own CSS defs (228,231); 0 class= attributes; 0 JS injection repo-wide. wrap-blob (line 3835) empty 'mwrap off' inside display:none legacy-mic-compat (line 583). @keyframes blobIdle/blobRec referenced only by .btn-blob. ADVERSARIAL NOTE: btn-blob is a liv

- **div.legacy-mic-compat (#wrap-orb,#wrap-heart,#wrap-star,#wrap-classic,#wrap-blob,#sparkleCont)** (`app.html:3830-3836`, דרגה 3) — ADVERSARIAL VERIFY — stays tier-3, live JS consumers CONFIRMED. Whole-repo grep 'legacy-mic-compat|wrap-orb|wrap-heart|wrap-star|wrap-classic|wrap-blob|sparkleCont': CSS hide at app.html:583; markup at 3830-3836; LIVE JS consumers at app.html:7741 (const wrapIds = { orb:'wrap-orb', heart:'wrap-heart
