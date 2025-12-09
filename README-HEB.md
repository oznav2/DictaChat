<p align="center">
<img src="./assets/hero-heb.png" width="150" />
</p>

# **BricksLLM: תשתית AI מקומית עבור DictaLM-3.0**

**BricksLLM** הוא שער AI (AI Gateway) ייעודי, מותאם לענן (Cloud-native), שעבר אופטימיזציה לפריסה וניהול מקומיים של מודל **DictaLM-3.0**. פרויקט זה מספק תשתית מלאה מבוססת קונטיינרים המנהלת את המרכיבים הבאים:

-   **DictaLM-3.0 Inference**: מריץ את המודל `dictalm-3.0-24b-thinking-fp8-q4_k_m.gguf` באמצעות קונטיינר `llama-server` ייעודי (Llama.cpp בתוך Docker עם תמיכת CUDA).
-   **AI Gateway**: שרת פרוקסי מבוסס Go המנהל הגבלת קצב (Rate Limiting), בקרת עלויות, מטמון (Caching), ואימות מפתחות API בין הלקוחות למודל.
-   **Frontend Demo**: ממשק צ'אט קליל עם טעינה חמה (Hot-reloading) לאינטראקציה עם DictaLM, המדגים יכולות חשיבה (תגיות `<think>`) ושימוש בכלים.
-   **Data Persistence**: קונטיינרים של PostgreSQL ו-Redis לשמירת הגדרות, לוגים ונתוני מטמון.

מערך זה תוכנן במיוחד לשימוש מקומי, וממנף את Docker Compose להרמת המחסנית (Stack) כולה בפקודה אחת. הוא משמש כתבנית מוכנה לייצור (Production-ready) לפריסת DictaLM עם יכולות ניהול ברמה ארגונית.

## 🚀 כללי ניהול שרת (קריטי)

### כלל 1: עצור לפני שתתחיל (Stop Before Start)
כדי להבטיח מצב נקי ולמנוע שגיאות "Address already in use" (במיוחד עם פורטים כמו 8003 או 5002), יש להקפיד על משמעת ניהול שרת קפדנית.

**פרוטוקול:**
לפני הרצת הסקריפט `start.sh` או כל פקודה המפעילה שירותי שרת (כמו `docker compose up`), **חובה תמיד** לעצור תחילה כל מופע שרת שרץ.

**תהליך עבודה נדרש:**
```bash
./stop.sh  # 1. מנקה קונטיינרים ישנים ומשחרר פורטים
./start.sh # 2. מפעיל את המחסנית החדשה
```

**רציונל:**
זה מונע התנגשויות בקישור פורטים ומבטיח ששינויי תצורה (כמו קישורי Volumes, משתני סביבה, או הגדרות Hot-reload) יוחלו כראוי על הקונטיינרים שנוצרו מחדש.

## 🛠️ מחסנית טכנולוגית ומדריך תפעול

### 1. תהליך פריסת המחסנית (Stack Deployment)

הפריסה מנוהלת על ידי הסקריפט `start.sh`, המבטיח אתחול עקבי וללא שגיאות של הסביבה באמצעות Docker Compose.

**רצף הפריסה:**
1.  **בדיקת דרישות קדם**: בודק קיום של Docker, דרייברים של NVIDIA (לתמיכת GPU), וקבצי תצורה חיוניים (`.env`, `docker-compose.yml`).
2.  **בדיקת משאבים**: מאמת משאבי GPU ושטח דיסק פנוי כדי להבטיח שהמודל יכול להיטען.
3.  **אימות תצורה**: מבטיח שכל משתני הסביבה הנדרשים מוגדרים ב-`.env`.
4.  **אתחול שירותים**:
    -   מריץ `docker compose up -d` להפעלת שירותי ה-Backend (`postgresql`, `redis`, `llama-server`, `bricksllm`, `swagger-ui`).
    -   מפעיל את קונטיינר ה-Frontend (`frontend`).
5.  **אימות בריאות (Health Verification)**:
    -   דוגם את נקודות הקצה לבדיקת בריאות של כל שירות (`pg_isready`, `redis-cli ping`, `curl health`).
    -   **צעד קריטי**: ממתין ל-`llama-server` שיטען את מודל DictaLM במלואו לזיכרון (מצוין על ידי תגובת HTTP 200 תקינה).
