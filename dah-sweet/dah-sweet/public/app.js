(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = n => '₦' + Number(n).toLocaleString('en-NG');
const S = { token: localStorage.dsToken || '', user: null, items: [], settings: {}, tab: 'orders',
  cart: JSON.parse(localStorage.dsCart || '{"order":[],"games":[]}') };
const byId = id => S.items.find(i => i.id === id);
const ok = i => i && i.available && (i.stock === null || i.stock > 0);
const STATUS = { awaiting_payment: 'Awaiting payment', payment_reported: 'Payment reported, being checked', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };

let toastTimer;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ''), 3500);
}
async function api(path, o = {}) {
  const r = await fetch('/api' + path, {
    method: o.method || (o.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}
const saveCart = () => { localStorage.dsCart = JSON.stringify(S.cart); chrome(); };
const lineTotal = l => { const it = byId(l.id); return it ? (it.price + (l.addons || []).reduce((s, a) => s + (byId(a)?.price || 0), 0)) * l.qty : 0; };
const cartCount = () => S.cart.order.length + S.cart.games.length;

// ---------- shell ----------
function chrome() {
  const r = S.user?.role, links = [['', 'Home'], ['menu', 'Menu'], ['drinks', 'Drinks'], ['games', 'Games'], ['call', 'Order by phone'], ['cart', 'Cart' + (cartCount() ? ` (${cartCount()})` : '')]];
  if (r === 'worker' || r === 'admin') links.push(['staff', 'Staff']);
  if (r === 'admin') links.push(['admin', 'Admin']);
  const cur = (location.hash.slice(2) || '').split('?')[0];
  $('#nav').innerHTML = links.map(([p, t]) => `<a href="#/${p}" ${p === cur ? 'aria-current="page"' : ''}>${t}</a>`).join('');
  $('#acct').innerHTML = S.user
    ? `${r === 'customer' ? '<a href="#/orders">My orders</a>' : ''}<span>${esc(S.user.name)}</span><button data-act="logout">Sign out</button>`
    : '<a href="#/login">Sign in</a>';
}

// ---------- item ledger ----------
function row(it) {
  const off = !ok(it), game = it.cat === 'game';
  const adds = (it.addons || []).map(byId).filter(Boolean);
  const meta = [it.unit, !off && it.stock !== null ? it.stock + ' left' : ''].filter(Boolean).join(', ');
  const opts = !off && adds.length ? `<div class="opts" role="group" aria-label="Options for ${esc(it.name)}">${adds.map(a =>
    `<label><input type="checkbox" value="${a.id}" ${ok(a) ? '' : 'disabled'}> ${esc(a.name)} +${naira(a.price)}${ok(a) ? '' : ' (unavailable)'}</label>`).join('')}</div>` : '';
  return `<li class="row${off ? ' off' : ''}" data-id="${it.id}"><div class="what"><span class="nm">${esc(it.name)}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}${opts}</div>
  <span class="lead" aria-hidden="true"></span><span class="pr">${naira(it.price)}</span>
  <div class="act">${off ? '<span class="tag">Unavailable</span>' :
    `<input type="number" min="1" max="${game ? 12 : it.stock ?? 99}" value="1" aria-label="${game ? 'Hours' : 'Quantity'}"><button class="btn sm" data-act="add">${game ? 'Book' : 'Add'}</button>`}</div></li>`;
}
const listPage = (cat, title, intro) => ({ html: () => `<h1>${title}</h1><p class="lede">${intro}</p><ul class="ledger">${S.items.filter(i => i.cat === cat).map(row).join('')}</ul>
  <a class="btn gold" href="#/cart">Go to cart</a>` });

// ---------- views ----------
const views = {
  '': { html: () => `<div class="home"><div><h1>Eat, drink and play under one roof.</h1>
    <p class="lede">DAH SWEET is a restaurant and gaming lounge. Order from the kitchen, add a drink, or book a console or table by the hour.</p>
    <p><a class="btn" href="#/menu">See the menu</a> &nbsp; <a class="btn alt" href="#/games">Book a game</a></p></div>
    <div class="index"><a href="#/menu"><strong>Food menu</strong><span>Rice dishes, spaghetti, burgers, shawarma and more.</span></a>
    <a href="#/drinks"><strong>Drinks</strong><span>Soft drinks, wine and ice cream.</span></a>
    <a href="#/games"><strong>Games</strong><span>Pool, consoles, VR, foosball and table tennis, priced per hour.</span></a>
    <a href="#/call"><strong>Order by phone</strong><span>${esc(S.settings.phone)}</span></a></div></div>` },
  menu: listPage('food', 'Food menu', 'Prices are in naira. Where a dish has options, tick them before you add it.'),
  drinks: listPage('drink', 'Drinks', 'Add drinks to the same cart as your food.'),
  games: listPage('game', 'Games', 'Prices are per hour. Set the number of hours, then choose your time at checkout.'),
  call: { html: () => `<h1>Order by phone</h1><p class="lede">Call us to place a food or drink order.</p>
    <a class="phone" href="tel:${esc(S.settings.phone)}">${esc(S.settings.phone)}</a>
    <p class="muted">Payment for phone orders is made by transfer to the accounts shown at checkout.</p>` },
  cart: { html: () => {
    S.cart.order = S.cart.order.filter(l => byId(l.id)); S.cart.games = S.cart.games.filter(l => byId(l.id));
    const sec = (kind, title, extra) => {
      const L = S.cart[kind]; if (!L.length) return '';
      const total = L.reduce((s, l) => s + lineTotal(l), 0);
      return `<h2>${title}</h2><ul class="lines">${L.map((l, i) => { const it = byId(l.id);
        return `<li><div>${l.qty} × ${esc(it.name)}${(l.addons || []).length ? `<small>with ${l.addons.map(a => esc(byId(a)?.name)).join(', ')}</small>` : ''}${kind === 'games' ? `<small>${l.qty} hour${l.qty > 1 ? 's' : ''}</small>` : ''}</div>
        <div>${naira(lineTotal(l))} &nbsp; <button class="btn sm alt" data-act="rm" data-kind="${kind}" data-i="${i}">Remove</button></div></li>`; }).join('')}</ul>
        <div class="total"><span>Total</span><span>${naira(total)}</span></div>${extra}
        ${S.user?.role === 'customer' ? `<button class="btn" data-act="place" data-kind="${kind}">Place ${kind === 'games' ? 'booking' : 'order'}</button>` : '<a class="btn" href="#/login">Sign in to continue</a>'}`; };
    if (!cartCount()) return `<h1>Cart</h1><p class="lede">Your cart is empty.</p><a class="btn" href="#/menu">Browse the menu</a>`;
    return `<h1>Cart</h1><p class="muted">Food and drinks are paid together. Games are booked and paid separately.</p>
      ${sec('order', 'Food and drinks', '<div class="field"><label for="note-order">Note (optional)</label><input id="note-order" maxlength="200" placeholder="Table number or pickup time"></div>')}
      ${sec('games', 'Game booking', '<div class="field"><label for="when">Date and time</label><input id="when" type="datetime-local"></div><div class="field"><label for="note-games">Note (optional)</label><input id="note-games" maxlength="200"></div>')}`; } },
  orders: { html: async () => {
    if (S.user?.role !== 'customer') return needLogin();
    const list = await api('/orders/mine');
    return `<h1>My orders</h1>${list.length ? list.map(o => orderHtml(o, true)).join('') : '<p class="lede">You have not placed an order yet.</p>'}`; } },
  login: { html: () => `<div class="split"><div><h1>Sign in</h1><form data-form="login">
    <div class="field"><label for="le">Email</label><input id="le" name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" required autocomplete="current-password"></div>
    <button class="btn">Sign in</button></form></div>
    <div><h2 style="margin-top:0">Create an account</h2><form data-form="register">
    <div class="field"><label for="rn">Name</label><input id="rn" name="name" required autocomplete="name"></div>
    <div class="field"><label for="re">Email</label><input id="re" name="email" type="email" required autocomplete="email"></div>
    <div class="field"><label for="rp">Password (8 or more characters)</label><input id="rp" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
    <button class="btn alt">Create account</button></form></div></div>` },
  staff: { html: async () => {
    if (!['worker', 'admin'].includes(S.user?.role)) return needLogin();
    const tabs = `<div class="tabs" role="tablist">${[['orders', 'Orders'], ['stock', 'Stock and availability']].map(([k, t]) => `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${t}</button>`).join('')}</div>`;
    if (S.tab === 'stock') {
      const admin = S.user.role === 'admin';
      return `<h1>Stock and availability</h1>${tabs}<div class="scroll"><table><thead><tr><th>Item</th><th>Available</th><th>In stock</th>${admin ? '<th>Price (₦)</th>' : ''}<th></th></tr></thead><tbody>
      ${S.items.map(i => `<tr data-id="${i.id}"><td>${esc(i.name)} <span class="muted">${i.cat}</span></td><td><input type="checkbox" data-f="available" ${i.available ? 'checked' : ''} aria-label="Available"></td>
      <td>${i.stock === null ? '<span class="muted">not counted</span>' : `<input type="number" min="0" data-f="stock" value="${i.stock}" aria-label="Stock">`}</td>
      ${admin ? `<td><input type="number" min="0" data-f="price" value="${i.price}" aria-label="Price"></td>` : ''}<td><button class="btn sm" data-act="saveitem">Save</button></td></tr>`).join('')}</tbody></table></div>`; }
    const orders = await api('/staff/orders');
    return `<h1>Orders</h1>${tabs}${orders.length ? orders.map(o => orderHtml(o, false)).join('') : '<p class="lede">No orders yet.</p>'}`; } },
  admin: { html: async () => {
    if (S.user?.role !== 'admin') return needLogin();
    const [logins, users] = await Promise.all([api('/admin/logins'), api('/admin/users')]);
    const st = S.settings;
    return `<h1>Admin</h1><p class="lede">You have full control. Orders and stock are under <a href="#/staff">Staff</a>.</p>
    <div class="split"><div><h2>Sign-in activity</h2><p class="muted">New sign-ins appear here live.</p><ul id="feed">${logins.map(feedLi).join('') || '<li class="muted">No sign-ins yet.</li>'}</ul></div>
    <div><h2>Payment details</h2><form data-form="settings">
      <div class="field"><label for="sp">Order phone number</label><input id="sp" name="phone" value="${esc(st.phone)}"></div>
      <div class="field"><label for="sn">Account name (shown to customers)</label><input id="sn" name="accountName" value="${esc(st.accountName)}"></div>
      <div class="field"><label for="sa">Accounts, one per line: bank | number</label><textarea id="sa" name="accounts" rows="3">${st.accounts.map(a => esc(a.bank + ' | ' + a.number)).join('\n')}</textarea></div>
      <button class="btn">Save payment details</button></form></div></div>
    <h2>People</h2><div class="scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${u.role === 'admin' ? '' : `<button class="btn sm danger" data-act="deluser" data-id="${u.id}">Remove</button>`}</td></tr>`).join('')}</tbody></table></div>
    <div class="split"><div><h2>Add a worker</h2><form data-form="worker">
      <div class="field"><label for="wn">Name</label><input id="wn" name="name" required></div>
      <div class="field"><label for="we">Email</label><input id="we" name="email" type="email" required></div>
      <div class="field"><label for="wp">Password (8 or more characters)</label><input id="wp" name="password" type="password" minlength="8" required></div>
      <button class="btn">Add worker</button></form></div>
    <div><h2>Add a menu item</h2><form data-form="item">
      <div class="field"><label for="in">Name</label><input id="in" name="name" required></div>
      <div class="field"><label for="ic">Category</label><select id="ic" name="cat"><option value="food">Food</option><option value="drink">Drink</option><option value="game">Game</option><option value="extra">Option (add-on)</option></select></div>
      <div class="field"><label for="ip">Price (₦)</label><input id="ip" name="price" type="number" min="0" required></div>
      <div class="field"><label for="is">Quantity in stock (not used for games)</label><input id="is" name="stock" type="number" min="0"></div>
      <button class="btn">Add item</button></form></div></div>
    <h2>Change my password</h2><form data-form="password"><div class="field"><label for="pc">Current password</label><input id="pc" name="current" type="password" required></div>
      <div class="field"><label for="pn">New password</label><input id="pn" name="next" type="password" minlength="8" required></div><button class="btn alt">Change password</button></form>`; } },
};
const needLogin = () => `<h1>Sign in required</h1><p class="lede">You need to be signed in to see this page.</p><a class="btn" href="#/login">Sign in</a>`;
const feedLi = l => `<li><span>${esc(l.name)} <span class="muted">${l.role}</span></span><time class="muted" datetime="${l.at}">${new Date(l.at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</time></li>`;

function orderHtml(o, mine) {
  const acc = S.settings.accounts || [];
  const pay = mine && o.status === 'awaiting_payment' ? `<div class="pay"><p>Transfer <strong>${naira(o.total)}</strong> to one of these accounts, then enter your transfer reference.${S.settings.accountName ? ` Account name: ${esc(S.settings.accountName)}.` : ''}</p>
    <ul>${acc.map(a => `<li>${esc(a.bank)}: <strong>${esc(a.number)}</strong></li>`).join('')}</ul>
    <form data-form="paid" data-id="${o.id}"><input name="ref" required maxlength="60" placeholder="Transfer reference or sender name" aria-label="Transfer reference"><button class="btn">I have paid</button></form>
    <p style="margin:12px 0 0"><button class="btn sm alt" data-act="cancel" data-id="${o.id}">Cancel this order</button></p></div>` : '';
  const staffBtns = !mine && !['completed', 'cancelled'].includes(o.status) ? `<p>${o.status !== 'confirmed' ? `<button class="btn sm" data-act="status" data-s="confirmed" data-id="${o.id}">Confirm payment</button> ` : `<button class="btn sm" data-act="status" data-s="completed" data-id="${o.id}">Mark completed</button> `}<button class="btn sm alt" data-act="status" data-s="cancelled" data-id="${o.id}">Cancel</button></p>` : '';
  return `<section class="order"><header><h3>${o.id}${mine ? '' : ' · ' + esc(o.customer)} <span class="muted">${o.kind === 'games' ? 'Game booking' : 'Food and drinks'}</span></h3>
    <span class="tag ${['confirmed', 'completed'].includes(o.status) ? 'ok' : ''}">${STATUS[o.status]}</span></header>
    <ul class="lines">${o.lines.map(l => `<li><div>${l.qty} × ${esc(l.name)}${l.addons.length ? `<small>with ${l.addons.map(a => esc(a.name)).join(', ')}</small>` : ''}</div></li>`).join('')}</ul>
    <p><strong>${naira(o.total)}</strong>${o.when ? ` · for ${esc(new Date(o.when).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }))}` : ''}${o.note ? ` · ${esc(o.note)}` : ''}${o.ref && !mine ? ` · ref: ${esc(o.ref)}` : ''}</p>${pay}${staffBtns}</section>`;
}

// ---------- rendering ----------
let rendering = false;
async function render(scroll = true) {
  if (rendering) return; rendering = true;
  const path = (location.hash.slice(2) || '').split('?')[0];
  try {
    [S.items, S.settings] = await Promise.all([api('/items'), api('/settings')]);
    const v = views[path] || views[''];
    $('#app').innerHTML = await v.html();
    document.title = (path ? path[0].toUpperCase() + path.slice(1) + ' · ' : '') + 'DAH SWEET';
    if (scroll) { window.scrollTo(0, 0); $('#app').focus({ preventScroll: true }); }
  } catch (e) { $('#app').innerHTML = `<h1>Something went wrong</h1><p class="lede">${esc(e.message)}</p>`; }
  rendering = false; chrome();
}

// ---------- actions ----------
const act = {
  async add(el) {
    const r = el.closest('.row'), it = byId(r.dataset.id), kind = it.cat === 'game' ? 'games' : 'order';
    const qty = Math.max(1, Math.floor(+r.querySelector('input[type=number]').value || 1));
    const addons = [...r.querySelectorAll('.opts input:checked')].map(i => i.value);
    S.cart[kind].push({ id: it.id, qty, addons }); saveCart();
    toast(`${it.name} added to cart`);
  },
  rm(el) { S.cart[el.dataset.kind].splice(+el.dataset.i, 1); saveCart(); render(false); },
  async place(el) {
    const kind = el.dataset.kind;
    const when = kind === 'games' ? $('#when').value : '';
    const o = await api('/orders', { body: { kind, lines: S.cart[kind], when, note: $('#note-' + kind).value } });
    S.cart[kind] = []; saveCart(); location.hash = '#/orders'; toast(`Order ${o.id} placed. Pay to confirm it.`);
  },
  async cancel(el) { await api(`/orders/${el.dataset.id}/cancel`, { method: 'POST' }); render(false); },
  async logout() { try { await api('/logout', { method: 'POST' }); } catch {} S.token = ''; S.user = null; delete localStorage.dsToken; live(); location.hash = '#/'; chrome(); },
  tab(el) { S.tab = el.dataset.tab; render(false); },
  async status(el) { await api(`/staff/orders/${el.dataset.id}/status`, { body: { status: el.dataset.s } }); render(false); },
  async saveitem(el) {
    const r = el.closest('tr'), b = {};
    r.querySelectorAll('[data-f]').forEach(i => (b[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value));
    await api(`/staff/items/${r.dataset.id}`, { method: 'PATCH', body: b }); toast('Saved');
  },
  async deluser(el) { if (confirm('Remove this account?')) { await api(`/admin/users/${el.dataset.id}`, { method: 'DELETE' }); render(false); } },
};
const forms = {
  async login(d) { await signedIn(await api('/login', { body: d })); },
  async register(d) { await signedIn(await api('/register', { body: d })); },
  async paid(d, f) { await api(`/orders/${f.dataset.id}/paid`, { body: d }); toast('Thanks. We will confirm your payment shortly.'); render(false); },
  async worker(d, f) { await api('/admin/workers', { body: d }); f.reset(); toast('Worker added'); render(false); },
  async item(d, f) { await api('/admin/items', { body: d }); f.reset(); toast('Item added'); },
  async password(d, f) { await api('/me/password', { body: d }); f.reset(); toast('Password changed'); },
  async settings(d) {
    d.accounts = d.accounts.split('\n').map(l => l.split('|').map(s => s.trim())).filter(a => a[0] && a[1]).map(([bank, number]) => ({ bank, number }));
    S.settings = await api('/admin/settings', { method: 'PUT', body: d }); toast('Saved');
  },
};
async function signedIn(r) {
  S.token = r.token; S.user = r.user; localStorage.dsToken = r.token; live();
  location.hash = ['worker', 'admin'].includes(r.user.role) ? (r.user.role === 'admin' ? '#/admin' : '#/staff') : '#/menu'; chrome();
}
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el || !act[el.dataset.act]) return;
  el.disabled = true;
  try { await act[el.dataset.act](el); } catch (er) { toast(er.message, true); }
  el.disabled = false;
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  try { await forms[f.dataset.form](Object.fromEntries(new FormData(f)), f); } catch (er) { toast(er.message, true); }
});

// ---------- live updates for staff and admin ----------
let es;
function live() {
  if (es) { es.close(); es = null; }
  if (!['worker', 'admin'].includes(S.user?.role)) return;
  es = new EventSource('/api/stream?t=' + S.token);
  es.addEventListener('login', e => {
    const l = JSON.parse(e.data); toast(`${l.name} just signed in`);
    const feed = $('#feed'); if (feed) feed.insertAdjacentHTML('afterbegin', feedLi(l));
  });
  const soft = () => { const p = location.hash.slice(2); if ((p === 'staff') && !document.activeElement?.closest('#app')) render(false); };
  es.addEventListener('order', e => { const d = JSON.parse(e.data); toast(`New ${d.kind === 'games' ? 'booking' : 'order'} ${d.id} from ${d.customer}, ${naira(d.total)}`); soft(); });
  es.addEventListener('paid', e => { const d = JSON.parse(e.data); toast(`${d.customer} reported payment for ${d.id}`); soft(); });
}

// ---------- start ----------
window.addEventListener('hashchange', () => render(true));
(async () => {
  if (S.token) { try { S.user = await api('/me'); } catch { S.token = ''; delete localStorage.dsToken; } }
  live(); await render(true);
})();
})();
