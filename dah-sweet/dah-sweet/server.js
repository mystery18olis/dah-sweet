const express = require('express'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const DIR = path.join(__dirname, 'data'), FILE = path.join(DIR, 'db.json');
const uid = () => crypto.randomBytes(8).toString('hex');
const hash = (p, s = crypto.randomBytes(16).toString('hex')) => s + ':' + crypto.scryptSync(p, s, 32).toString('hex');
const verify = (p, h) => { const a = Buffer.from(hash(p, h.split(':')[0])), b = Buffer.from(h); return a.length === b.length && crypto.timingSafeEqual(a, b); };

// ---------- data ----------
function seed() {
  const I = (id, cat, name, price, stock, o = {}) => ({ id, cat, name, price, stock, available: true, unit: o.unit || '', addons: o.addons || [] });
  const items = [
    I('fried-rice', 'food', 'Fried rice', 4500, 20, { unit: 'per plate', addons: ['chicken', 'salad', 'plantain'] }),
    I('jollof-rice', 'food', 'Jollof rice', 4500, 20, { unit: 'per plate', addons: ['chicken', 'salad', 'plantain'] }),
    I('beans-plantain', 'food', 'Beans and plantain', 4000, 20, { unit: 'per plate' }),
    I('spaghetti', 'food', 'Spaghetti bolognese', 4000, 20, { unit: 'per plate', addons: ['turkey'] }),
    I('white-rice', 'food', 'White rice and yarser', 4000, 20, { unit: 'per plate', addons: ['chicken', 'fish'] }),
    I('burger', 'food', 'Burger', 4000, 20, { addons: ['fries'] }),
    I('french-bread', 'food', 'French bread sandwich', 5000, 20),
    I('popcorn', 'food', 'Popcorn', 1500, 30),
    I('shawarma', 'food', 'Shawarma', 4000, 20),
    I('minced-fries', 'food', 'Minced meat and fries', 4500, 20),
    I('parfait', 'food', 'Cake parfait', 5000, 15),
    I('sprite', 'drink', 'Sprite', 1000, 50), I('fanta', 'drink', 'Fanta', 1000, 50),
    I('schweppes', 'drink', 'Schweppes', 2000, 40), I('sosa', 'drink', 'Sosa', 1500, 40),
    I('root-beer', 'drink', 'Root beer', 2000, 40), I('wine', 'drink', 'Wine', 3500, 20),
    I('ice-cream', 'drink', 'Ice cream', 3000, 30),
    I('pool', 'game', 'Pool', 3500, null, { unit: 'per hour' }), I('ps4', 'game', 'PS4', 3500, null, { unit: 'per hour' }),
    I('ps5', 'game', 'PS5', 4000, null, { unit: 'per hour' }), I('vr', 'game', 'VR headset games', 5000, null, { unit: 'per hour' }),
    I('switch', 'game', 'Nintendo Switch', 3500, null, { unit: 'per hour' }), I('xbox', 'game', 'Xbox', 3500, null, { unit: 'per hour' }),
    I('foosball', 'game', 'Foosball', 4000, null, { unit: 'per hour' }), I('tennis', 'game', 'Table tennis', 3500, null, { unit: 'per hour' }),
    I('chicken', 'extra', 'Chicken', 3000, 40), I('salad', 'extra', 'Salad', 1500, 40), I('fish', 'extra', 'Fish', 1500, 40),
    I('turkey', 'extra', 'Turkey', 3500, 30), I('plantain', 'extra', 'Plantain', 1000, 40), I('fries', 'extra', 'French fries', 3000, 40),
  ];
  const email = (process.env.ADMIN_EMAIL || 'admin@dahsweet.com').toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(5).toString('hex');
  console.log(`\n  First run. Admin login:\n    email:    ${email}\n    password: ${pw}\n  Keep this safe. Change it after signing in.\n`);
  return {
    seq: 0, items, orders: [], logins: [], sessions: {},
    settings: { name: 'DAH SWEET', phone: '07053205856', accountName: '', accounts: [{ bank: 'Opay', number: '7053205856' }, { bank: 'Access Bank', number: '1971556521' }] },
    users: [{ id: uid(), name: 'Admin', email, hash: hash(pw), role: 'admin', createdAt: new Date().toISOString() }],
  };
}
let db;
if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
else { fs.mkdirSync(DIR, { recursive: true }); db = seed(); }
const save = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1)); fs.renameSync(FILE + '.tmp', FILE); };
save();

// ---------- helpers ----------
const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const find = id => db.items.find(i => i.id === id);
const tries = {};
const throttled = k => { const n = Date.now(), a = (tries[k] || []).filter(t => n - t < 9e5); tries[k] = a; if (a.length >= 10) return true; a.push(n); return false; };

