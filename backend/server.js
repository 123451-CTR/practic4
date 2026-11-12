const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { db, seed } = require('./db');

const app = express();
const SECRET = 'dev_secret';
const ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5500';
seed();

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const sign = u => jwt.sign({ id: u.id, role: u.role, login: u.login }, SECRET, { expiresIn: '7d' });
const auth = (req, res, next) => {
  try { req.user = jwt.verify(req.cookies.token || '', SECRET); next(); }
  catch { res.status(401).json({ error: 'Не авторизован' }); }
};
const admin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Только админ' });
const errs = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array().map(x => ({ field: x.path, msg: x.msg })) });
  next();
};

const regRules = [
  body('login').matches(/^[A-Za-z0-9]{6,}$/).withMessage('Логин: латиница/цифры, мин 6'),
  body('password').isLength({ min: 8 }).withMessage('Пароль: мин 8'),
  body('full_name').matches(/^[А-Яа-яЁё\s]+$/).withMessage('ФИО: кириллица'),
  body('phone').matches(/^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/).withMessage('Телефон: 8(XXX)XXX-XX-XX'),
  body('email').isEmail().withMessage('Почта некорректна'),
];
app.post('/api/register', regRules, errs, (req, res) => {
  const { login, password, full_name, phone, email } = req.body;
  if (db.prepare('SELECT id FROM users WHERE login=?').get(login))
    return res.status(409).json({ error: 'Логин занят' });
  const info = db.prepare('INSERT INTO users(login,password_hash,full_name,phone,email) VALUES(?,?,?,?,?)')
    .run(login, bcrypt.hashSync(password, 10), full_name, phone, email);
  const u = { id: info.lastInsertRowid, login, role: 'user' };
  res.cookie('token', sign(u), { httpOnly: true, sameSite: 'lax', maxAge: 7e8 });
  res.json({ ok: true, user: u });
});

app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE login=?').get(req.body.login);
  if (!u || !bcrypt.compareSync(req.body.password, u.password_hash))
    return res.status(401).json({ error: 'Неверный логин/пароль' });
  res.cookie('token', sign(u), { httpOnly: true, sameSite: 'lax', maxAge: 7e8 });
  res.json({ ok: true, user: { id: u.id, login: u.login, role: u.role, full_name: u.full_name } });
});

app.post('/api/logout', (_q, r) => { r.clearCookie('token'); r.json({ ok: true }); });
app.get('/api/me', auth, (req, res) =>
  res.json(db.prepare('SELECT id,login,full_name,phone,email,role FROM users WHERE id=?').get(req.user.id)));

app.get('/api/products', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  res.json(db.prepare('SELECT * FROM products WHERE title LIKE ?').all(q));
});
app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Не найден' });
  p.reviews = db.prepare('SELECT r.*,u.full_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE product_id=?').all(p.id);
  res.json(p);
});

const up = multer({ dest: 'uploads/', limits: { fileSize: 3e6 } });
app.post('/api/products', auth, admin, up.single('image'), (req, res) => {
  const { title, price, stock, description, category } = req.body;
  const info = db.prepare('INSERT INTO products(title,description,price,stock,category,image) VALUES(?,?,?,?,?,?)')
    .run(title, description || '', +price, +stock, category || '', req.file ? '/uploads/' + req.file.filename : null);
  res.json({ id: info.lastInsertRowid });
});

