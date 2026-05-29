const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kitabi_secure_jwt_key_2024_audio_protection';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.is_admin },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'الرجاء تسجيل الدخول أولاً' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجدداً' });
    }
    req.user = user;
    next();
  });
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) req.user = user;
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'غير مصرح لك بهذا الإجراء' });
  }
  next();
}

module.exports = { generateToken, authenticateToken, optionalAuth, requireAdmin };