const auth = (...roles) => (req, res, next) => {
  const t = (req.headers.authorization || '').slice(7) || req.query.t;
  const s = db.sessions[t];
  const u = s && s.exp > Date.now() && db.users.find(x => x.id === s.uid);
  if (!u) return bad(res, 'Please sign in.', 401);
  if (roles.length && !roles.includes(u.role)) return bad(res, 'You do not have access to this.', 403);
  req.user = u; req.token = t; next();
};

const clients = new Set();
const emit = (ev, data, roles = ['worker', 'admin']) =>
  clients.forEach(c => roles.includes(c.role) && c.res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
app.get('/api/stream', auth('worker', 'admin'), (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const c = { res, role: req.user.role }; clients.add(c);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(c); });
});

function startSession(u) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { uid: u.id, exp: Date.now() + 7 * 864e5 };
  for (const t in db.sessions) if (db.sessions[t].exp < Date.now()) delete db.sessions[t];
  const log = { userId: u.id, name: u.name, role: u.role, at: new Date().toISOString() };
  db.logins.unshift(log); db.logins.length = Math.min(db.logins.length, 300);
  save();
  if (u.role !== 'admin') emit('login', log, ['admin']);
  return { token, user: pub(u) };
}

// ---------- public ----------
app.get('/api/items', (req, res) => res.json(db.items));
app.get('/api/settings', (req, res) => res.json(db.settings));

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || String(password).length < 8) return bad(res, 'Enter your name, email and a password of at least 8 characters.');
  const e = String(email).trim().toLowerCase();
  if (db.users.some(u => u.email === e)) return bad(res, 'That email already has an account. Sign in instead.');
  const u = { id: uid(), name: String(name).trim().slice(0, 60), email: e, hash: hash(String(password)), role: 'customer', createdAt: new Date().toISOString() };
  db.users.push(u); res.json(startSession(u));
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const e = String(email || '').trim().toLowerCase();
  if (throttled(req.ip + e)) return bad(res, 'Too many attempts. Try again in 15 minutes.', 429);
  const u = db.users.find(x => x.email === e);
  if (!u || !verify(String(password || ''), u.hash)) return bad(res, 'Email or password is incorrect.', 401);
  res.json(startSession(u));
});
app.post('/api/logout', auth(), (req, res) => { delete db.sessions[req.token]; save(); res.json({ ok: true }); });
app.get('/api/me', auth(), (req, res) => res.json(pub(req.user)));
app.post('/api/me/password', auth(), (req, res) => {
  const { current, next } = req.body || {};
  if (!verify(String(current || ''), req.user.hash)) return bad(res, 'Current password is incorrect.');
  if (String(next || '').length < 8) return bad(res, 'New password must be at least 8 characters.');
  req.user.hash = hash(String(next)); save(); res.json({ ok: true });
});

// ---------- customer orders ----------
app.post('/api/orders', auth('customer'), (req, res) => {
  const { kind, lines, when, note } = req.body || {};
  if (!['order', 'games'].includes(kind) || !Array.isArray(lines) || !lines.length || lines.length > 30) return bad(res, 'Your cart is empty.');
  if (kind === 'games' && !when) return bad(res, 'Choose the date and time you are coming.');
  const need = {}, out = []; let total = 0;
  for (const l of lines) {
    const it = find(l.id), qty = Math.floor(+l.qty);
    const okCat = it && (kind === 'games' ? it.cat === 'game' : it.cat === 'food' || it.cat === 'drink');
    if (!okCat || !(qty >= 1) || qty > (it.cat === 'game' ? 12 : 99)) return bad(res, 'One of the items in your cart is not valid.');
    const adds = (kind === 'order' ? l.addons || [] : []).map(find);
    if (adds.some(a => !a || a.cat !== 'extra' || !it.addons.includes(a.id))) return bad(res, 'One of the options is not valid.');
    need[it.id] = (need[it.id] || 0) + qty; adds.forEach(a => (need[a.id] = (need[a.id] || 0) + qty));
    total += (it.price + adds.reduce((s, a) => s + a.price, 0)) * qty;
    out.push({ id: it.id, name: it.name, qty, price: it.price, addons: adds.map(a => ({ id: a.id, name: a.name, price: a.price })) });
  }
  for (const id in need) { const i = find(id); if (!i.available || (i.stock !== null && i.stock < need[id])) return bad(res, `${i.name} is unavailable or there is not enough left.`); }
  for (const id in need) { const i = find(id); if (i.stock !== null) i.stock -= need[id]; }
  const o = { id: 'DS' + (1001 + db.seq++), userId: req.user.id, customer: req.user.name, kind, lines: out, total, when: String(when || '').slice(0, 40), note: String(note || '').slice(0, 200), status: 'awaiting_payment', ref: '', used: need, createdAt: new Date().toISOString() };
  db.orders.unshift(o); save();
  emit('order', { id: o.id, kind, total, customer: o.customer });
  res.json(o);
});
app.get('/api/orders/mine', auth('customer'), (req, res) => res.json(db.orders.filter(o => o.userId === req.user.id)));
app.post('/api/orders/:id/paid', auth('customer'), (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!o || o.status !== 'awaiting_payment') return bad(res, 'This order is not waiting for payment.');
  const ref = String((req.body || {}).ref || '').trim().slice(0, 60);
  if (!ref) return bad(res, 'Enter your transfer reference or the name on the sending account.');
  o.ref = ref; o.status = 'payment_reported'; save();
  emit('paid', { id: o.id, total: o.total, customer: o.customer }); res.json(o);
});
const restore = o => { for (const id in o.used) { const i = find(id); if (i && i.stock !== null) i.stock += o.used[id]; } };
app.post('/api/orders/:id/cancel', auth('customer'), (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!o || o.status !== 'awaiting_payment') return bad(res, 'Only unpaid orders can be cancelled here. Call us to change a paid order.');
  o.status = 'cancelled'; restore(o); save(); res.json(o);
});