app.get('/api/cart', auth, (req, res) => {
  const items = db.prepare(`SELECT c.id,c.qty,p.id product_id,p.title,p.price,p.image,p.stock
    FROM cart c JOIN products p ON p.id=c.product_id WHERE c.user_id=?`).all(req.user.id);
  res.json({ items, total: items.reduce((s, i) => s + i.price * i.qty, 0) });
});
app.post('/api/cart', auth, (req, res) => {
  const { product_id, qty = 1 } = req.body;
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(product_id);
  if (!p || p.stock < qty) return res.status(409).json({ error: 'Нет на складе' });
  const ex = db.prepare('SELECT * FROM cart WHERE user_id=? AND product_id=?').get(req.user.id, product_id);
  if (ex) db.prepare('UPDATE cart SET qty=qty+? WHERE id=?').run(qty, ex.id);
  else db.prepare('INSERT INTO cart(user_id,product_id,qty) VALUES(?,?,?)').run(req.user.id, product_id, qty);
  res.json({ ok: true });
});
app.put('/api/cart/:id', auth, (req, res) => {
  const q = Math.max(0, +req.body.qty);
  q === 0
    ? db.prepare('DELETE FROM cart WHERE id=? AND user_id=?').run(req.params.id, req.user.id)
    : db.prepare('UPDATE cart SET qty=? WHERE id=? AND user_id=?').run(q, req.params.id, req.user.id);
  res.json({ ok: true });
});
app.delete('/api/cart/:id', auth, (req, res) => {
  db.prepare('DELETE FROM cart WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/promo', (req, res) => {
  const p = db.prepare('SELECT * FROM promos WHERE code=? AND active=1').get(req.body.code);
  p ? res.json({ code: p.code, percent: p.percent }) : res.status(404).json({ error: 'Не найден' });
});

app.post('/api/checkout', auth, (req, res) => {
  const { delivery_method, delivery_date, payment_method, promo_code } = req.body;
  if (!delivery_method || !delivery_date || !payment_method)
    return res.status(422).json({ error: 'Заполните все поля' });
  const items = db.prepare(`SELECT c.qty,p.id product_id,p.title,p.price,p.stock
    FROM cart c JOIN products p ON p.id=c.product_id WHERE c.user_id=?`).all(req.user.id);
  if (!items.length) return res.status(400).json({ error: 'Корзина пуста' });
  for (const i of items)
    if (i.stock < i.qty) return res.status(409).json({ error: `Мало «${i.title}»` });

  let disc = 0, promo = null;
  if (promo_code) {
    promo = db.prepare('SELECT * FROM promos WHERE code=? AND active=1').get(promo_code);
    if (!promo) return res.status(400).json({ error: 'Промокод недействителен' });
    disc = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * promo.percent / 100);
  }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0) - disc;

  const tx = db.transaction(() => {
    const o = db.prepare(`INSERT INTO orders(user_id,status,total,delivery_method,delivery_date,
      payment_method,promo_code,discount) VALUES(?,?,?,?,?,?,?,?)`)
      .run(req.user.id, 'Новый', total, delivery_method, delivery_date, payment_method, promo?.code || null, disc);
    const ins = db.prepare('INSERT INTO order_items(order_id,product_id,title,price,qty) VALUES(?,?,?,?,?)');
    const dec = db.prepare('UPDATE products SET stock=stock-? WHERE id=?');
    for (const i of items) { ins.run(o.lastInsertRowid, i.product_id, i.title, i.price, i.qty); dec.run(i.qty, i.product_id); }
    db.prepare('DELETE FROM cart WHERE user_id=?').run(req.user.id);
    return o.lastInsertRowid;
  });
  const id = tx();
  res.json({ ok: true, order_id: id, total });
});

app.get('/api/orders/my', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  for (const o of orders) o.items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
  res.json(orders);
});

app.post('/api/reviews', auth, (req, res) => {
  const { product_id, rating, comment } = req.body;
  if (!(rating >= 1 && rating <= 5)) return res.status(422).json({ error: 'Оценка 1–5' });
  const bought = db.prepare(`SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE o.user_id=? AND oi.product_id=? AND o.status='Завершено' LIMIT 1`).get(req.user.id, product_id);
  if (!bought) return res.status(403).json({ error: 'Только после завершённого заказа' });
  try { db.prepare('INSERT INTO reviews(product_id,user_id,rating,comment) VALUES(?,?,?,?)')
        .run(product_id, req.user.id, rating, comment || ''); }
  catch { return res.status(409).json({ error: 'Уже оставлен' }); }
  res.json({ ok: true });
});

app.get('/api/wishlist', auth, (req, res) =>
  res.json(db.prepare('SELECT p.* FROM wishlist w JOIN products p ON p.id=w.product_id WHERE w.user_id=?').all(req.user.id)));
app.post('/api/wishlist', auth, (req, res) => {
  const { product_id } = req.body;
  const ex = db.prepare('SELECT id FROM wishlist WHERE user_id=? AND product_id=?').get(req.user.id, product_id);
  if (ex) { db.prepare('DELETE FROM wishlist WHERE id=?').run(ex.id); return res.json({ added: false }); }
  db.prepare('INSERT INTO wishlist(user_id,product_id) VALUES(?,?)').run(req.user.id, product_id);
  res.json({ added: true });
});

app.get('/api/admin/orders', auth, admin, (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT o.*, u.login FROM orders o JOIN users u ON u.id=o.user_id';
  const pr = [];
  if (status && status !== 'all') { sql += ' WHERE o.status=?'; pr.push(status); }
  sql += ' ORDER BY o.id DESC';
  const orders = db.prepare(sql).all(...pr);
  for (const o of orders) o.items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
  res.json(orders);
});
app.post('/api/admin/orders/status', auth, admin, (req, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !status) return res.status(422).json({ error: 'ids/status' });
  const upd = db.prepare('UPDATE orders SET status=? WHERE id=?');
  db.transaction(() => ids.forEach(id => upd.run(status, id)))();
  res.json({ ok: true, updated: ids.length });
});

const cache = new Map();
app.use('/api/products', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const hit = cache.get(req.originalUrl);
  if (hit) { res.set('X-Cache', 'HIT'); return res.json(hit); }
  const orig = res.json.bind(res);
  res.json = d => { cache.set(req.originalUrl, d); return orig(d); };
  next();
});

app.listen(3000, () => console.log(`API → http://localhost:3000 (frontend: ${ORIGIN})`));