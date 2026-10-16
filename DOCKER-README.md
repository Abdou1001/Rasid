# دليل تشغيل ونشر مشروع راصد (Rasid Backend) باستخدام Docker و Redis

يقدم هذا الدليل إرشادات تشغيل ونشر واجهة برمجة التطبيقات (API) لمشروع **راصد (Rasid)** لإدارة والتبليغ عن الهواتف المفقودة، بالاعتماد على **Docker** و **Docker Compose** مع خادم تخزين مؤقت مستقل **Redis Cache**.

---

## 1. الهيكلية المعمارية (Architecture Overview)

```text
[ Client (Web / Mobile) ]
           │
           ▼
[ Reverse Proxy (Nginx / Caddy / Cloudflare) ] ── HTTPS (443)
           │
           ▼
[ Docker Network: rasid_network ]
  ├── [ rasid-backend ] : Express.js API (Port 5000)
  │         │
  │         ├── Connects to Redis Service: redis://redis:6379 (Internal Cache)
  │         │
  │         └── Connects to External Managed DB: Supabase (PostgreSQL & Storage)
  │
  └── [ rasid-redis ]   : Redis 8 Alpine (Port 6379, localhost only)
            └── Volume: rasid_redis_data (/data)
```

- **قاعدة البيانات والتخزين:** خدمة مدارة سحابياً خارج الحاوية عبر **Supabase**.
- **التخزين المؤقت:** خدمة **Redis 8 Alpine** داخل شبكة Docker المعزولة (`rasid_network`).
- **حماية المنفذ:** منفذ Redis مقيد على `127.0.0.1:6379` فقط للاستخدام الداخلي المحلي ولن يُكشف للشبكة الخارجية.

---

## 2. المتطلبات المسبقة (Prerequisites)

1. تثبيت **Docker Engine** (الإصدار 24 فما فوق).
2. تثبيت **Docker Compose V2** (`docker compose`).
3. مفاتيح وبيانات الاتصال بمشروع **Supabase**.

---

## 3. تجهيز ملف متغيرات البيئة (.env)

قبل تشغيل الحاويات، أنشئ ملف `.env` في المجلد الرئيسي بالاعتماد على النموذج الجاهز:

```bash
cp .env.example .env
```

ثم قم بملء المتغيرات الحقيقية في `.env`:

```env
PORT=5000
NODE_ENV=production
FRONTEND_URL=http://localhost:3000

# بيانات Supabase الخارجية
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-actual-supabase-service-role-key
STORAGE_BUCKET_NAME=phone-images

# أمان JWT
JWT_SECRET=your_actual_strong_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d

# اتصال Redis داخل Docker (يُترك كما هو للربط الداخلي)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379
```

> [!IMPORTANT]
> لا تقم برفع ملف `.env` الذي يحتوي على الأسرار إلى Git أبداً (الملف مدرج بالفعل داخل `.gitignore` و `.dockerignore`).

---

## 4. أوامر البناء والتشغيل (Build & Run)

### التشغيل في الخلفية (Production Mode):
```bash
docker compose up -d --build
```
يقوم هذا الأمر ببناء صورة الـ Backend وتنزيل صورة Redis ثم تشغيل الخدمتين مع التأكد من جاهزية Redis عبر الـ Healthcheck قبل بدء التطبيق.

### فحص حالة الحاويات (Status):
```bash
docker compose ps
```
ستظهر الحاويتان بالحالة `running` و Redis بالحالة `healthy`.

### متابعة السجلات الحية (Live Logs):
```bash
# متابعة جميع الحاويات
docker compose logs -f

# متابعة سجلات الـ Backend فقط
docker compose logs -f backend

# متابعة سجلات Redis فقط
docker compose logs -f redis
```

---

## 5. إعادة البناء بعد تعديل الكود (Rebuilding)

عند إجراء أي تعديلات في الكود المصدري أو ملفات الحزم:

```bash
docker compose up -d --build backend
```
بفضل الـ Docker Layer Caching، لن يتم إعادة تنزيل مكتبات npm إذا لم يتغير `package.json` أو `package-lock.json`، مما يجعل البناء فائق السرعة.

---

## 6. إيقاف وتشغيل الخدمات (Stop & Restart)

### الإيقاف المؤقت مع الحفاظ على البيانات:
```bash
docker compose stop
```

