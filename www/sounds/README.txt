Recording sound effects
=======================

Drop two short mp3 files here:

  rec-start.mp3   → plays when recording starts
  rec-stop.mp3    → plays when recording stops

Tips:
  - Keep them very short (0.2–0.6s) and light (< 50KB ideally).
  - mp3 is safest. If you use m4a/ogg/wav, tell Claude to adjust the paths.

These are copied to www/sounds by `npm run sync` and bundled into the
Android APK + served on Vercel automatically. If the files are missing,
the app simply plays no sound (no error).
