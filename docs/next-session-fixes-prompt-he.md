# פרומפט לצ'אט חדש — תיקוני Family App

> הדבק את כל מה שמתחת לקו לצ'אט חדש. הוא עצמאי (כולל הקשר, שורשי-בעיה ומיקומי-קוד שכבר נחקרו).

---

אני עובד על אפליקציית **Family** (אפליקציית משימות משפחתית, עברית RTL). יש לי 6 בעיות לטפל בהן. כבר בוצעה חקירה ראשונית — אני נותן לך את שורשי-הבעיה ומיקומי-הקוד; אמת אותם, ואז תקן בזהירות.

## הקשר פרויקט (חובה לקרוא)
- **מיקום:** `C:\Users\LENOVO\Applications Development\Family App\family-app`
- **ארכיטקטורה:** מעטפת Capacitor אנדרואיד שטוענת `app.html` (~21K שורות, HTML+CSS+JS inline) מ-`server.url = https://family-app-roan.vercel.app/app.html`. מסך הבית הוא **iframe** ל-`today-v4-preview.html` (cache-buster `?v=NN` ב-app.html:3620 — **חובה להעלות אותו** כשעורכים את ה-iframe).
- **Deploy:** `git push` ל-master → Vercel auto-deploy → OTA לכל המשתמשים. **שינויי web בלבד דרך push.** שינויי **native** (הרשאות/אייקונים/build.gradle) דורשים build חדש + `adb install`.
- **כלים:** adb ב-`C:\Users\LENOVO\AppData\Local\Android\Sdk\platform-tools\adb.exe`; מכשיר `RFGL230FBBK` (Galaxy S24+, Android 16). אפשר CDP-over-USB (forward ל-`webview_devtools_remote_<pid>` של `com.lavexus.familyapp`). build: `npm run sync` + `cd android && JAVA_HOME=<Android Studio>/jbr ./gradlew :app:bundleRelease --offline`.
- **אזהרות:** אסור `firebase appdistribution:distribute` בלי אישור מפורש. ברירת-מחדל לבדיקה = `adb install` למכשיר שלי בלבד. לפני כל שינוי הרסני/UX רחב — תוכנית+אישור. ענה בעברית. השתמש ב-skill **systematic-debugging** לכל באג (שורש לפני תיקון) ואמת על המכשיר (הבאגים הוויזואליים והתראות לא משתחזרים ב-Chrome desktop).
- **הערה:** לאחרונה הוסרו `USE_EXACT_ALARM`+`SCHEDULE_EXACT_ALARM` מהמניפסט (tools:node=remove) לתאימות Play — **ה-build הזה עדיין לא מותקן על המכשיר**. רלוונטי לבעיה 2.

---

## בעיה 1 — אייקון ההתראה החדש לא נראה בטלפון
**לא באג.** אייקון ההתראה (`ic_stat_family`, לב לבן ב-`android/app/src/main/res/drawable-*`) הוא **נייטיב** ומגיע רק ב-build חדש — לא דרך OTA. כדי לראות אותו: `npm run sync` → build → `adb install` למכשיר שלי. כדאי לאחד את זה עם תיקון בעיה 2 (גם נייטיב) ולהתקין build אחד.

---

## בעיה 2 — התראת *זמן המשימה עצמה* לא מצלצלת ולא מופיעה (offset של 10/15 דק' כן)
**שורש (מאומת בחקירה):** לא התנגשות-מזהים (המזהים נפרדים: `_capNotifId` app.html:13442-13453, offset 0=advance,1=at-time,2-4=overdue). הסיבה: **re-arm churn**. `_capRescheduleAll()` נקרא על **כל snapshot של Firestore** (app.html:14034) + resume/share-close/undo/delete/commit. כל קריאה מריצה `schedule()` של הפלאגין שעושה `cancelTimerForNotification(id)` ואז re-arm. בין T-offset ל-T, כל reschedule **מחזיר את אזעקת ה-at-time** (offset 1, כי `atTime>now` ב-13529) אבל לא נוגע ב-advance שכבר נורה. כל re-arm של `setAndAllowWhileIdle` **מאפס את חלון ה-Doze הגמיש** → אזעקת ה-at-time נדחית/מתאחדת ונבלעת, בעוד ה-advance (נורה פעם אחת, לא נוגעים בו) מגיע. מחמירים: על Samsung/Android14 ייתכן ש-`canScheduleExactAlarms()` כבר false (at-time כבר inexact היום); הפלאגין משמיט בשקט אזעקה ש-`at<now` (LocalNotificationManager.java:338-341). **אחרי שה-build בלי exact-alarm יותקן — הכל נהיה inexact ומחמיר.**