### إعادة التشغيل:
```bash
docker compose start
```

### الإيقاف وإزالة الحاويات (مع الحفاظ على كاش Redis):
```bash
docker compose down
```

> [!CAUTION]
> **تحذير هام:** لا تستخدم الأمر `docker compose down -v` لأنه سيحذف مجلد التخزين الدائم لـ Redis (`rasid_redis_data`) ويفقد البيانات المؤقتة المحفوظة.

---

## 7. الحفاظ على بيانات Redis (Cache Persistence)

تم ضبط خادم Redis بالأمر:
```text
redis-server --save 60 1 --loglevel warning
```
يقوم هذا الإعداد بحفظ لقطات RDB على القرص الدائم داخل الحجم المسمى `rasid_redis_data` تلقائياً كل 60 ثانية إذا طرأ تغيير على البيانات، مما يضمن استعادة الكاش فوراً بعد إعادة تشغيل السيرفر دون فقدانه.

---

## 8. اختبار والتحقق من عمل Redis والكاش

### 1. التحقق من اتصال Redis داخل الحاوية:
```bash
docker compose exec redis redis-cli ping
# النتيجة المتوقعة: PONG
```

### 2. فحص المفاتيح المخزنة في الكاش:
```bash
docker compose exec redis redis-cli keys "*"
```

### 3. اختبار نقطة نهاية تستخدم الكاش:
* عند إرسال طلب GET عام لأول مرة إلى `/api/lost-phones`، سيقوم الباك إند بالاستعلام من Supabase ثم تخزين النتيجة في Redis.
* عند فحص المفاتيح عبر الأمر السابق ستشاهد مفاتيح مثل:
  ```text
  lost_phones:list:...
  ```
* في الطلب الثاني، سيُجلب الرد فوراً من الكاش دون استهلاك موارد قاعدة البيانات.

### 4. اختبار قدرة النظام على العمل عند انقطاع Redis (Resilience):
إذا تم إيقاف حاوية Redis مؤقتاً:
```bash
docker compose stop redis
```
سيواصل الباك إند العمل بشكل طبيعي وتلقائي عبر استعلام قاعدة البيانات مباشرة دون توقف النظام، بفضل آلية **Silent Degradation** المبرمجة في `src/services/cache.service.js`.

---

## 9. استكشاف الأخطاء الشائعة (Troubleshooting)

| المشكلة | السبب المحتمل | الحل |
| :--- | :--- | :--- |
| `Cannot connect to Redis` في السجلات | اسم المضيف غير صحيح أو Redis غير جاهز | تأكد أن `REDIS_HOST=redis` في ملف `.env`، وافحص جاهزية الحاوية عبر `docker compose ps` |
| خطأ `port is already allocated` على المنفذ 5000 | تطبيق آخر يستعمل المنفذ 5000 على السيرفر | غيّر المنفذ في `.env` مثل: `PORT=5001` ثم أعد التشغيل |
| خطأ في التحقق من متغيرات البيئة عند البدء | نقص أحد المتغيرات الإلزامية مثل `SUPABASE_SERVICE_ROLE_KEY` | تأكد من مطابقة جميع متغيرات `.env` مع النموذج الموضح في `.env.example` |
| البناء يستغرق وقتاً طويلاً | عدم تفعيل التخزين المؤقت للطبقات | تأكد من وجود ملف `.dockerignore` الذي يستبعد `node_modules` محلياً من سياق البناء |

---

## 10. إرشادات النشر الإنتاجي (Production Deployment Best Practices)

1. **وسيط عكسي (Reverse Proxy):**
   * قم بتوجيه الزيارات من المنفذ 80 و 443 عبر Nginx أو Caddy وتمريرها إلى `http://127.0.0.1:5000`.
   * تفعيل شهادة SSL/TLS المجانية عبر Let's Encrypt (Certbot).
2. **الجدار الناري (Firewall):**
   * افتح المنافذ 80 و 443 و 22 (SSH) فقط.
   * لا تفتح المنفذ 6379 أو 5000 للعالم الخارجي، حيث تم ربطهما محلياً لحماية البيانات.
3. **مراقبة الموارد واستمرارية التشغيل:**
   * الحاويات مضبوطة على `restart: unless-stopped` للنهوض التلقائي بعد إعادة تشغيل السيرفر أو تعطل غير متوقع.