6.  **בדיקות אינטגרציה**: מריץ סדרת בדיקות פנימיות (`test-stack.sh`) לאימות הקישוריות בין הפרוקסי, המודל ומסד הנתונים.
7.  **מידע גישה**: מדפיס את כתובות ה-URL הזמינות לכל השירותים.

### 2. נקודות קצה לשירותים (Service Endpoints)

#### Frontend UI (ממשק משתמש)
-   **כתובת**: `http://localhost:8003`
-   **גישה**: ממשק צ'אט מבוסס דפדפן.

#### BricksLLM Proxy API
נקודת הכניסה העיקרית ליישומי AI.
-   **כתובת בסיס**: `http://localhost:8002`
-   **אימות**: Bearer Token (נדרש מפתח API)
-   **נקודת קצה למפתח**: 
    -   `POST /api/custom/providers/llama-cpp-root/chat/completions`
    -   **מטען (Payload)**: JSON תואם OpenAI (הודעות, מודל, כלים).
    -   **תגובה**: Streaming או JSON רגיל עם תגיות `<think>`.

#### BricksLLM Admin API
משמש לתצורה וניהול.
-   **כתובת בסיס**: `http://localhost:8001`
-   **אימות**: ללא (ברירת מחדל מקומית) / ניתן להגדרה.
-   **נקודות קצה עיקריות**:
    -   `GET /api/health`: סטטוס בריאות המערכת.
    -   `PUT /api/key-management/keys`: יצירה/עדכון מפתחות API.
    -   `PUT /api/provider-settings`: הגדרת ספקי LLM.
    -   `GET /api/events`: שליפת לוגים של שימוש ונתונים אנליטיים.

#### Llama Server (ישיר)
גישה ישירה למודל (עקיפת ה-Gateway).
-   **כתובת בסיס**: `http://localhost:5002`
-   **נקודת קצה**: `POST /v1/chat/completions`
-   **אימות**: Bearer token (אופציונלי/מתעלמים ממנו בתצורת השרת המוגדרת, אך ייתכן שיידרש כ-Header).

### 3. תהליך טעינת המודל

**מנגנון**:
עם הפעלת הקונטיינר, ה-`llama-server` ממפה את קובץ המודל (GGUF) ממערכת הקבצים המארחת אל הקונטיינר ומתחיל לטעון אותו לזיכרון ה-GPU (VRAM) (ולזיכרון המערכת אם ה-VRAM אינו מספיק).

**תזמון ומוכנות**:
-   **משך זמן**: בדרך כלל **10-45 שניות**, תלוי במהירות הדיסק (מומלץ NVMe) וגודל המודל (24B פרמטרים).
-   **בדיקת מוכנות**: הקונטיינר ידווח על סטטוס "בריא" (healthy) רק כאשר המודל נטען במלואו ושרת ה-HTTP מקבל בקשות.

> **⚠️ אזהרה קריטית:**
> **אין** לנסות ליצור אינטראקציה עם ה-Frontend או נקודות הקצה של ה-API עד שהסקריפט `start.sh` מדווח במפורש שכל השירותים הם **HEALTHY**.
> אינטראקציה מוקדמת בזמן שהמודל נטען תגרום לשגיאות `Connection Refused` או `502 Bad Gateway` ועשויה לדרוש אתחול מחדש של המחסנית.

### 4. שיקולים תפעוליים

**דרישות מערכת**:
-   **GPU**: כרטיס NVIDIA עם **16GB+ VRAM** (מומלץ 24GB לטעינה מלאה של מודל ה-24B).
-   **RAM**: זיכרון מערכת של 32GB+ (אם נדרשת טעינה חלקית ל-CPU).
-   **דיסק**: כונן NVMe SSD מהיר (קריטי לזמני טעינת המודל).

**ביצועים**:
-   **Inference**: המערכת משתמשת ב-`llama.cpp` עם האצת CUDA. הביצועים משתפרים ככל שיותר שכבות נטענות ל-GPU (`--n-gpu-layers`).
-   **חלון הקשר (Context Window)**: מוגדר כברירת מחדל ל-8192 טוקנים. הגדלת ערך זה תגדיל משמעותית את השימוש ב-VRAM.

## 🏗️ מבנה בסיס הקוד וארכיטקטורה טכנית

