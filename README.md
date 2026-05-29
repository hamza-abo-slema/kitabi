# 📚 كتابي — تطبيق الكتب الصوتية

تطبيق كتب صوتية ذكي مع **حماية صوتية ضد تسجيل الشاشة** باستخدام تقنية عكس الطور (Phase Inversion).

## 📥 تحميل التطبيق

| المنصة | الملف | الرابط |
|--------|-------|--------|
| 🪟 Windows | Kitabi.exe | [أحدث إصدار](https://github.com/hamza-abo-slema/kitabi/releases) |
| 📱 Android | Kitabi.apk | [أحدث إصدار](https://github.com/hamza-abo-slema/kitabi/releases) |
| 🌐 Web App (PWA) | — | https://hamza-abo-slema.github.io/kitabi/ |

## 🚀 التشغيل

### نسخة Node.js
```bash
npm install
npm start
```
ثم افتح http://localhost:3000

### نسخة Python
```bash
pip install pyinstaller
python build_app.py
```
التطبيق في مجلد `kitabi app/Kitabi.exe`

## 🛡️ ميزة الحماية الصوتية

عند اكتشاف محاولة تسجيل شاشة، يتم تفعيل قناة صوتية ثانية معكوسة الطور (180 درجة). هذا يؤدي إلى إلغاء الإشارة الصوتية في التسجيل مع بقاء الصوت طبيعياً للمستمع.

## 👤 بيانات الدخول
- **admin@kitabi.app** / **admin123** (مشرف)
- سجل حساب جديد للمستخدم العادي

## 📱 تحويل لـ Android APK

1. اذهب إلى [GitHub Pages](https://hamza-abo-slema.github.io/kitabi/)
2. افتح الموقع على متصفح كروم
3. ستظهر رسالة "تثبيت التطبيق" — اضغط تثبيت (PWA)
4. أو استخدم [PWABuilder](https://pwabuilder.com) وأدخل رابط GitHub Pages
5. حمل ملف APK

## 🏗️ البنية

```
kitabi/
├── server.js          # خادم Node.js
├── server.py          # خادم Python (للـ desktop build)
├── database.js        # قاعدة بيانات SQLite
├── public/            # الملفات الأمامية
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js
│   │   ├── audio-engine.js      # محرك الصوت المزدوج
│   │   ├── detection-engine.js  # كشف تسجيل الشاشة
│   │   └── phase-invert-processor.js  # معالج عكس الطور
│   ├── manifest.json   # PWA manifest
│   └── sw.js           # Service Worker
├── routes/books.js
├── routes/users.js
└── routes/subscriptions.js
```
