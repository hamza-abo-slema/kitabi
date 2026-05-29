const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'kitabi.db');

let db;

function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      subscription_status TEXT DEFAULT 'free',
      subscription_end DATE NULL,
      is_admin INTEGER DEFAULT 0,
      accessibility_settings TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📚',
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audiobooks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      narrator TEXT DEFAULT '',
      description TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      audio_url TEXT NOT NULL,
      category_id TEXT,
      duration_seconds INTEGER DEFAULT 0,
      listens INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      is_new INTEGER DEFAULT 1,
      rating REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS user_bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      position_seconds REAL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES audiobooks(id),
      UNIQUE(user_id, book_id, position_seconds)
    );

    CREATE TABLE IF NOT EXISTS listening_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      position_seconds REAL DEFAULT 0,
      completed INTEGER DEFAULT 0,
      last_listened DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES audiobooks(id),
      UNIQUE(user_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS user_library (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES audiobooks(id),
      UNIQUE(user_id, book_id)
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price_monthly REAL NOT NULL,
      price_yearly REAL NOT NULL,
      features TEXT DEFAULT '[]',
      is_popular INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'SAR',
      status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'card',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    );

    CREATE TABLE IF NOT EXISTS protection_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      detection_score REAL DEFAULT 0,
      triggered_by TEXT DEFAULT '[]',
      layer_scores TEXT DEFAULT '{}',
      duration_ms INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedInitialData() {
  const db = getDatabase();

  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (categoryCount.count > 0) return;

  const categories = [
    { id: uuidv4(), name: 'أساطير وحكايات', icon: '🏛️', description: 'أساطير وحكايات من الماضي والحاضر' },
    { id: uuidv4(), name: 'أدب وروايات', icon: '📖', description: 'أشهر الروايات العربية والعالمية' },
    { id: uuidv4(), name: 'دينية', icon: '🕌', description: 'كتب دينية وإسلامية' },
    { id: uuidv4(), name: 'تنمية بشرية', icon: '🌱', description: 'تطوير الذات والمهارات' },
    { id: uuidv4(), name: 'علمية', icon: '🔬', description: 'علوم ومعرفة' },
    { id: uuidv4(), name: 'تاريخ', icon: '🏛️', description: 'كتب تاريخية' },
  ];

  const insertCat = db.prepare('INSERT INTO categories (id, name, icon, description) VALUES (?, ?, ?, ?)');
  for (const cat of categories) {
    insertCat.run(cat.id, cat.name, cat.icon, cat.description);
  }

  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const medusaSrc = path.join(__dirname, 'جزء من رأس ميدوسا.mp3');
  const medusaDst = path.join(uploadsDir, 'رأس_ميدوسا.mp3');
  if (fs.existsSync(medusaSrc) && !fs.existsSync(medusaDst)) {
    fs.copyFileSync(medusaSrc, medusaDst);
  }

  const insertBook = db.prepare(`INSERT INTO audiobooks (id, title, author, narrator, description, cover_url, audio_url, category_id, duration_seconds, listens, is_featured, is_new, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  insertBook.run(
    uuidv4(), 'رأس ميدوسا', 'أساطير إغريقية', 'حمزة أبو سليمة',
    'قصة حديثة عن أسطورة رأس ميدوسا. تأخذك في رحلة مشوقة عبر الأساطير الإغريقية، حيث الآلهة والوحوش والأبطال.',
    'https://placehold.co/400x400/7c3aed/ffffff?text=ميدوسا',
    '/uploads/رأس_ميدوسا.mp3', categories[0].id, 1800,
    Math.floor(Math.random() * 1000) + 100,
    1, 1, 4.8
  );

  const plans = [
    { name: 'مجاني', price_m: 0, price_y: 0, features: ['5 كتب شهرياً', 'جودة عادية', 'إعلانات'], popular: 0 },
    { name: 'أساسي', price_m: 19.99, price_y: 199.99, features: ['كتب غير محدودة', 'جودة عالية', 'دون إعلانات', 'حماية صوتية'], popular: 1 },
    { name: 'مميز', price_m: 39.99, price_y: 399.99, features: ['كل ميزات الأساسي', 'تحميل للاستماع دون اتصال', 'دعم فني أولوية', 'محتوى حصري', 'حماية صوتية متقدمة'], popular: 0 },
  ];

  const insertPlan = db.prepare('INSERT INTO subscription_plans (id, name, price_monthly, price_yearly, features, is_popular) VALUES (?, ?, ?, ?, ?, ?)');
  for (const p of plans) {
    insertPlan.run(uuidv4(), p.name, p.price_m, p.price_y, JSON.stringify(p.features), p.popular);
  }

  const adminPass = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name, subscription_status, is_admin) VALUES (?, ?, ?, ?, ?, ?)').run(
    uuidv4(), 'admin@kitabi.app', adminPass, 'مدير النظام', 'premium', 1
  );

  console.log('✓ تم بذر البيانات الأولية بنجاح');
}

module.exports = { getDatabase, seedInitialData };
