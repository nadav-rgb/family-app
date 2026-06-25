# מוכנות ל-Google Play — צ'קליסט

> נוצר 2026-06-25. מסכם מה נסגר בצד-המפתח ומה נותר לבעלים (פעולות קונסול/החלטות).

## ✅ נסגר (צד מפתח — בקוד/בריפו)

| פריט | מה נעשה | היכן |
|---|---|---|
| חתימת release | `signingConfigs.release` טוען upload key מ-`android/keystore.properties` (git-ignored). אומת ב-`gradlew signingReport`. | `android/app/build.gradle` |
| upload keystore | נוצר (RSA 2048, תקף עד 2053, alias `upload`). **חובה לגבות — ראו אזהרה.** | `android/upload-keystore.jks` (git-ignored) |
| versionCode | 10 → **11** (להעלאה ראשונה ל-Play) | `android/app/build.gradle` |
| `USE_EXACT_ALARM` / `SCHEDULE_EXACT_ALARM` | הוסרו מהמניפסט הממוזג (`tools:node="remove"`). אומת: 0 הרשאות exact-alarm במניפסט הממוזג. תזכורות עוברות ל-alarm לא-מדויק (`allowWhileIdle`). | `AndroidManifest.xml` |
| הגנת סודות | `.gitignore` חוסם `*.jks` / `*.keystore` / `keystore.properties` | `android/.gitignore` |
| מדיניות פרטיות | עמוד HE+EN חי ב-`https://family-app-roan.vercel.app/privacy.html` — מתאר את הזרימה האמיתית: Google (זיהוי דיבור), OpenAI (ניתוח), Firebase (אחסון). | `privacy.html` |
| מחיקת נתונים | עמוד חי ב-`.../account-deletion.html` (דרישת Play ל-URL מחיקה) | `account-deletion.html` |
| תיקון קופי מטעה | "נשמר בבית" → "ההקלטה משמשת רק לזיהוי הדיבור ואינה נשמרת"; אווטרים "לא נשמרות בענן" → "גלויות רק לבני המשפחה" (האווטרים בפועל ב-Firebase Storage). **לסקירת ניסוח.** | `app.html` |
| אייקון חנות 512 | יוצא מ-`icon.svg` | `docs/store-assets/play-icon-512.png` |
| Feature graphic 1024×500 | לוגו על רקע מותג | `docs/store-assets/play-feature-graphic-1024x500.png` |
| AAB חתום | נבנה (6.08MB, חתום ב-upload key). | `android/app/build/outputs/bundle/release/app-release.aab` + עותק בדסקטופ `family-app-release-v11.aab` |

## 🔑 אזהרת keystore — קריטי
ה-upload key (`android/upload-keystore.jks`) והסיסמה (ב-`android/keystore.properties`) הם **בלתי-ניתנים-לשחזור**. אובדנם = אי-אפשר לעדכן את האפליקציה ב-Play לעולם (אלא דרך איפוס upload-key מול Google, רק אם נרשמת ל-Play App Signing).
**לגבות עכשיו**: את שני הקבצים + הסיסמה, למנהל-סיסמאות/כספת. הם git-ignored ולא נמצאים ב-GitHub.

## ⬜ נותר — פעולות בעלים (אי-אפשר אוטומטית)

1. **החלטה אסטרטגית: סוג חשבון Play** — אישי ($25, אך חובת 20 טסטרים × 14 יום closed-testing לפני production) מול ארגוני (Lavexus + D-U-N-S, פטור מה-20-טסטרים). → קובע לוח-זמנים.
2. **פתיחת חשבון Play Console** + אימות זהות ($25, 1-3 ימים).
3. **Play App Signing** — אופט-אין בהעלאה הראשונה (Google מחזיק את מפתח-החתימה האמיתי; אתה מעלה עם ה-upload key).
4. **טופס Data Safety** — להצהיר: אודיו (קלט קולי), מידע אישי (שמות/ימי-הולדת), תמונות, תוכן-משתמש; **משותף עם צד שלישי: OpenAI**; מאוחסן ע"י Google/Firebase; מוצפן בהעברה; קיים מסלול מחיקה.
5. **דירוג תוכן (IARC)** + **קהל יעד = מבוגרים בלבד** (לא "Designed for Families").
6. **צילומי מסך** — 2-8 (מומלץ עם דמו-דאטה, לא נתוני משפחה אמיתיים).
7. **תיאור מלא בעברית** (500-4000 תווים) — קיים רק קצר ("אפליקציית משימות משפחתית").
8. **קטגוריה**: Productivity (או Lifestyle/Parenting). **שם בחנות**: לשקול "Family — משימות משפחתיות" ("Family" לבד גנרי מאוד).
9. **לאשר תנאי OpenAI** — שלא שומרים/מאמנים על הטקסט שנשלח ל-`/api/parse-tasks`; אם כן, לעדכן את מדיניות הפרטיות.

## 🔧 מומלץ (לא חוסם פרסום)
- **מחיקה מלאה מתוך האפליקציה** — כרגע יש "ניתוק מכשיר"; Play מעדיף גם מחיקת-נתונים מלאה in-app (לא רק דרך מייל). שדרוג עתידי.
- **אייקון התראה מונוכרום** (`ic_stat_*`) — כרגע ברירת-מחדל; עלול להראות ריבוע אפור במכשירים מסוימים.
- **`distributionUrl`** ב-gradle wrapper מצביע על קובץ מקומי בדסקטופ — לא נייד ל-CI/מכונה אחרת.

## פקודת בנייה (לעתיד)
```
npm run sync
cd android && JAVA_HOME="<Android Studio>/jbr" ./gradlew :app:bundleRelease --offline
# פלט: android/app/build/outputs/bundle/release/app-release.aab
```
לכל העלאה: להעלות `versionCode` ב-`android/app/build.gradle`.