חלק זה מספק פירוט מקיף של ארגון הפרויקט, המחסנית הטכנולוגית והיחסים בין הרכיבים.

### 1. עץ מבנה בסיס הקוד

הפרויקט מאורגן לאזורים פונקציונליים: אפליקציית Go ליבה, ממשק Frontend, ותצורת פריסה.

```
BricksLLM/
├── cmd/
│   └── bricksllm/              # נקודת הכניסה הראשית לאפליקציה
│       └── main.go             # מאתחל את שרתי ה-Admin וה-Proxy
├── internal/                   # לוגיקה עסקית מרכזית (Go)
│   ├── config/                 # טעינת תצורה (env, קובץ)
│   ├── event/                  # מערכת אירועים ולוגים
│   ├── key/                    # לוגיקת אימות מפתחות API
│   ├── manager/                # ניהול מצב (מפתחות, ספקים, נתיבים)
│   ├── message/                # מערכת הודעות Pub/sub
│   ├── provider/               # אינטגרציות ספקי LLM
│   │   ├── custom/             # לוגיקת ספק מותאם אישית (בשימוש עבור DictaLM)
│   │   ├── openai/             # מתאם OpenAI
│   │   └── ...                 # ספקים אחרים (Anthropic, vLLM וכו')
│   ├── route/                  # לוגיקת ניתוב בקשות ויתירות (Failover)
│   ├── server/                 # מימושי שרת HTTP
│   │   ├── web/
│   │       ├── admin/          # נקודות קצה Admin API (פורט 8001)
│   │       └── proxy/          # נקודות קצה Proxy API (פורט 8002)
│   ├── storage/                # שכבת שמירת נתונים (Persistence)
│   │   ├── postgresql/         # מימושי מסד נתונים SQL
│   │   └── redis/              # מימושי מטמון (Cache)
│   └── validator/              # אימות בקשות (מגבלות קצב, עלות)
├── frontend/                   # אפליקציית צ'אט Frontend
│   ├── index.html              # מבנה UI ראשי
│   ├── index.js                # לוגיקת צ'אט ואינטגרציית API
│   ├── style.css               # עיצוב UI
│   └── package.json            # סקריפטי בנייה (ניהול גרסאות מטמון)
├── .env.template               # תבנית למשתני סביבה
├── chat_template.jinja2.template # תבנית ChatML עבור DictaLM
├── docker-compose.yml          # תצורת תזמור קונטיינרים
├── Dockerfile.prod             # הגדרת בניית הבינארי של BricksLLM Go
├── llama_entrypoint.sh         # סקריפט אתחול לקונטיינר Llama Server
├── start.sh                    # סקריפט פריסה ראשי
├── stop.sh                     # סקריפט ניקוי וכיבוי
└── test-stack.sh               # חבילת בדיקות אינטגרציה
```

### 2. דיאגרמת ארכיטקטורה טכנית

המערכת פועלת כמחסנית אחידה של שירותים בקונטיינרים, מנוהלת על ידי Docker Compose.

```ascii
                                  [ דפדפן משתמש ]
                                         │
                                         ▼
                             [ Frontend Container (8003) ]
                             (Hot-reloadable static server)
                                         │
                                         ▼
[ לקוח API חיצוני ] ────► [ BricksLLM Proxy (8002) ] ◄────► [ Redis Cache (6380) ]
                                         │                       (Rate Limits, Responses)
                                         ▼
                             [ Llama Server (5002) ]
                             (DictaLM-3.0 Inference)
                             (CUDA / GPU Accelerated)
                                         │
                                         ▼
                                  [ חומרת GPU ]

-----------------------------------------------------------------------------------

[ Admin Dashboard/CLI ] ────► [ BricksLLM Admin (8001) ] ◄────► [ PostgreSQL (5433) ]
                                                                 (Config, Logs, Keys)
```

## 🔐 תצורת משתני סביבה

חלק זה מתעד את משתני הסביבה הקריטיים המשמשים להגדרת מחסנית BricksLLM.

### טבלת ייחוס משתנים

