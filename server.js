const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { seedInitialData } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use('/audio', express.static(path.join(__dirname, 'audio')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const booksRouter = require('./routes/books');
const usersRouter = require('./routes/users');
const subscriptionsRouter = require('./routes/subscriptions');

app.use('/api/books', booksRouter);
app.use('/api/users', usersRouter);
app.use('/api/subscriptions', subscriptionsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'كتابي', version: '1.0.0' });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'المسار غير موجود' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'الملف كبير جداً، الحد الأقصى 500MB' });
  }
  res.status(500).json({ error: 'حدث خطأ داخلي' });
});

seedInitialData();

app.listen(PORT, () => {
  console.log(`\n  📚 كتابي — تطبيق الكتب الصوتية`);
  console.log(`  ─────────────────────────────`);
  console.log(`  🚀  http://localhost:${PORT}`);
  console.log(`  📧  admin@kitabi.app / admin123`);
  console.log(`  ─────────────────────────────\n`);
});
