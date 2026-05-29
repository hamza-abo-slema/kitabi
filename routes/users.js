const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database');
const { generateToken, authenticateToken } = require('../middleware/auth');

router.post('/register', (req, res) => {
  const db = getDatabase();
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(id, email, passwordHash, name);

  const token = generateToken({ id, email, is_admin: 0 });
  res.status(201).json({ token, user: { id, email, name, subscription_status: 'free' } });
});

router.post('/login', (req, res) => {
  const db = getDatabase();
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      avatar_url: user.avatar_url, subscription_status: user.subscription_status,
      subscription_end: user.subscription_end, is_admin: user.is_admin
    }
  });
});

router.get('/me', authenticateToken, (req, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT id, email, name, avatar_url, subscription_status, subscription_end, is_admin, accessibility_settings, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const libraryCount = db.prepare('SELECT COUNT(*) as count FROM user_library WHERE user_id = ?').get(user.id);
  const bookmarkCount = db.prepare('SELECT COUNT(*) as count FROM user_bookmarks WHERE user_id = ?').get(user.id);
  const progressCount = db.prepare('SELECT COUNT(*) as count FROM listening_progress WHERE user_id = ?').get(user.id);

  res.json({ user, stats: { library: libraryCount.count, bookmarks: bookmarkCount.count, inProgress: progressCount.count } });
});

router.put('/me', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { name, avatar_url, accessibility_settings } = req.body;
  const updates = [];
  const params = [];

  if (name) { updates.push('name = ?'); params.push(name); }
  if (avatar_url !== undefined) { updates.push('avatar_url = ?'); params.push(avatar_url); }
  if (accessibility_settings) { updates.push('accessibility_settings = ?'); params.push(JSON.stringify(accessibility_settings)); }

  if (updates.length > 0) {
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  res.json({ message: 'تم تحديث الملف الشخصي' });
});

router.get('/library', authenticateToken, (req, res) => {
  const db = getDatabase();
  const books = db.prepare(`
    SELECT a.*, ul.added_at FROM user_library ul
    JOIN audiobooks a ON a.id = ul.book_id
    WHERE ul.user_id = ? ORDER BY ul.added_at DESC
  `).all(req.user.id);
  res.json({ books });
});

router.post('/library/:bookId', authenticateToken, (req, res) => {
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM user_library WHERE user_id = ? AND book_id = ?').get(req.user.id, req.params.bookId);
  if (existing) return res.status(409).json({ error: 'الكتاب موجود بالفعل في مكتبتك' });

  db.prepare('INSERT INTO user_library (id, user_id, book_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.bookId);
  res.status(201).json({ message: 'تمت إضافة الكتاب إلى مكتبتك' });
});

router.delete('/library/:bookId', authenticateToken, (req, res) => {
  const db = getDatabase();
  db.prepare('DELETE FROM user_library WHERE user_id = ? AND book_id = ?').run(req.user.id, req.params.bookId);
  res.json({ message: 'تمت إزالة الكتاب من مكتبتك' });
});

router.get('/bookmarks', authenticateToken, (req, res) => {
  const db = getDatabase();
  const bookmarks = db.prepare(`
    SELECT ub.*, a.title, a.author, a.duration_seconds, a.cover_url
    FROM user_bookmarks ub JOIN audiobooks a ON a.id = ub.book_id
    WHERE ub.user_id = ? ORDER BY ub.created_at DESC
  `).all(req.user.id);
  res.json({ bookmarks });
});

router.post('/bookmarks', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { book_id, position_seconds, note } = req.body;
  db.prepare('INSERT OR REPLACE INTO user_bookmarks (id, user_id, book_id, position_seconds, note) VALUES (?, ?, ?, ?, ?)').run(
    uuidv4(), req.user.id, book_id, position_seconds || 0, note || ''
  );
  res.status(201).json({ message: 'تمت إضافة العلامة' });
});

router.get('/progress', authenticateToken, (req, res) => {
  const db = getDatabase();
  const progress = db.prepare(`
    SELECT lp.*, a.title, a.author, a.duration_seconds, a.cover_url
    FROM listening_progress lp JOIN audiobooks a ON a.id = lp.book_id
    WHERE lp.user_id = ? ORDER BY lp.last_listened DESC
  `).all(req.user.id);
  res.json({ progress });
});

router.post('/progress', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { book_id, position_seconds, completed } = req.body;
  db.prepare(`INSERT OR REPLACE INTO listening_progress (id, user_id, book_id, position_seconds, completed, last_listened) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(
    uuidv4(), req.user.id, book_id, position_seconds || 0, completed || 0
  );
  res.json({ message: 'تم حفظ التقدم' });
});

module.exports = router;