**מיקומים:** `_capScheduleTask` (app.html:13499-13552) · `_capRescheduleAll` body (13587-13618, מתחיל ב-`removeAllDeliveredNotifications()`) · טריגרים (14034 + 9074,9884,11445-11617,11968,16679) · plugin `schedule()` (node_modules/@capacitor/local-notifications/.../LocalNotificationManager.java:139-153, 338-396) · manifest (android/app/src/main/AndroidManifest.xml).

**כיוון תיקון:** (1) **reschedule אידמפוטנטי** — לפני `schedule()` לקרוא `getPending()` ולדלג על id שזמנו לא השתנה (לעצור את ה-cancel/re-arm churn). (2) **debounce** ל-`_capRescheduleAll` (ריצה אחת לכמה שניות), ולדלג לגמרי על snapshots מרוחקים שלא שינו את שדות ה-time/notify/date/completed של משימות-המתריעות של **המכשיר הזה** (key על content-hash). (3) **החלטת exact-alarm:** לאמינות at-time אחרי הסרת ההרשאה — אפשר לבקש `SCHEDULE_EXACT_ALARM` עם בקשת-הרשאה בזמן ריצה (`ACTION_REQUEST_SCHEDULE_EXACT_ALARM`) — **זו מותרת ל-Play** (המוגבלת היא `USE_EXACT_ALARM`); או להישאר inexact ולסמוך על (1)+(2). (4) אימות: `adb logcat | grep -iE "LN|LocalNotification"` לחפש "Exact alarms not allowed" / "Scheduled time must be after current time".

**החלטה נדרשת:** האם להחזיר exact-alarm (אמינות מקסימלית, דורש בקשת-הרשאה בזמן ריצה + build חדש) או להישאר inexact ולתקן רק את ה-churn? בדוק קודם על המכשיר אם `canScheduleExactAlarms()` מחזיר true/false, והאם "Deep sleeping apps"/אופטימיזציית-סוללה של Samsung חוסמת את האפליקציה.

---

## בעיה 4 — הבזק שחור ~0.5ש' בפתיחת sheets/popups + מצמוצים שחורים ב-cropper
**שורש (מאומת):** ה-System WebView מצייר **פריים שחור אחד** בכל יצירת **שכבת-קומפוזיציה חדשה** ב-GPU. הקוד כבר מודע (app.html:134-143 "black-flash killer" שמכבה backdrop-filter; `goto()` שוכתב ל-opacity-only ב-7248-7251) — אבל זה לא כיסה את ה-sheets ואת ה-cropper. (א) **opts-sheet** (popup של "מחק משימה"/"שיתוף התראות"/"זמן ותאריך"): מונפש ב-`transform:translateY(100%)→0` (app.html:1376-1379) → שכבה חדשה **מעל** ה-iframe `#v4Home` (שכבה מבודדת ב-`translateZ(0);backface-visibility:hidden`, app.html:3620) → re-tile + פריים שחור, יחד עם scrim כהה `rgba(28,17,10,.42)`. (ב) **cropper**: טבעת-עמעום `box-shadow:0 0 0 1200px rgba(0,0,0,.55)` (app.html:3328) שמצוירת מחדש בכל פריים-גרירה + `.cropper-modal{background:#000}` מוסתר רק ב-`opacity:0` (אפשר להבליח שחור). (ג) **calendar**: אותו דפוס (`.cal-drawer` translateY + `.cal-bg` scrim, app.html:1294-1297).

**מיקומים:** opts-sheet 1376-1379 + `openOptionsSheet` 8777-8784 · #v4Home iframe 3620 · cropper 3328-3333 + vendor/cropper.min.css · cal-drawer 1294-1297 · תקדים goto() opacity-only 7248-7251.

**כיוון תיקון:** ללכת לפי דפוס `goto()` (opacity, בלי transform-promotion) ולהקדים-ליצור שכבות לפני האנימציה. (1) sheets+calendar: לתת ל-`.opts-sheet`/`.cal-drawer` `will-change:transform`+`translateZ(0)` קבועים (שהשכבה תיווצר ב-render, לא בפתיחה), או להחליף את ה-slide ל-opacity/scale-קל. (2) cropper: להחליף את ה-`box-shadow` 1200px ב-`.cropper-modal` הנייטיב (שכבה סטטית אחת שלא מצוירת מחדש בגרירה) בצבע חם של האפליקציה, או `display:none` במקום `opacity:0`; להוסיף `translateZ(0)` ל-`.avcrop-stage`. **לאמת על המכשיר** אחרי כל שינוי (לא משתחזר ב-desktop). אפשר להפעיל paint-flashing ב-CDP.

**החלטה נדרשת:** לשמר את תחושת ה-"עלייה מלמטה" של ה-sheets, או להחליף ל-opacity/scale (שמבטל לגמרי את ההבזק)? שווה סקירת-עיצוב.

