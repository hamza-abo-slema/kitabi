const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.opus', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('صيغة الملف غير مدعومة'));
  }
});

router.get('/', optionalAuth, (req, res) => {
  const db = getDatabase();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const category = req.query.category;
  const search = req.query.search;
  const sort = req.query.sort || 'created_at';

  let where = 'WHERE 1=1';
  let params = [];

  if (category) {
    where += ' AND category_id = ?';
    params.push(category);
  }

  if (search) {
    where += ' AND (title LIKE ? OR author LIKE ? OR narrator LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  let order = 'ORDER BY created_at DESC';
  if (sort === 'listens') order = 'ORDER BY listens DESC';
  if (sort === 'rating') order = 'ORDER BY rating DESC';
  if (sort === 'title') order = 'ORDER BY title ASC';

  const books = db.prepare(`SELECT * FROM audiobooks ${where} ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM audiobooks ${where}`).get(...params);

  res.json({ books, total: total.count, page, limit });
});

router.get('/featured', (req, res) => {
  const db = getDatabase();
  const books = db.prepare('SELECT * FROM audiobooks WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 10').all();
  res.json({ books });
});

router.get('/latest', (req, res) => {
  const db = getDatabase();
  const books = db.prepare('SELECT * FROM audiobooks ORDER BY created_at DESC LIMIT 10').all();
  res.json({ books });
});

router.get('/popular', (req, res) => {
  const db = getDatabase();
  const books = db.prepare('SELECT * FROM audiobooks ORDER BY listens DESC LIMIT 10').all();
  res.json({ books });
});

router.get('/recommended', optionalAuth, (req, res) => {
  const db = getDatabase();
  const books = db.prepare('SELECT * FROM audiobooks ORDER BY rating DESC, listens DESC LIMIT 10').all();
  res.json({ books });
});

router.get('/categories', (req, res) => {
  const db = getDatabase();
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM audiobooks WHERE category_id = c.id) as book_count
    FROM categories c ORDER BY c.name
  `).all();
  res.json({ categories });
});

router.get('/categories/:id', (req, res) => {
  const db = getDatabase();
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'التصنيف غير موجود' });
  const books = db.prepare('SELECT * FROM audiobooks WHERE category_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ category, books });
});

router.get('/:id', (req, res) => {
  const db = getDatabase();
  const book = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: 'الكتاب غير موجود' });
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(book.category_id);
  res.json({ book, category });
});

router.post('/:id/listen', (req, res) => {
  const db = getDatabase();
  db.prepare('UPDATE audiobooks SET listens = listens + 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

function generateWavFile(durationSec, filePath) {
  const sampleRate = 22050;
  const numSamples = Math.max(durationSec * sampleRate, sampleRate * 5);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = 220 + (i / numSamples) * 440;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.25;
    const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    buf.writeInt16LE(Math.round(val), 44 + i * 2);
  }
  require('fs').writeFileSync(filePath, buf);
}

router.post('/', authenticateToken, requireAdmin, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), (req, res) => {
  const db = getDatabase();
  const { title, author, narrator, description, category_id, duration_seconds } = req.body;

  const id = uuidv4();
  const coverUrl = req.files?.cover?.[0] ? `/uploads/${req.files.cover[0].filename}` : `https://placehold.co/400x400/4f46e5/ffffff?text=${encodeURIComponent(title.substring(0, 3))}`;

  let audioUrl;
  if (req.files?.audio?.[0]) {
    audioUrl = `/uploads/${req.files.audio[0].filename}`;
  } else {
    const wavName = `${uuidv4()}.wav`;
    const wavPath = path.join(__dirname, '..', 'public', 'uploads', wavName);
    generateWavFile(30, wavPath);
    audioUrl = `/uploads/${wavName}`;
  }

  db.prepare(`INSERT INTO audiobooks (id, title, author, narrator, description, cover_url, audio_url, category_id, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, title, author, narrator || '', description || '', coverUrl, audioUrl, category_id, parseInt(duration_seconds) || 0
  );

  res.status(201).json({ id, message: 'تمت إضافة الكتاب بنجاح' });
});

router.post('/protection-log', (req, res) => {
  const db = getDatabase();
  const { detection_score, triggered_by, layer_scores, duration_ms } = req.body;
  const { v4: uuidv4 } = require('uuid');
  db.prepare('INSERT INTO protection_logs (id, detection_score, triggered_by, layer_scores, duration_ms) VALUES (?, ?, ?, ?, ?)').run(
    uuidv4(), detection_score || 0, triggered_by || '[]', layer_scores || '{}', duration_ms || 0
  );
  res.json({ success: true });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDatabase();
  db.prepare('DELETE FROM audiobooks WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف الكتاب' });
});

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'غير مصرح' });
  }
  next();
}

module.exports = router;
