const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

router.get('/plans', (req, res) => {
  const db = getDatabase();
  const plans = db.prepare('SELECT * FROM subscription_plans ORDER BY price_monthly').all();
  res.json({ plans });
});

router.get('/my-subscription', authenticateToken, (req, res) => {
  const db = getDatabase();
  const user = db.prepare('SELECT subscription_status, subscription_end FROM users WHERE id = ?').get(req.user.id);
  res.json({ subscription: user });
});

router.post('/subscribe', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { plan_id, payment_method, card_number, card_expiry, card_cvv, card_name } = req.body;

  if (!plan_id) {
    return res.status(400).json({ error: 'معرف الخطة مطلوب' });
  }

  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(plan_id);
  if (!plan) {
    return res.status(404).json({ error: 'الخطة غير موجودة' });
  }

  const errors = [];
  if (plan.price_monthly > 0) {
    if (!card_number) errors.push('رقم البطاقة مطلوب');
    if (!card_expiry) errors.push('تاريخ انتهاء البطاقة مطلوب');
    if (!card_cvv) errors.push('رمز CVV مطلوب');
    if (!card_name) errors.push('اسم حامل البطاقة مطلوب');

    if (card_number && card_number.replace(/\s/g, '').length < 12) errors.push('رقم البطاقة غير صالح');
    if (card_cvv && card_cvv.length < 3) errors.push('رمز CVV غير صالح');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('، ') });
  }

  const paymentId = uuidv4();
  const maskedCard = card_number ? '**** **** **** ' + card_number.replace(/\s/g, '').slice(-4) : '—';

  db.prepare(`INSERT INTO payments (id, user_id, plan_id, amount, currency, status, payment_method)
    VALUES (?, ?, ?, ?, 'SAR', 'completed', ?)`).run(
    paymentId, req.user.id, plan_id,
    plan.price_monthly, payment_method || 'card'
  );

  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  db.prepare('UPDATE users SET subscription_status = ?, subscription_end = ? WHERE id = ?').run(
    plan.name.toLowerCase() === 'مجاني' ? 'free' : 'premium',
    endDate.toISOString().split('T')[0],
    req.user.id
  );

  res.json({
    message: `تم الاشتراك في خطة "${plan.name}" بنجاح`,
    plan: plan.name,
    amount: plan.price_monthly,
    card: maskedCard,
    valid_until: endDate.toISOString().split('T')[0],
    payment_id: paymentId
  });
});

router.post('/cancel', authenticateToken, (req, res) => {
  const db = getDatabase();
  db.prepare("UPDATE users SET subscription_status = 'free', subscription_end = NULL WHERE id = ?").run(req.user.id);
  res.json({ message: 'تم إلغاء الاشتراك' });
});

module.exports = router;
