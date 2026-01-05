# מדיניות אבטחה

מסמך זה מפרט את פרוטוקולי האבטחה והנחיות הדיווח על פגיעויות עבור פרויקט **DictaChat/BricksLLM**. הבטחת אבטחת המערכות שלנו היא בעדיפות עליונה, ובעוד אנו פועלים בשקידה לשמירה על הגנה חזקה, פגיעויות עדיין עלולות להתרחש. אנו מעריכים מאוד את תפקיד הקהילה בזיהוי ודיווח על חששות אבטחה כדי לשמור על שלמות המערכות שלנו ולהגן על המשתמשים שלנו.

## גרסאות נתמכות

אנו תומכים באופן פעיל ומספקים עדכוני אבטחה עבור הגרסאות הבאות של **DictaChat/BricksLLM**:

| גרסה  | נתמכת              |
| ----- | ------------------ |
| 1.0.x | :white_check_mark: |
| < 1.0 | :x:                |

אנו ממליצים תמיד להריץ את הגרסה העדכנית ביותר מענף ה-`main` כדי להבטיח שיש לכם את תיקוני האבטחה והשיפורים האחרונים.

## דיווח על פגיעות

אם זיהיתם פגיעת אבטחה, אנא הגישו את הממצאים שלכם דרך [GitHub Security Advisories](https://github.com/oznav2/DictaChat/security/advisories/new) או פנו אלינו ב-[שרת ה-Discord שלנו](https://discord.gg/DictaChat).
ודאו שהדיווח שלכם כולל את כל המידע הרלוונטי הנדרש עבורנו כדי לשחזר ולהעריך את הבעיה. כללו את ההקשר של הפריסה שלכם (למשל, הגדרת Docker מקומית, תצורת GPU) ואת כתובת ה-URL של השירות המקומי המושפע, במידת הצורך.

כדי להבטיח תהליך חשיפה אחראי ויעיל, אנא פעלו לפי ההנחיות הבאות:

- שמרו על סודיות והימנעו מחשיפה פומבית של הפגיעות עד שתהיה לנו הזדמנות לחקור ולטפל בבעיה.
- הימנעו מהרצת סריקות פגיעות אוטומטיות על התשתית שלנו או על רכיבי ה-Gateway ללא הסכמה מראש. צרו איתנו קשר כדי להקים סביבת "ארגז חול" (sandbox) במידת הצורך.
- אל תנצלו פגיעויות שהתגלו למטרות זדוניות, כגון גישה או שינוי של נתוני משתמש המאוחסנים במופעים המקומיים שלכם.
- אל תבצעו התקפות אבטחה פיזיות, הנדסה חברתית, התקפות מניעת שירות מבוזרות (DDoS), קמפיינים של ספאם, או התקפות על אפליקציות צד שלישי המשולבות דרך MCP (Model Context Protocol) כחלק מבדיקות הפגיעות שלכם.

## מחוץ לטווח (Out of Scope)

בעוד שאנו מעריכים את כל המאמצים לסייע בשיפור האבטחה שלנו, אנא שימו לב כי סוגי הפגיעויות הבאים נחשבים מחוץ לטווח הטיפול:

- פגיעויות הדורשות התקפות "אדם באמצע" (MITM) או גישה פיזית למכשיר המשתמש או לשרת המקומי.
- בעיות של התחזות לתוכן (content spoofing) או הזרקת טקסט ללא וקטור התקפה ברור או יכולת לשנות HTML/CSS בממשק הצ'אט.
- בעיות הקשורות להתחזות בדואר אלקטרוני (מכיוון שהפרויקט משתמש בעיקר באימות Gateway מקומי).
- היעדר כותרות DNSSEC, CAA, או CSP עבור פריסות מקומיות בלבד.
- היעדר דגלי secure או HTTP-only על עוגיות (cookies) שאינן רגישות בשימוש בממשק המשתמש.

## המחויבות שלנו

ב-DictaChat/BricksLLM, אנו מחויבים לשמור על תקשורת שקופה ושיתופית לאורך תהליך פתרון הפגיעות. הנה מה שניתן לצפות מאיתנו:

- **זמן תגובה**
  אנו נאשר את קבלת דיווח הפגיעות שלכם תוך שלושה ימי עסקים ונספק לוח זמנים משוער לפתרון.
- **הגנה משפטית**
  לא נפתח בהליכים משפטיים נגדכם בגין דיווח על פגיעויות, בתנאי שתעמדו בהנחיות הדיווח.
- **סודיות**
  הדיווח שלכם יטופל בסודיות. לא נחשוף את המידע האישי שלכם לצדדים שלישיים ללא הסכמתכם.
- **הכרה**
  באישורכם, נשמח להכיר בתרומתכם לשיפור האבטחה שלנו באופן פומבי לאחר שהבעיה תיפתר.
- **פתרון בזמן**
  אנו מחויבים לעבוד איתכם בשיתוף פעולה הדוק לאורך תהליך הפתרון, ולספק עדכונים שוטפים לפי הצורך. המטרה שלנו היא לטפל בכל הפגיעויות המדווחות במהירות, ואנו נשתף איתכם פעולה באופן פעיל כדי לתאם חשיפה אחראית לאחר שהבעיה תיפתר במלואה.

## ארכיטקטורת אבטחה ותכונות

**BricksLLM** תוכנן בארכיטקטורת "פרטיות תחילה" (Privacy First) כדי למקסם את ריבונות הנתונים והאבטחה:

- **הרצה מקומית**: ה-LLM (DictaLM-3.0) פועל כולו על החומרה המקומית שלכם באמצעות `llama-cpp`. נתוני צ'אט אינם מועברים לספקי ענן חיצוניים לצורך הסקה (inference).
- **תשתית באתר (On-Premise)**: כל הנתונים הקבועים (היסטוריית צ'אט, הגדרות, מפתחות API) מנוהלים בתוך קונטיינרים של Docker מקומיים (PostgreSQL, Redis, MongoDB).
- **אבטחת API Gateway**: BricksLLM פועל כ-Gateway מאובטח, הדורש מפתחות API עבור כל בקשות הפרוקסי עם תמיכה בניקוי מידע מזוהה אישית (PII scrubbing).
- **ארגז חול לכלים (Tool Sandbox)**: כלים המופעלים דרך MCP מוגבלים לסביבה שאתם מגדירים, מה שמבטיח שיכולות המודל מוכלות בצורה בטוחה.

אנו מעריכים את עזרתכם בהבטחת אבטחת הפלטפורמה שלנו. התרומות שלכם חיוניות להגנה על המשתמשים שלנו ולשמירה על סביבה מאובטחת. תודה על העבודה איתנו לשמירה על בטיחות DictaChat.

---

**עם ישראל חי! 🇮🇱**