| שם משתנה | ערך ברירת מחדל | חובה | מטרה | בשימוש ב |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | | | | |
| `POSTGRESQL_USERNAME` | `postgres` | כן | משתמש מסד נתונים עבור BricksLLM. | `.env`, `docker-compose.yml` |
| `POSTGRESQL_PASSWORD` | `postgres` | כן | סיסמת מסד נתונים. **אזהרת אבטחה: שנה בייצור.** | `.env`, `docker-compose.yml` |
| `POSTGRESQL_DB` | `bricksllm` | כן | שם מסד הנתונים ליצירה/שימוש. | `.env`, `docker-compose.yml` |
| `POSTGRESQL_HOST_PORT` | `5433` | כן | מיפוי פורט מארח ל-PostgreSQL. | `.env`, `docker-compose.yml` |
| **Redis** | | | | |
| `REDIS_PASSWORD` | (מחרוזת מורכבת) | כן | סיסמה לאימות Redis. | `.env`, `docker-compose.yml` |
| `REDIS_HOST_PORT` | `6380` | כן | מיפוי פורט מארח ל-Redis. | `.env`, `docker-compose.yml` |
| **Llama Server** | | | | |
| `LLAMA_IMAGE` | `ghcr.io/ggml-org/llama.cpp:server-cuda` | כן | Docker image עבור מנוע ההסקה. | `.env`, `docker-compose.yml` |
| `LLAMA_HOST_PORT` | `5002` | כן | פורט מארח לגישה ישירה למודל. | `.env`, `docker-compose.yml` |
| `HF_FILE` | `dictalm...gguf` | כן | שם קובץ מודל ה-GGUF לטעינה. | `.env`, `docker-compose.yml` |
| `LOCAL_MODEL_PATH` | `./models` | כן | נתיב מארח המכיל את קובץ המודל. | `.env`, `docker-compose.yml` |
| `CONTEXT_SIZE` | `8192` | לא | גודל חלון ההקשר בטוקנים. | `.env`, `docker-compose.yml` |
| `N_GPU_LAYERS` | `99` | לא | מספר השכבות לטעינה ל-GPU. | `.env`, `docker-compose.yml` |
| `SYSTEM_PROMPT` | "You are DictaLM..." | לא | הוראת מערכת בסיסית המוזרקת לתבנית הצ'אט. | `.env`, `llama_entrypoint.sh` |
| **BricksLLM Gateway** | | | | |
| `BRICKSLLM_MODE` | `production` | כן | מצב תפעולי (`development` או `production`). | `.env`, `docker-compose.yml` |
| `BRICKSLLM_ADMIN_PORT`| `8001` | כן | פורט מארח עבור Admin API. | `.env`, `docker-compose.yml` |
| `BRICKSLLM_PROXY_PORT`| `8002` | כן | פורט מארח עבור Proxy API. | `.env`, `docker-compose.yml` |

## 💻 תיעוד Frontend

### סקירה כללית
ה-Frontend של BricksLLM הוא אפליקציית עמוד-יחיד (SPA) קלילה שנועדה להדגים את יכולות ה-Gateway של BricksLLM ואת מודל DictaLM הבסיסי. היא מספקת ממשק צ'אט התומך בהדמיית חשיבה (באמצעות תגיות `<think>`) ומשתלב ישירות עם BricksLLM Proxy.

### אינטגרציית API

#### תצורה (Configuration)
ה-Frontend משתמש בתצורה הקשיחה (Hardcoded) הבאה כדי להתחבר ל-BricksLLM Proxy. הגדרות אלו תואמות את הספק המותאם אישית והמפתח שהוגדרו ב-Backend.

**הגדרת ספק (Custom):**
-   **שם ספק**: `llama-cpp-root`
-   **כתובת**: `http://llama-server:5002`
-   **מזהה הגדרה**: (נוצר אוטומטית על ידי סקריפט ההתקנה)

**מפתח API:**
-   **מפתח**: `sk-bricksllm-frontend-llama-key-explicit`
-   **שם**: `Frontend Llama Key`
-   **נתיב מותר**: `/chat/completions`

#### נקודת קצה (Endpoint)
ה-Frontend מתקשר עם BricksLLM Proxy דרך נקודת הקצה הבאה:
-   **כתובת**: `http://localhost:8002/api/custom/providers/llama-cpp-root/chat/completions`
-   **שיטה**: `POST`
-   **Headers**:
    -   `Authorization`: `Bearer sk-bricksllm-frontend-llama-key-explicit` (המפתח שהוגדר לספק המותאם אישית)
    -   `Content-Type`: `application/json`