---

## בעיה 5 — כפתור "חזור להיום" כשמסתכלים על תאריך אחר
**שורש (מאומת):** התאריך הנצפה הוא `let activeDate = todayDate()` (app.html:6756), משתנה רק ב-`calGoToSelected()` (12037) וב-`_wkOpenDay()` (10895). **כפתור "↩ חזרה להיום" כבר קיים** ב-`updateOtherDayBanner()` (app.html:10849-10863, onclick מאפס `activeDate=todayDate();renderToday()`) — אבל הוא מרונדר ב-`#otherDayCtx` בתוך ה-DOM הישן `#s-today` (3698) ש**חבוי לגמרי מתחת ל-iframe** `#v4Home` (z-index:60, inset:0, app.html:3620). ה-iframe תמיד מציג "היום" (אין לו מושג של תאריך; `_v4Push` שולח תמיד `dateText: new Date()...`, app.html:14864).

**כיוון תיקון מומלץ (תואם לארכיטקטורה החיה):** לחשוף את הכפתור **בתוך ה-iframe**. (1) ב-`_v4Push` (app.html:14813-14872): לשלוח תווית מ-`activeDate` + `isToday:(activeDate===todayDate())`. (2) ב-`today-v4-preview.html` (`applyFamilyData` ~916): כש-`isToday===false` להציג pill "↩ חזרה להיום" + לעדכן את תווית התאריך. (3) קליק → `_post({type:'action',name:'backToToday'})` (יש כבר `_post` ב-782). (4) ב-`_v4HandleAction` (app.html:14892): `case 'backToToday': activeDate=todayDate(); renderToday();`. (5) **להעלות `?v=19`→`?v=20`** ב-app.html:3620. *חלופה קלה:* להרים את `#otherDayCtx` מעל ה-iframe (z-index>60).

**החלטה נדרשת:** האם מסך הבית יהפוך ל-day-view כש-`activeDate≠today` (מציג משימות של אותו יום + pill), או שצפייה ביום-אחר תישאר ב-week-view? והיכן הכפתור (chip צף למעלה / ליד התאריך / pill תחתון)?

---

## בעיה 6 — מזג אוויר תקוע על 22°
**שורש (מאומת):** HTML סטטי קשיח ב-`today-v4-preview.html:670-679` (`<span class="val">22°</span>`, "מעונן חלקית"); `applyFamilyData` **מדלג בכוונה** על מזג-אוויר (969-973, מעדכן רק events+together); אין שדה weather ב-payload (app.html:14862-14870); **אין שום geolocation/הרשאת-מיקום** (manifest רק INTERNET).

**כיוון תיקון — אופציה A (מזג אוויר אמיתי, מומלץ; בלי מפתח, בלי הרשאת-מיקום):** (1) **Open-Meteo** (`https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m,weather_code&timezone=auto`, חינם, ללא מפתח, CORS). למפות `weather_code` (WMO) לעברית+אייקון. (2) מיקום בלי הרשאה: **ipapi.co/json** (מיקום גס לפי IP, רק INTERNET) — לשמור lat/lon ב-localStorage. (3) חיווט: `_fetchWeather()` ב-app.html → להרחיב payload (14868) ל-`weather:{temp,text}` → ב-today-v4-preview.html (970-973) לעדכן `.stat:nth-child(3) .val/.sub`. (4) fallback שקט לסטטי בכישלון/offline. (5) **להעלות `?v=`**. **אופציה B (להחליף את הווידג'ט):** סטטיסטיקה משפחתית אמיתית מנתונים קיימים — "משימות שהושלמו היום", "המשימה הבאה בעוד X" (יש כבר `next.mins` ב-14843), או "ימי הולדת קרובים". בלי רשת/הרשאה.

**החלטה נדרשת:** מזג-אוויר אמיתי (A) או החלפה בסטט משפחתי (B)? (אל תוסיף הרשאת GPS — תפעיל הצהרת Data-Safety מיקום ב-Play עבור תועלת שולית; IP-geo גס מספיק.)

---

## איך לעבוד
1. systematic-debugging לכל באג — לאמת את השורש לפני תיקון.
2. סדר מוצע: קל-לבטוח קודם (5,6 = web/OTA), אחר כך 4 (web, אבל דורש אימות-מכשיר), ואז 2+1 ביחד (נייטיב, build+install אחד).
3. כל שינוי web → `git push` ל-master + אמת חי. כל שינוי iframe → להעלות `?v=`. כל שינוי native → build + `adb install` למכשיר שלי.
4. אמת על המכשיר RFGL230FBBK (הבאגים הוויזואליים+התראות לא משתחזרים ב-desktop).
