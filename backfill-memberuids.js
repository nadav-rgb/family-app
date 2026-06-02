#!/usr/bin/env node
/**
 * backfill-memberuids.js
 * ----------------------------------------------------------------------------
 * One-time ADMIN backfill for the Firestore security migration (Step B.5).
 *
 * Creates the missing  families/{familyId}/memberUids/{authUid}  marker docs
 * from the authUid already stored on  families/{familyId}/members/{userId}.
 * These markers are what the (not-yet-deployed) Firestore Security Rules will
 * check, because rules can only exists()/get() a path derived from
 * request.auth.uid — they cannot query the authUid field on a member doc.
 *
 * SAFETY MODEL (all enforced in code below):
 *   • DEFAULT MODE IS DRY-RUN. Writes happen only with the explicit --apply flag.
 *   • Writes ONLY to .../memberUids/*. Never touches families, members, or tasks.
 *   • Skips the 4 seed members (member_dad/mom/laali/aharon).
 *   • Skips members without an authUid.
 *   • Skips inactive families unless --include-inactive is given.
 *   • Idempotent: creates only when missing; if a marker already exists and is
 *     identical it is skipped; if it exists but DIFFERS it is reported as a
 *     CONFLICT and left untouched (never overwritten).
 *   • Aborts if the service-account projectId is not family-app-5f8a5.
 *   • Aborts (in --apply) if the planned CREATE count exceeds EXPECTED_MAX_CREATE.
 *   • --apply writes a manifest (backfill-run-<id>.json) listing every created
 *     path, so --rollback can delete exactly those and nothing else.
 *
 * This script does NOT deploy rules and does NOT modify the app.
 *
 * Usage:
 *   node backfill-memberuids.js                 # dry-run, active families only
 *   node backfill-memberuids.js --apply         # write markers, active only
 *   node backfill-memberuids.js --apply --include-inactive
 *   node backfill-memberuids.js --rollback --manifest backfill-run-<id>.json
 * ----------------------------------------------------------------------------
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const EXPECTED_PROJECT_ID  = 'family-app-5f8a5';
const SERVICE_ACCOUNT_PATH  = path.join(__dirname, 'serviceAccount.json'); // gitignored
const SEED_MEMBER_IDS = new Set(['member_dad', 'member_mom', 'member_laali', 'member_aharon']);
const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const EXPECTED_MAX_CREATE = 60; // runaway guard — abort --apply if more than this

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const MODE_APPLY    = args.includes('--apply');
const MODE_ROLLBACK = args.includes('--rollback');
const INCLUDE_INACTIVE = args.includes('--include-inactive');
const MANIFEST_ARG = (() => {
  const i = args.indexOf('--manifest');
  return i >= 0 ? args[i + 1] : null;
})();
const DRY_RUN = !MODE_APPLY && !MODE_ROLLBACK; // default

function die(msg) { console.error('\n❌ ABORT: ' + msg + '\n'); process.exit(1); }

// ── Load firebase-admin + service account ───────────────────────────────────
let admin;
try { admin = require('firebase-admin'); }
catch (_) { die("firebase-admin not installed. Run:  npm i firebase-admin"); }

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  die("service account key not found at " + SERVICE_ACCOUNT_PATH +
      "\n   Firebase Console → Project settings → Service accounts → Generate new private key" +
      "\n   Save it as serviceAccount.json next to this script (it is gitignored).");
}
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
  die("projectId mismatch. Expected '" + EXPECTED_PROJECT_ID +
      "' but key is for '" + serviceAccount.project_id + "'. Refusing to run.");
}
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Helpers ─────────────────────────────────────────────────────────────────
function tsToMillis(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}
function sameMarker(existing, desired) {
  return existing &&
    existing.userId === desired.userId &&
    (existing.role || 'member') === (desired.role || 'member');
}

// ── ROLLBACK ────────────────────────────────────────────────────────────────
async function rollback() {
  if (!MANIFEST_ARG) die("--rollback requires --manifest <backfill-run-*.json>");
  if (!fs.existsSync(MANIFEST_ARG)) die("manifest not found: " + MANIFEST_ARG);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_ARG, 'utf8'));
  const created = Array.isArray(manifest.created) ? manifest.created : [];
  console.log('\n↩️  ROLLBACK — manifest ' + MANIFEST_ARG + ' (' + created.length + ' markers)\n');
  let deleted = 0;
  for (const rec of created) {
    const p = rec.path;
    // safety: only ever delete memberUids paths created by this tool
    if (!/^families\/[^/]+\/memberUids\/[^/]+$/.test(p)) {
      console.log('  SKIP (not a memberUids path): ' + p); continue;
    }
    await db.doc(p).delete();
    deleted++;
    console.log('  deleted ' + p);
  }
  console.log('\n✅ rollback done — ' + deleted + ' marker(s) deleted.\n');
}

// ── BACKFILL (dry-run / apply) ──────────────────────────────────────────────
async function backfill() {
  console.log('\n' + (DRY_RUN ? '[DRY-RUN]' : '[APPLY]') +
              '  project=' + EXPECTED_PROJECT_ID +
              '  active-only=' + (!INCLUDE_INACTIVE) + '\n');

  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const summary = {
    familiesScanned: 0, activeFamilies: 0,
    CREATE: 0, 'SKIP-identical': 0, 'SKIP-seed': 0,
    'SKIP-no-authuid': 0, 'SKIP-family-inactive': 0, CONFLICT: 0,
  };
  const plannedCreates = []; // {path, familyId, authUid, userId, role}

  const families = await db.collection('families').get();
  for (const fam of families.docs) {
    summary.familiesScanned++;
    const members = await fam.ref.collection('members').get();

    // active family? ≥1 non-seed member seen within the window
    const isActive = members.docs.some(m =>
      !SEED_MEMBER_IDS.has(m.id) && tsToMillis(m.data().lastSeenAt) >= cutoff);
    if (isActive) summary.activeFamilies++;
    if (!isActive && !INCLUDE_INACTIVE) {
      summary['SKIP-family-inactive']++;
      console.log('Family ' + fam.id + ' (inactive) → SKIP-family');
      continue;
    }

    console.log('Family ' + fam.id + (isActive ? ' (active)' : ' (inactive,forced)') +
                ': members=' + members.size);
    for (const m of members.docs) {
      const d = m.data() || {};
      if (SEED_MEMBER_IDS.has(m.id)) { summary['SKIP-seed']++; continue; }
      if (!d.authUid)               { summary['SKIP-no-authuid']++; continue; }

      const markerRef = fam.ref.collection('memberUids').doc(d.authUid);
      const desired   = { userId: d.userId || null, role: d.role || 'member' };
      const snap      = await markerRef.get();

      if (!snap.exists) {
        summary.CREATE++;
        plannedCreates.push({
          path: 'families/' + fam.id + '/memberUids/' + d.authUid,
          familyId: fam.id, authUid: d.authUid, userId: desired.userId, role: desired.role,
        });
        console.log('  member ' + (d.userId || '?') + ' authUid=' + d.authUid +
                    ' → CREATE  families/' + fam.id + '/memberUids/' + d.authUid);
      } else if (sameMarker(snap.data(), desired)) {
        summary['SKIP-identical']++;
      } else {
        summary.CONFLICT++;
        console.log('  ⚠️  CONFLICT (left untouched): families/' + fam.id +
                    '/memberUids/' + d.authUid +
                    '  existing=' + JSON.stringify(snap.data()) +
                    '  desired=' + JSON.stringify(desired));
      }
    }
  }

  // ── Summary ──
  console.log('\n──────── SUMMARY ────────');
  console.log('families scanned ........ ' + summary.familiesScanned);
  console.log('active families ......... ' + summary.activeFamilies);
  console.log('CREATE .................. ' + summary.CREATE);
  console.log('SKIP-identical .......... ' + summary['SKIP-identical']);
  console.log('SKIP-seed ............... ' + summary['SKIP-seed']);
  console.log('SKIP-no-authuid ......... ' + summary['SKIP-no-authuid']);
  console.log('SKIP-family-inactive .... ' + summary['SKIP-family-inactive']);
  console.log('CONFLICT ................ ' + summary.CONFLICT);

  if (DRY_RUN) {
    console.log('\n(no data written — dry run)\n');
    return;
  }

  // ── Apply guards ──
  if (summary.CONFLICT > 0) {
    die("CONFLICT > 0 — refusing to write. Investigate the conflicting markers first.");
  }
  if (summary.CREATE > EXPECTED_MAX_CREATE) {
    die("CREATE (" + summary.CREATE + ") exceeds EXPECTED_MAX_CREATE (" +
        EXPECTED_MAX_CREATE + "). Refusing to write — looks unexpected.");
  }
  if (summary.CREATE === 0) {
    console.log('\n✅ nothing to create — already up to date.\n');
    return;
  }

  // ── Write (batched) ──
  console.log('\n✍️  writing ' + summary.CREATE + ' marker(s)…');
  const ts = admin.firestore.FieldValue.serverTimestamp();
  let batch = db.batch(), n = 0;
  for (const rec of plannedCreates) {
    batch.set(db.doc(rec.path),
      { userId: rec.userId, role: rec.role, linkedAt: ts, source: 'admin-backfill' },
      { merge: true });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();

  // ── Manifest (for rollback) ──
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = path.join(__dirname, 'backfill-run-' + runId + '.json');
  fs.writeFileSync(manifestPath, JSON.stringify(
    { runId, when: new Date().toISOString(), project: EXPECTED_PROJECT_ID,
      includeInactive: INCLUDE_INACTIVE, created: plannedCreates }, null, 2));
  console.log('✅ wrote ' + summary.CREATE + ' marker(s).');
  console.log('🧾 manifest: ' + manifestPath + '  (use with --rollback)\n');
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (MODE_ROLLBACK) await rollback();
    else await backfill();
    process.exit(0);
  } catch (e) {
    console.error('\n❌ ERROR:', e && (e.stack || e.message || e));
    process.exit(1);
  }
})();