// ---------- staff (workers + admin) ----------
app.get('/api/staff/orders', auth('worker', 'admin'), (req, res) => res.json(db.orders.slice(0, 150)));
app.post('/api/staff/orders/:id/status', auth('worker', 'admin'), (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id), s = (req.body || {}).status;
  if (!o || !['confirmed', 'completed', 'cancelled'].includes(s)) return bad(res, 'Invalid request.');
  if (['completed', 'cancelled'].includes(o.status)) return bad(res, 'This order is already closed.');
  if (s === 'cancelled') restore(o);
  o.status = s; save(); res.json(o);
});
app.patch('/api/staff/items/:id', auth('worker', 'admin'), (req, res) => {
  const i = find(req.params.id); if (!i) return bad(res, 'Item not found.', 404);
  const b = req.body || {};
  if ('available' in b) i.available = !!b.available;
  if ('stock' in b && i.stock !== null) { const n = Math.floor(+b.stock); if (n >= 0) i.stock = n; }
  if (req.user.role === 'admin') {
    if (b.price != null && +b.price >= 0) i.price = Math.round(+b.price);
    if (b.name) i.name = String(b.name).slice(0, 60);
  }
  save(); res.json(i);
});

// ---------- admin only ----------
app.get('/api/admin/logins', auth('admin'), (req, res) => res.json(db.logins.slice(0, 100)));
app.get('/api/admin/users', auth('admin'), (req, res) => res.json(db.users.map(u => ({ ...pub(u), createdAt: u.createdAt }))));
app.post('/api/admin/workers', auth('admin'), (req, res) => {
  const { name, email, password } = req.body || {}, e = String(email || '').trim().toLowerCase();
  if (!name || !e || String(password || '').length < 8) return bad(res, 'Enter a name, email and a password of at least 8 characters.');
  if (db.users.some(u => u.email === e)) return bad(res, 'That email is already in use.');
  db.users.push({ id: uid(), name: String(name).slice(0, 60), email: e, hash: hash(String(password)), role: 'worker', createdAt: new Date().toISOString() });
  save(); res.json({ ok: true });
});
app.delete('/api/admin/users/:id', auth('admin'), (req, res) => {
  const u = db.users.find(x => x.id === req.params.id);
  if (!u || u.role === 'admin') return bad(res, 'This account cannot be removed.');
  db.users = db.users.filter(x => x !== u);
  for (const t in db.sessions) if (db.sessions[t].uid === u.id) delete db.sessions[t];
  save(); res.json({ ok: true });
});
app.post('/api/admin/items', auth('admin'), (req, res) => {
  const b = req.body || {}, name = String(b.name || '').trim();
  if (!name || !['food', 'drink', 'game', 'extra'].includes(b.cat) || !(+b.price >= 0)) return bad(res, 'Enter a name, category and price.');
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
  if (find(id)) id += '-' + uid().slice(0, 3);
  db.items.push({ id, cat: b.cat, name: name.slice(0, 60), price: Math.round(+b.price), stock: b.cat === 'game' || b.stock === '' || b.stock == null ? null : Math.max(0, Math.floor(+b.stock)), available: true, unit: b.cat === 'game' ? 'per hour' : '', addons: [] });
  save(); res.json({ ok: true });
});
app.put('/api/admin/settings', auth('admin'), (req, res) => {
  const b = req.body || {};
  db.settings.phone = String(b.phone || db.settings.phone).slice(0, 20);
  db.settings.accountName = String(b.accountName || '').slice(0, 60);
  if (Array.isArray(b.accounts)) db.settings.accounts = b.accounts.filter(a => a.bank && a.number).slice(0, 6).map(a => ({ bank: String(a.bank).slice(0, 40), number: String(a.number).slice(0, 20) }));
  save(); res.json(db.settings);
});

app.use((err, req, res, next) => bad(res, 'Bad request.'));
app.listen(PORT, () => console.log(`DAH SWEET running at http://localhost:${PORT}`));