### פריסה (Deployment)

#### תצורת Docker
ה-Frontend מוגדר כשירות ב-`docker-compose.yml`:
-   **Image**: `node:18-alpine`
-   **שם קונטיינר**: `bricksllm-frontend`
-   **מיפוי פורטים**: פורט מארח `8003` -> פורט קונטיינר `8003`
-   **Volume**: מקשר את ספריית `frontend` המקומית ל-`/app` בקונטיינר עבור טעינה חמה (Hot-reloading).

#### מצב פיתוח (Hot Reload)
-   **פקודה**: הקונטיינר מריץ פקודת מעטפת שבודקת את `NODE_ENV`.
    -   אם `development`: מריץ `bun run build` (מעדכן גרסת מטמון) ומפעיל `http-server` עם מטמון מבוטל (`-c-1`).
    -   אם `production`: מפעיל `http-server` עם מטמון ברירת מחדל.
-   **משתנה סביבה**: `NODE_ENV=development` מוגדר ב-`docker-compose.yml` כדי לאפשר התנהגות טעינה חמה.

---


## 📥 הורדת המודל - הוראות

### הורדת מודל DictaLM-3.0 GGUF

לפני הרצת מערכת BricksLLM, עליך להוריד את קובץ המודל DictaLM-3.0 GGUF ולהציב אותו בתיקייה הנכונה.

#### שלב 1: יצירת תיקיית המודל
```bash
# יצירת תיקיית models (אם אינה קיימת)
mkdir -p ./models

# או יצירת תיקייה מותאמת אישית ועדכון LOCAL_MODEL_PATH ב-.env
mkdir -p /path/to/your/local/model/directory
```

#### שלב 2: הורדת קובץ המודל

הורד את מודל DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF באמצעות אחת מהשיטות הבאות:

**פרטי קובץ המודל:**
- **גודל**: 13.4 GB
- **SHA256**: `41353ca50fb02be915a7924c0e98061b8657f685c6fcb9a25c522a682cb77732`

**באמצעות wget:**
```bash
wget https://huggingface.co/VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF/resolve/main/dictalm-3.0-24b-thinking-fp8-q4_0.gguf -O ./models/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

**באמצעות curl:**
```bash
curl -L https://huggingface.co/VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF/resolve/main/dictalm-3.0-24b-thinking-fp8-q4_0.gguf -o ./models/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

**לתיקייה מותאמת אישית (עדכון LOCAL_MODEL_PATH ב-.env):**
```bash
curl -L https://huggingface.co/VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF/resolve/main/dictalm-3.0-24b-thinking-fp8-q4_0.gguf -o /path/to/your/local/model/directory/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

#### שלב 3: אימות ההורדה

בדוק שקובץ המודל הורד כראוי:
```bash
ls -la ./models/
# אמור להציג: dictalm-3.0-24b-thinking-fp8-q4_0.gguf

# בדיקת גודל הקובץ (אמור להיות ~13-14GB)
du -h ./models/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

#### שלב 4: עדכון תצורת הסביבה

ודא שקובץ `.env` שלך מכיל את תצורת המודל הנכונה:
```bash
# עבור תיקיית models ברירת מחדל
LOCAL_MODEL_PATH=./models
HF_FILE=dictalm-3.0-24b-thinking-fp8-q4_0.gguf

# או עבור תיקייה מותאמת אישית
LOCAL_MODEL_PATH=/path/to/your/local/model/directory
HF_FILE=dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

### מודלים חלופיים

ניתן להשתמש גם במודלים אחרים בפורמט GGUF על ידי:
1. הורדת קובץ המודל הרצוי
2. הצבתו בתיקיית `LOCAL_MODEL_PATH` שלך
3. עדכון `HF_FILE` ב-`.env` שלך להתאמה לשם הקובץ
4. התאמת `CONTEXT_SIZE` ו-`N_GPU_LAYERS` לפי הצורך עבור המודל החדש


<p align="center">
  <a href="https://discord.gg/dFvdt4wqWh"><img src="https://img.shields.io/badge/discord-BricksLLM-blue?logo=discord&labelColor=2EB67D" alt="Join BricksLLM on Discord"></a>
  <a href="https://github.com/bricks-cloud/bricks/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-red" alt="License"></a>
</p>
