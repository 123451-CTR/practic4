const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'dev.db'));
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE, password_hash TEXT, full_name TEXT, phone TEXT,
  email TEXT, role TEXT DEFAULT 'user');
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT, description TEXT, price REAL, stock INTEGER, image TEXT, category TEXT);
CREATE TABLE IF NOT EXISTS cart(id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INT, product_id INT, qty INT DEFAULT 1, UNIQUE(user_id,product_id));
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INT, status TEXT DEFAULT 'Новый', total REAL, delivery_method TEXT,
  delivery_date TEXT, payment_method TEXT, promo_code TEXT, discount REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INT, product_id INT, title TEXT, price REAL, qty INT);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INT, user_id INT, rating INT, comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(product_id,user_id));
CREATE TABLE IF NOT EXISTS wishlist(id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INT, product_id INT, UNIQUE(user_id,product_id));
CREATE TABLE IF NOT EXISTS promos(id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE, percent INT, active INT DEFAULT 1);
`);

function seed() {
  if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) {
    const ins = db.prepare('INSERT INTO users(login,password_hash,full_name,phone,email,role) VALUES(?,?,?,?,?,?)');
    ins.run('lab16', bcrypt.hashSync('prac3',10), 'Лаборант', '8(900)111-22-33', 'lab16@shop.ru', 'admin');
    ins.run('user01', bcrypt.hashSync('password123',10), 'Иванов Иван Иванович', '8(912)345-67-89', 'u@shop.ru', 'user');
  }
  if (!db.prepare('SELECT COUNT(*) c FROM products').get().c) {
    const p = db.prepare('INSERT INTO products(title,description,price,stock,category) VALUES(?,?,?,?,?)');
    p.run('Ретро-лампа "Неон"','Лампа в стиле 80-х',2990,15,'Свет');
    p.run('Клавиатура Mech-80','Механическая',5990,8,'Периферия');
    p.run('Мышь Neon-Glow','Игровая',1990,20,'Периферия');
    p.run('Кресло Synthwave','Кресло',18990,5,'Мебель');
  }
  if (!db.prepare('SELECT COUNT(*) c FROM promos').get().c) {
    db.prepare('INSERT INTO promos(code,percent) VALUES(?,?)').run('NEON10',10);
    db.prepare('INSERT INTO promos(code,percent) VALUES(?,?)').run('RETRO20',20);
  }
}
if (process.argv.includes('--seed')) { seed(); console.log('Seeded.'); }

module.exports = { db, seed }; 