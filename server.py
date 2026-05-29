#!/usr/bin/env python3
"""
كتابي — Backend Server
Python 3.14+ with standard library
"""

import http.server
import json
import sqlite3
import hashlib
import hmac
import base64
import uuid
import os
import re
import datetime
import mimetypes
import urllib.parse
import sys
import subprocess
import webbrowser
from pathlib import Path

PORT = 3000
JWT_SECRET = 'kitabi_secure_jwt_key_2024_audio_protection'

if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys._MEIPASS)
    APP_DIR = Path(os.path.dirname(sys.executable))
else:
    BASE_DIR = Path(__file__).parent
    APP_DIR = BASE_DIR

PUBLIC_DIR = BASE_DIR / 'public'
DB_PATH = APP_DIR / 'kitabi.db'
UPLOADS_DIR = APP_DIR / 'uploads'

# ==================== Database ====================

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn

def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, name TEXT NOT NULL,
            avatar_url TEXT DEFAULT '', subscription_status TEXT DEFAULT 'free',
            subscription_end TEXT, is_admin INTEGER DEFAULT 0,
            accessibility_settings TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            icon TEXT DEFAULT '📚', description TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS audiobooks (
            id TEXT PRIMARY KEY, title TEXT NOT NULL,
            author TEXT NOT NULL, narrator TEXT DEFAULT '',
            description TEXT DEFAULT '', cover_url TEXT DEFAULT '',
            audio_url TEXT NOT NULL, category_id TEXT,
            duration_seconds INTEGER DEFAULT 0, listens INTEGER DEFAULT 0,
            is_featured INTEGER DEFAULT 0, is_new INTEGER DEFAULT 1,
            rating REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );
        CREATE TABLE IF NOT EXISTS user_bookmarks (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            book_id TEXT NOT NULL, position_seconds REAL DEFAULT 0,
            note TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (book_id) REFERENCES audiobooks(id)
        );
        CREATE TABLE IF NOT EXISTS listening_progress (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            book_id TEXT NOT NULL, position_seconds REAL DEFAULT 0,
            completed INTEGER DEFAULT 0,
            last_listened DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (book_id) REFERENCES audiobooks(id)
        );
        CREATE TABLE IF NOT EXISTS user_library (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            book_id TEXT NOT NULL, added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (book_id) REFERENCES audiobooks(id)
        );
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            price_monthly REAL NOT NULL, price_yearly REAL NOT NULL,
            features TEXT DEFAULT '[]', is_popular INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            plan_id TEXT NOT NULL, amount REAL NOT NULL,
            currency TEXT DEFAULT 'SAR', status TEXT DEFAULT 'pending',
            payment_method TEXT DEFAULT 'card',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
        );
        CREATE TABLE IF NOT EXISTS protection_logs (
            id TEXT PRIMARY KEY, user_id TEXT,
            detection_score REAL DEFAULT 0,
            triggered_by TEXT DEFAULT '[]',
            layer_scores TEXT DEFAULT '{}',
            duration_ms INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    conn.commit()

    admin_exists = conn.execute("SELECT COUNT(*) as c FROM users WHERE email = 'hamzaAboslema@kitabi.app'").fetchone()['c']
    if admin_exists == 0:
        seed_data(conn)
    conn.close()

def seed_data(conn):
    cat_ids = []
    categories = [
        ('أساطير وحكايات', '🏛️', 'أساطير وحكايات من الماضي والحاضر'),
        ('أدب وروايات', '📖', 'أشهر الروايات العربية والعالمية'),
        ('دينية', '🕌', 'كتب دينية وإسلامية'),
        ('تنمية بشرية', '🌱', 'تطوير الذات والمهارات'),
        ('علمية', '🔬', 'علوم ومعرفة'),
        ('تاريخ', '🏛️', 'كتب تاريخية'),
    ]
    for name, icon, desc in categories:
        cid = str(uuid.uuid4())
        cat_ids.append(cid)
        conn.execute('INSERT OR IGNORE INTO categories (id, name, icon, description) VALUES (?,?,?,?)',
                     (cid, name, icon, desc))

    plans = [
        ('مجاني', 0, 0, ['5 كتب شهرياً', 'جودة عادية', 'إعلانات'], 0),
        ('أساسي', 19.99, 199.99, ['كتب غير محدودة', 'جودة عالية', 'دون إعلانات', 'حماية صوتية'], 1),
        ('مميز', 39.99, 399.99, ['كل ميزات الأساسي', 'تحميل للاستماع دون اتصال', 'دعم فني أولوية', 'محتوى حصري', 'حماية صوتية متقدمة'], 0),
    ]
    for name, pm, py, feats, pop in plans:
        conn.execute('INSERT INTO subscription_plans (id, name, price_monthly, price_yearly, features, is_popular) VALUES (?,?,?,?,?,?)',
                     (str(uuid.uuid4()), name, pm, py, json.dumps(feats), pop))

    medusa_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'جزء من رأس ميدوسا.mp3')
    medusa_dst = UPLOADS_DIR / 'رأس_ميدوسا.mp3'
    if os.path.exists(medusa_src) and not medusa_dst.exists():
        import shutil
        shutil.copy2(medusa_src, str(medusa_dst))

    conn.execute('''INSERT INTO audiobooks
        (id, title, author, narrator, description, cover_url, audio_url, category_id, duration_seconds, listens, is_featured, is_new, rating)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (str(uuid.uuid4()), 'رأس ميدوسا', 'أساطير إغريقية', 'حمزة أبو سليمة',
         'قصة حديثة عن أسطورة رأس ميدوسا. تأخذك في رحلة مشوقة عبر الأساطير الإغريقية، حيث الآلهة والوحوش والأبطال.',
         'https://placehold.co/400x400/7c3aed/ffffff?text=ميدوسا',
         '/uploads/رأس_ميدوسا.mp3', cat_ids[0], 1800,
         500, 1, 1, 4.8))

    admin_pw = hash_password('hamzaAboslema')
    conn.execute('INSERT OR IGNORE INTO users (id, email, password_hash, name, subscription_status, is_admin) VALUES (?,?,?,?,?,?)',
                 (str(uuid.uuid4()), 'hamzaAboslema@kitabi.app', admin_pw, 'حمزة أبو سليمة', 'premium', 1))
    conn.commit()
    print('[OK] تم تهيئة قاعدة البيانات')

# ==================== Auth Helpers ====================

def make_token(user_id, email, is_admin):
    header = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=').decode()
    payload = base64.urlsafe_b64encode(json.dumps({
        'id': user_id, 'email': email, 'is_admin': is_admin,
        'exp': (datetime.datetime.now() + datetime.timedelta(days=7)).timestamp()
    }).encode()).rstrip(b'=').decode()
    sig = hmac.new(JWT_SECRET.encode(), f'{header}.{payload}'.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b'=').decode()
    return f'{header}.{payload}.{sig_b64}'

def verify_token(token):
    try:
        parts = token.split('.')
        if len(parts) != 3: return None
        expected_sig = hmac.new(JWT_SECRET.encode(), f'{parts[0]}.{parts[1]}'.encode(), hashlib.sha256).digest()
        actual_sig = base64.urlsafe_b64decode(parts[2] + '==')
        if not hmac.compare_digest(expected_sig, actual_sig): return None
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + '=='))
        if payload.get('exp', 0) < datetime.datetime.now().timestamp(): return None
        return payload
    except: return None

def hash_password(password):
    return hashlib.sha256(f'{password}_{JWT_SECRET}'.encode()).hexdigest()

def get_user_from_request(req):
    auth = req.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        return verify_token(auth[7:])
    return None

def require_auth(req):
    user = get_user_from_request(req)
    if not user:
        raise PermissionError('الرجاء تسجيل الدخول أولاً')
    return user

def parse_body(req):
    length = int(req.headers.get('Content-Length', 0))
    if length == 0: return {}
    body = req.rfile.read(length)
    ct = req.headers.get('Content-Type', '')
    if 'application/json' in ct:
        return json.loads(body)
    return {}

def parse_multipart(req):
    """Parse multipart form data from request"""
    ct = req.headers.get('Content-Type', '')
    length = int(req.headers.get('Content-Length', 0))
    if length == 0: return {}, {}
    
    bound_match = re.search(r'boundary=(.+)', ct)
    if not bound_match: return {}, {}
    boundary = bound_match.group(1).strip('"').strip("'")
    
    body = req.rfile.read(length)
    if isinstance(body, str):
        body = body.encode('utf-8')
    
    fields = {}
    files = {}
    
    parts = body.split(('--' + boundary).encode())
    for part in parts:
        if not part.strip() or part.strip() == b'--':
            continue
        # Split headers from content
        header_end = part.find(b'\r\n\r\n')
        if header_end == -1: continue
        header_bytes = part[:header_end]
        content = part[header_end+4:]
        # Remove trailing \r\n
        if content.endswith(b'\r\n'):
            content = content[:-2]
        
        headers_str = header_bytes.decode('utf-8', errors='replace')
        disp_match = re.search(r'Content-Disposition:.*\s+name="([^"]+)"', headers_str)
        if not disp_match: continue
        name = disp_match.group(1)
        
        filename_match = re.search(r'filename="([^"]*)"', headers_str)
        if filename_match:
            filename = filename_match.group(1)
            content_type_match = re.search(r'Content-Type:\s*(\S+)', headers_str)
            ftype = content_type_match.group(1) if content_type_match else 'application/octet-stream'
            files[name] = {'filename': filename, 'content': content, 'type': ftype}
        else:
            fields[name] = content.decode('utf-8', errors='replace')
    
    return fields, files

# ==================== HTTP Handler ====================

class KitabiHandler(http.server.BaseHTTPRequestHandler):
    api_routes = []

    def log_message(self, format, *args):
        print(f'  {args[0]} {args[1]} {args[2]}')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path.rstrip('/') or '/'
            query = dict(urllib.parse.parse_qsl(parsed.query))

            if path.startswith('/api/'):
                self.handle_api('GET', path, query)
            else:
                self.serve_static(path)
        except Exception as e:
            self.send_error(500, str(e))

    def do_POST(self):
        try:
            path = self.path.rstrip('/') or '/'
            if path.startswith('/api/'):
                self.handle_api('POST', path, {})
            else:
                self.send_error(404, 'Not Found')
        except PermissionError as e:
            self.send_json({'error': str(e)}, 401)
        except Exception as e:
            self.send_error(500, str(e))

    def do_DELETE(self):
        try:
            path = self.path.rstrip('/') or '/'
            if path.startswith('/api/'):
                self.handle_api('DELETE', path, {})
            else:
                self.send_error(404)
        except PermissionError as e:
            self.send_json({'error': str(e)}, 401)
        except Exception as e:
            self.send_error(500, str(e))

    def do_PUT(self):
        try:
            path = self.path.rstrip('/') or '/'
            if path.startswith('/api/'):
                self.handle_api('PUT', path, {})
            else:
                self.send_error(404)
        except PermissionError as e:
            self.send_json({'error': str(e)}, 401)
        except Exception as e:
            self.send_error(500, str(e))

    def api_echo(self, query):
        body = parse_body(self)
        self.send_json({'echo': body, 'method': self.command, 'path': self.path})

    def handle_api(self, method, path, query):
        routes = {
            'GET': {
                '/api/health': self.api_health,
                '/api/echo': self.api_echo,
                '/api/books': self.api_books_list,
                '/api/books/featured': self.api_books_featured,
                '/api/books/latest': self.api_books_latest,
                '/api/books/popular': self.api_books_popular,
                '/api/books/recommended': self.api_books_recommended,
                '/api/books/categories': self.api_categories_list,
                '/api/subscriptions/plans': self.api_plans_list,
                '/api/users/me': self.api_user_me,
                '/api/users/library': self.api_user_library,
                '/api/users/bookmarks': self.api_user_bookmarks,
                '/api/users/progress': self.api_user_progress,
                '/api/subscriptions/my-subscription': self.api_my_subscription,
            },
            'POST': {
                '/api/echo': self.api_echo,
                '/api/books': self.api_add_book,
                '/api/users/register': self.api_register,
                '/api/users/login': self.api_login,
                '/api/users/library': self.api_add_to_library,
                '/api/users/bookmarks': self.api_add_bookmark,
                '/api/users/progress': self.api_save_progress,
                '/api/subscriptions/subscribe': self.api_subscribe,
                '/api/subscriptions/cancel': self.api_cancel_subscription,
                '/api/books/protection-log': self.api_protection_log,
            },
            'DELETE': {},
            'PUT': {
                '/api/users/me': self.api_update_profile,
            }
        }

        # Handle parameterized routes like /api/books/:id, /api/books/categories/:id
        handlers = routes.get(method, {})

        if path in handlers:
            handlers[path](query)
            return

        if method == 'GET':
            # /api/books/categories/<id>
            m = re.match(r'^/api/books/categories/([^/]+)$', path)
            if m:
                self.api_category_books(m.group(1))
                return
            # /api/books/<id>
            m = re.match(r'^/api/books/([^/]+)$', path)
            if m:
                self.api_book_detail(m.group(1))
                return

        if method == 'POST':
            # /api/users/library/<bookId>
            m = re.match(r'^/api/users/library/([^/]+)$', path)
            if m:
                self.api_add_to_library(m.group(1))
                return
            # /api/books/<id>/listen
            m = re.match(r'^/api/books/([^/]+)/listen$', path)
            if m:
                self.api_book_listen(m.group(1))
                return

        if method == 'DELETE':
            m = re.match(r'^/api/users/library/([^/]+)$', path)
            if m:
                self.api_remove_from_library(m.group(1))
                return

        self.send_json({'error': 'المسار غير موجود'}, 404)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path):
        if path == '/': path = '/index.html'
        rel = path.lstrip('/')

        if rel.startswith('uploads/'):
            file_path = UPLOADS_DIR / rel[len('uploads/'):]
        else:
            file_path = PUBLIC_DIR / rel

        if not file_path.exists() or not file_path.is_file():
            file_path = PUBLIC_DIR / 'index.html'

        content_type, _ = mimetypes.guess_type(str(file_path))
        if content_type is None:
            content_type = 'application/octet-stream'

        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', f'{content_type}; charset=utf-8')
        self.send_header('Content-Length', len(data))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    # ==================== API Handlers ====================

    def api_health(self, query):
        self.send_json({'status': 'ok', 'app': 'كتابي', 'version': '1.0.0'})

    def api_books_list(self, query):
        conn = get_db()
        page = int(query.get('page', 1))
        limit = int(query.get('limit', 20))
        offset = (page - 1) * limit
        category = query.get('category')
        search = query.get('search')
        sort = query.get('sort', 'created_at')

        where = 'WHERE 1=1'
        params = []
        if category:
            where += ' AND category_id = ?'
            params.append(category)
        if search:
            where += ' AND (title LIKE ? OR author LIKE ? OR narrator LIKE ?)'
            s = f'%{search}%'
            params.extend([s, s, s])

        order = 'ORDER BY created_at DESC'
        if sort == 'listens': order = 'ORDER BY listens DESC'
        elif sort == 'rating': order = 'ORDER BY rating DESC'
        elif sort == 'title': order = 'ORDER BY title ASC'

        books = [dict(r) for r in conn.execute(f'SELECT * FROM audiobooks {where} {order} LIMIT ? OFFSET ?', (*params, limit, offset)).fetchall()]
        total = conn.execute(f'SELECT COUNT(*) as count FROM audiobooks {where}', params).fetchone()['count']
        conn.close()
        self.send_json({'books': books, 'total': total, 'page': page, 'limit': limit})

    def api_add_book(self, query):
        user = require_auth(self)
        if not user.get('is_admin'):
            self.send_json({'error': 'غير مصرح'}, 403)
            return
        fields, files = parse_multipart(self)
        title = fields.get('title', '').strip()
        author = fields.get('author', '').strip()
        if not title or not author:
            self.send_json({'error': 'العنوان والمؤلف مطلوبان'}, 400)
            return
        narrator = fields.get('narrator', '').strip()
        description = fields.get('description', '').strip()
        category_id = fields.get('category_id', '').strip() or None
        duration_seconds = int(fields.get('duration_seconds', 0))
        book_id = str(uuid.uuid4())
        audio_url = ''
        cover_url = ''
        if 'audio' in files:
            fname = f'{book_id}_{files["audio"]["filename"]}'
            ap = UPLOADS_DIR / fname
            ap.write_bytes(files['audio']['content'])
            audio_url = f'/uploads/{fname}'
        if 'cover' in files:
            fname = f'{book_id}_cover_{files["cover"]["filename"]}'
            cp = UPLOADS_DIR / fname
            cp.write_bytes(files['cover']['content'])
            cover_url = f'/uploads/{fname}'
        if not audio_url:
            self.send_json({'error': 'الملف الصوتي مطلوب'}, 400)
            return
        conn = get_db()
        conn.execute('''INSERT INTO audiobooks
            (id, title, author, narrator, description, category_id, audio_url, cover_url, duration_seconds, is_new)
            VALUES (?,?,?,?,?,?,?,?,?,1)''',
            (book_id, title, author, narrator, description, category_id, audio_url, cover_url, duration_seconds))
        conn.commit()
        conn.close()
        self.send_json({'success': True, 'message': f'تم إضافة "{title}" بنجاح', 'book_id': book_id}, 201)

    def api_books_featured(self, query):
        conn = get_db()
        books = [dict(r) for r in conn.execute('SELECT * FROM audiobooks WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 10').fetchall()]
        conn.close()
        self.send_json({'books': books})

    def api_books_latest(self, query):
        conn = get_db()
        books = [dict(r) for r in conn.execute('SELECT * FROM audiobooks ORDER BY created_at DESC LIMIT 10').fetchall()]
        conn.close()
        self.send_json({'books': books})

    def api_books_popular(self, query):
        conn = get_db()
        books = [dict(r) for r in conn.execute('SELECT * FROM audiobooks ORDER BY listens DESC LIMIT 10').fetchall()]
        conn.close()
        self.send_json({'books': books})

    def api_books_recommended(self, query):
        conn = get_db()
        books = [dict(r) for r in conn.execute('SELECT * FROM audiobooks ORDER BY rating DESC, listens DESC LIMIT 10').fetchall()]
        conn.close()
        self.send_json({'books': books})

    def api_book_detail(self, book_id):
        conn = get_db()
        book = conn.execute('SELECT * FROM audiobooks WHERE id = ?', (book_id,)).fetchone()
        if not book:
            conn.close()
            self.send_json({'error': 'الكتاب غير موجود'}, 404)
            return
        category = conn.execute('SELECT * FROM categories WHERE id = ?', (book['category_id'],)).fetchone()
        conn.close()
        self.send_json({'book': dict(book), 'category': dict(category) if category else None})

    def api_book_listen(self, book_id):
        conn = get_db()
        conn.execute('UPDATE audiobooks SET listens = listens + 1 WHERE id = ?', (book_id,))
        conn.commit()
        conn.close()
        self.send_json({'success': True})

    def api_categories_list(self, query):
        conn = get_db()
        cats = conn.execute('''
            SELECT c.*, (SELECT COUNT(*) FROM audiobooks WHERE category_id = c.id) as book_count
            FROM categories c ORDER BY c.name
        ''').fetchall()
        conn.close()
        self.send_json({'categories': [dict(c) for c in cats]})

    def api_category_books(self, cat_id):
        conn = get_db()
        cat = conn.execute('SELECT * FROM categories WHERE id = ?', (cat_id,)).fetchone()
        if not cat:
            conn.close()
            self.send_json({'error': 'التصنيف غير موجود'}, 404)
            return
        books = [dict(r) for r in conn.execute('SELECT * FROM audiobooks WHERE category_id = ? ORDER BY created_at DESC', (cat_id,)).fetchall()]
        conn.close()
        self.send_json({'category': dict(cat), 'books': books})

    def api_plans_list(self, query):
        conn = get_db()
        plans = [dict(r) for r in conn.execute('SELECT * FROM subscription_plans ORDER BY price_monthly').fetchall()]
        conn.close()
        self.send_json({'plans': plans})

    def api_register(self, query):
        body = parse_body(self)
        email = body.get('email', '').strip()
        password = body.get('password', '')
        name = body.get('name', '').strip()

        if not email or not password or not name:
            self.send_json({'error': 'جميع الحقول مطلوبة'}, 400)
            return

        conn = get_db()
        existing = conn.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
        if existing:
            conn.close()
            self.send_json({'error': 'البريد الإلكتروني مسجل مسبقاً'}, 409)
            return

        uid = str(uuid.uuid4())
        pw_hash = hash_password(password)
        conn.execute('INSERT INTO users (id, email, password_hash, name) VALUES (?,?,?,?)', (uid, email, pw_hash, name))
        conn.commit()
        conn.close()

        token = make_token(uid, email, 0)
        self.send_json({'token': token, 'user': {'id': uid, 'email': email, 'name': name, 'subscription_status': 'free'}}, 201)

    def api_login(self, query):
        body = parse_body(self)
        email = body.get('email', '').strip()
        password = body.get('password', '')

        if not email or not password:
            self.send_json({'error': 'البريد الإلكتروني وكلمة المرور مطلوبان'}, 400)
            return

        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        if not user or user['password_hash'] != hash_password(password):
            conn.close()
            self.send_json({'error': 'بيانات الدخول غير صحيحة'}, 401)
            return

        conn.close()
        token = make_token(user['id'], user['email'], user['is_admin'])
        self.send_json({'token': token, 'user': {
            'id': user['id'], 'email': user['email'], 'name': user['name'],
            'avatar_url': user['avatar_url'], 'subscription_status': user['subscription_status'],
            'subscription_end': user['subscription_end'], 'is_admin': user['is_admin']
        }})

    def api_user_me(self, query):
        user = get_user_from_request(self)
        if not user:
            self.send_json({'user': None})
            return
        conn = get_db()
        u = conn.execute('SELECT id, email, name, avatar_url, subscription_status, subscription_end, is_admin, accessibility_settings, created_at FROM users WHERE id = ?', (user['id'],)).fetchone()
        if not u:
            conn.close()
            self.send_json({'user': None})
            return
        lib = conn.execute('SELECT COUNT(*) as c FROM user_library WHERE user_id = ?', (user['id'],)).fetchone()['c']
        bm = conn.execute('SELECT COUNT(*) as c FROM user_bookmarks WHERE user_id = ?', (user['id'],)).fetchone()['c']
        prog = conn.execute('SELECT COUNT(*) as c FROM listening_progress WHERE user_id = ?', (user['id'],)).fetchone()['c']
        conn.close()
        self.send_json({'user': dict(u), 'stats': {'library': lib, 'bookmarks': bm, 'inProgress': prog}})

    def api_update_profile(self, query):
        user = require_auth(self)
        body = parse_body(self)
        conn = get_db()
        updates = []
        params = []
        if 'name' in body:
            updates.append('name = ?'); params.append(body['name'])
        if 'accessibility_settings' in body:
            updates.append('accessibility_settings = ?'); params.append(json.dumps(body['accessibility_settings']))
        if updates:
            params.append(user['id'])
            conn.execute(f'UPDATE users SET {", ".join(updates)} WHERE id = ?', params)
            conn.commit()
        conn.close()
        self.send_json({'message': 'تم تحديث الملف الشخصي'})

    def api_user_library(self, query):
        user = get_user_from_request(self)
        if not user:
            self.send_json({'books': []})
            return
        conn = get_db()
        books = [dict(r) for r in conn.execute('''
            SELECT a.*, ul.added_at FROM user_library ul
            JOIN audiobooks a ON a.id = ul.book_id
            WHERE ul.user_id = ? ORDER BY ul.added_at DESC
        ''', (user['id'],)).fetchall()]
        conn.close()
        self.send_json({'books': books})

    def api_add_to_library(self, book_id):
        user = require_auth(self)
        conn = get_db()
        existing = conn.execute('SELECT id FROM user_library WHERE user_id = ? AND book_id = ?', (user['id'], book_id)).fetchone()
        if existing:
            conn.close()
            self.send_json({'error': 'الكتاب موجود بالفعل في مكتبتك'}, 409)
            return
        conn.execute('INSERT INTO user_library (id, user_id, book_id) VALUES (?,?,?)', (str(uuid.uuid4()), user['id'], book_id))
        conn.commit()
        conn.close()
        self.send_json({'message': 'تمت إضافة الكتاب إلى مكتبتك'}, 201)

    def api_remove_from_library(self, book_id):
        user = require_auth(self)
        conn = get_db()
        conn.execute('DELETE FROM user_library WHERE user_id = ? AND book_id = ?', (user['id'], book_id))
        conn.commit()
        conn.close()
        self.send_json({'message': 'تمت إزالة الكتاب من مكتبتك'})

    def api_user_bookmarks(self, query):
        user = get_user_from_request(self)
        if not user:
            self.send_json({'bookmarks': []})
            return
        conn = get_db()
        bms = [dict(r) for r in conn.execute('''
            SELECT ub.*, a.title, a.author, a.duration_seconds, a.cover_url
            FROM user_bookmarks ub JOIN audiobooks a ON a.id = ub.book_id
            WHERE ub.user_id = ? ORDER BY ub.created_at DESC
        ''', (user['id'],)).fetchall()]
        conn.close()
        self.send_json({'bookmarks': bms})

    def api_add_bookmark(self, query):
        user = require_auth(self)
        body = parse_body(self)
        conn = get_db()
        conn.execute('INSERT OR REPLACE INTO user_bookmarks (id, user_id, book_id, position_seconds, note) VALUES (?,?,?,?,?)',
                     (str(uuid.uuid4()), user['id'], body.get('book_id'), body.get('position_seconds', 0), body.get('note', '')))
        conn.commit()
        conn.close()
        self.send_json({'message': 'تمت إضافة العلامة'}, 201)

    def api_user_progress(self, query):
        user = get_user_from_request(self)
        if not user:
            self.send_json({'progress': []})
            return
        conn = get_db()
        items = [dict(r) for r in conn.execute('''
            SELECT lp.*, a.title, a.author, a.duration_seconds, a.cover_url
            FROM listening_progress lp JOIN audiobooks a ON a.id = lp.book_id
            WHERE lp.user_id = ? ORDER BY lp.last_listened DESC
        ''', (user['id'],)).fetchall()]
        conn.close()
        self.send_json({'progress': items})

    def api_save_progress(self, query):
        user = require_auth(self)
        body = parse_body(self)
        conn = get_db()
        conn.execute('''INSERT OR REPLACE INTO listening_progress (id, user_id, book_id, position_seconds, completed, last_listened)
                        VALUES (?,?,?,?,?, CURRENT_TIMESTAMP)''',
                     (str(uuid.uuid4()), user['id'], body.get('book_id'), body.get('position_seconds', 0), body.get('completed', 0)))
        conn.commit()
        conn.close()
        self.send_json({'message': 'تم حفظ التقدم'})

    def api_my_subscription(self, query):
        user = get_user_from_request(self)
        if not user:
            self.send_json({'subscription': None})
            return
        conn = get_db()
        u = conn.execute('SELECT subscription_status, subscription_end FROM users WHERE id = ?', (user['id'],)).fetchone()
        conn.close()
        self.send_json({'subscription': dict(u) if u else None})

    def api_subscribe(self, query):
        user = require_auth(self)
        body = parse_body(self)
        plan_id = body.get('plan_id')
        if not plan_id:
            self.send_json({'error': 'معرف الخطة مطلوب'}, 400)
            return

        conn = get_db()
        plan = conn.execute('SELECT * FROM subscription_plans WHERE id = ?', (plan_id,)).fetchone()
        if not plan:
            conn.close()
            self.send_json({'error': 'الخطة غير موجودة'}, 404)
            return

        amount = plan['price_monthly']
        errors = []
        if amount > 0:
            card = body.get('card_number', '')
            cvv = body.get('card_cvv', '')
            expiry = body.get('card_expiry', '')
            cname = body.get('card_name', '')
            if not card: errors.append('رقم البطاقة مطلوب')
            if not expiry: errors.append('تاريخ انتهاء البطاقة مطلوب')
            if not cvv: errors.append('رمز CVV مطلوب')
            if not cname: errors.append('اسم حامل البطاقة مطلوب')
            card_clean = card.replace(' ', '')
            if card_clean and len(card_clean) < 12: errors.append('رقم البطاقة غير صالح')
            if cvv and len(cvv) < 3: errors.append('رمز CVV غير صالح')

        if errors:
            conn.close()
            self.send_json({'error': ' — '.join(errors)}, 400)

        payment_id = str(uuid.uuid4())
        masked = card[-4:] if body.get('card_number') else '—'
        conn.execute('INSERT INTO payments (id, user_id, plan_id, amount, currency, status, payment_method) VALUES (?,?,?,?,?,?,?)',
                     (payment_id, user['id'], plan_id, amount, 'SAR', 'completed', body.get('payment_method', 'card')))

        end_date = (datetime.datetime.now() + datetime.timedelta(days=365)).strftime('%Y-%m-%d')
        conn.execute('UPDATE users SET subscription_status = ?, subscription_end = ? WHERE id = ?',
                     ('premium', end_date, user['id']))
        conn.commit()
        conn.close()

        self.send_json({
            'message': f'تم الاشتراك في خطة "{plan["name"]}" بنجاح',
            'plan': plan['name'], 'amount': amount,
            'card': f'**** **** **** {masked}',
            'valid_until': end_date, 'payment_id': payment_id
        })

    def api_cancel_subscription(self, query):
        user = require_auth(self)
        conn = get_db()
        conn.execute("UPDATE users SET subscription_status = 'free', subscription_end = NULL WHERE id = ?", (user['id'],))
        conn.commit()
        conn.close()
        self.send_json({'message': 'تم إلغاء الاشتراك'})

    def api_protection_log(self, query):
        body = parse_body(self)
        conn = get_db()
        user = get_user_from_request(self)
        uid = user['id'] if user else None
        conn.execute('INSERT INTO protection_logs (id, user_id, detection_score, triggered_by, layer_scores, duration_ms) VALUES (?,?,?,?,?,?)',
                     (str(uuid.uuid4()), uid, body.get('detection_score', 0),
                      body.get('triggered_by', '[]'), body.get('layer_scores', '{}'), body.get('duration_ms', 0)))
        conn.commit()
        conn.close()
        self.send_json({'success': True})

# ==================== Main ====================

if __name__ == '__main__':
    try:
        if sys.stdout.encoding != 'utf-8':
            sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    print('┌─────────────────────────────────────────┐')
    print('│         📚 كتابي — Kitabi               │')
    print('│     تطبيق الكتب الصوتية الذكي           │')
    print('├─────────────────────────────────────────┤')
    print(f'│  الخادم: http://localhost:{PORT}        │')
    print('│  البريد: hamzaAboslema@kitabi.app         │')
    print('│  كلمة المرور: hamzaAboslema              │')
    print('├─────────────────────────────────────────┤')
    print('│  اضغط Ctrl+C للإيقاف                    │')
    print('└─────────────────────────────────────────┘\n')

    init_db()

    try:
        import subprocess
        url = f'http://localhost:{PORT}'
        edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
        chrome = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
        if os.path.exists(edge):
            subprocess.Popen([edge, f'--app={url}', '--window-size=1200,800', '--no-first-run'], shell=False)
        elif os.path.exists(chrome):
            subprocess.Popen([chrome, f'--app={url}', '--window-size=1200,800', '--no-first-run'], shell=False)
        else:
            webbrowser.open(url)
    except Exception as e:
        print(f'[WARN] Browser launch failed: {e}')

    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), KitabiHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[Kitabi] إيقاف الخادم...')
        server.shutdown()
