
const $ = s => document.querySelector(s);
const app = $('#app');
const API = window.API || 'http://localhost:3000';

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Ошибка'), d);
  return d;
}
const money = n => Number(n).toLocaleString('ru-RU') + ' ₽';
const imgUrl = p =>
  p ? API + p
    : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="%2314142b"/><text x="50%" y="50%" fill="%2323d5ff" font-size="20" text-anchor="middle">no image</text></svg>';

let me = null;
let cartCount = 0;

async function refreshMe() {
  try { me = await api('/api/me'); } catch { me = null; }
  try {
    const { items } = await api('/api/cart');
    cartCount = items.reduce((s, i) => s + i.qty, 0);
  } catch { cartCount = 0; }
}


function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = `
    <button class="ghost" onclick="location.hash='catalog'">Каталог</button>
    <button class="ghost" onclick="location.hash='cart'">🛒 Корзина${cartCount ? ' ('+cartCount+')' : ''}</button>
    ${me ? `
      ${me.role === 'admin' ? `<button class="ghost" onclick="location.hash='admin'">Админ</button>` : ''}
      <button class="ghost" onclick="location.hash='profile'">${me.full_name}</button>
      <button onclick="doLogout()">Выйти</button>
    ` : `
      <button class="ghost" onclick="location.hash='login'">Вход</button>
      <button onclick="location.hash='register'">Регистрация</button>
    `}
  `;
}
window.doLogout = async () => {
  await api('/api/auth/logout' in {} ? '/api/logout' : '/api/logout', { method: 'POST' }).catch(()=>{});
  await api('/api/logout', { method: 'POST' }).catch(()=>{});
  await refreshMe();
  location.hash = 'catalog';
};


let catalogState = { q: '', category: 'all', sort: 'default' };

async function screenCatalog() {
  const data = await api('/api/products');
  const categories = [...new Set(data.map(p => p.category).filter(Boolean))];

  let items = data.slice();
  if (catalogState.q)
    items = items.filter(p => p.title.toLowerCase().includes(catalogState.q.toLowerCase()));
  if (catalogState.category !== 'all')
    items = items.filter(p => p.category === catalogState.category);
  if (catalogState.sort === 'price-asc') items.sort((a, b) => a.price - b.price);
  if (catalogState.sort === 'price-desc') items.sort((a, b) => b.price - a.price);
  if (catalogState.sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title));

  app.innerHTML = `
    <h1>Каталог</h1>
    <div class="filters">
      <input id="f-q" placeholder="Поиск по названию..." value="${catalogState.q}">
      <select id="f-cat">
        <option value="all">Все категории</option>
        ${categories.map(c => `<option ${catalogState.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <select id="f-sort">
        <option value="default" ${catalogState.sort === 'default' ? 'selected' : ''}>Сортировка</option>
        <option value="price-asc" ${catalogState.sort === 'price-asc' ? 'selected' : ''}>Цена ↑</option>
        <option value="price-desc" ${catalogState.sort === 'price-desc' ? 'selected' : ''}>Цена ↓</option>
        <option value="title" ${catalogState.sort === 'title' ? 'selected' : ''}>По названию</option>
      </select>
    </div>
    <div class="grid">
      ${items.length ? items.map(p => `
        <div class="card fade">
          <img class="thumb" src="${imgUrl(p.image)}" onclick="location.hash='product/${p.id}'">
          <h4 onclick="location.hash='product/${p.id}'" style="cursor:pointer">${p.title}</h4>
          <div class="muted">${p.category || ''} · в наличии: ${p.stock}</div>
          <div class="row" style="margin-top:8px">
            <b>${money(p.price)}</b>
            <button style="margin-left:auto" onclick="addCart(${p.id}, this)">В корзину</button>
          </div>
        </div>`).join('') : '<p>Ничего не найдено</p>'}
    </div>
  `;
  $('#f-q').oninput = e => { catalogState.q = e.target.value; screenCatalog(); };
  $('#f-cat').onchange = e => { catalogState.category = e.target.value; screenCatalog(); };
  $('#f-sort').onchange = e => { catalogState.sort = e.target.value; screenCatalog(); };
}


async function screenProduct(id) {
  const p = await api('/api/products/' + id);
  const canReview = !!me;
  app.innerHTML = `
    <button class="ghost" onclick="location.hash='catalog'">← Назад в каталог</button>
    <div class="card" style="margin-top:10px">
      <img class="thumb" src="${imgUrl(p.image)}">
      <h1>${p.title}</h1>
      <p class="muted">${p.category || ''}</p>
      <p>${p.description || ''}</p>
      <p><b>${money(p.price)}</b> · в наличии: ${p.stock}</p>
      <div class="row">
        <button onclick="addCart(${p.id}, this)">В корзину</button>
        <button class="ghost" onclick="toggleWish(${p.id})">♡ Избранное</button>
      </div>
    </div>

    <h3>Отзывы</h3>
    ${p.reviews.length ? p.reviews.map(r => `
      <div class="card">
        <b>${r.full_name || 'Покупатель'}</b>
        <span class="muted">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
        <div>${r.comment || ''}</div>
      </div>`).join('') : '<p class="muted">Пока нет отзывов</p>'}

    ${canReview ? `
      <div class="card">
        <h4>Оставить отзыв</h4>
        <label>Оценка
          <select id="rev-rating">
            <option value="5">5 ★</option><option value="4">4 ★</option>
            <option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option>
          </select>
        </label>
        <label>Комментарий
          <input id="rev-text" placeholder="Ваш отзыв">
        </label>
        <button id="rev-btn">Отправить отзыв</button>
        <p class="err" id="rev-err"></p>
      </div>
    ` : ''}
  `;
  if (canReview) {
    $('#rev-btn').onclick = async () => {
      $('#rev-err').textContent = '';
      try {
        await api('/api/reviews', {
          method: 'POST',
          body: {
            product_id: +p.id,
            rating: +$('#rev-rating').value,
            comment: $('#rev-text').value.trim(),
          },
        });
        alert('Отзыв добавлен!');
        screenProduct(id);
      } catch (e) {
        $('#rev-err').textContent = e.error || 'Не удалось добавить отзыв';
      }
    };
  }
}


async function screenCart() {
  const { items, total } = await api('/api/cart');
  const promo = sessionStorage.promo || '';
  app.innerHTML = `
    <button class="ghost" onclick="location.hash='catalog'">← К каталогу</button>
    <h1>Корзина</h1>
    ${items.length ? items.map(i => `
      <div class="card row">
        <img src="${imgUrl(i.image)}" width="64" height="64" style="border-radius:8px;object-fit:cover">
        <div style="flex:1">${i.title}<br><small class="muted">${money(i.price)}</small></div>
        <input type="number" min="1" max="${i.stock}" value="${i.qty}" style="width:80px"
               onchange="updateCart(${i.id}, this.value)">
        <button class="ghost" onclick="removeCart(${i.id})">✕</button>
      </div>`).join('') : '<p>Корзина пуста</p>'}
    <div class="card">
      <div class="row"><span>Сумма:</span><b style="margin-left:auto">${money(total)}</b></div>
      <div class="row" style="margin-top:8px">
        <input id="promo" placeholder="Промокод" value="${promo}">
        <button class="ghost" onclick="applyPromo()">Применить</button>
        <button class="ghost" onclick="clearPromo()">Сбросить</button>
      </div>
      <p class="err" id="pe"></p>
      <button style="width:100%;margin-top:8px" ${items.length ? '' : 'disabled'}
              onclick="location.hash='checkout'">Оформить заказ</button>
    </div>
  `;
}
window.updateCart = async (id, qty) => {
  await api('/api/cart/' + id, { method: 'PUT', body: { qty: +qty } });
  await refreshMe(); renderNav(); screenCart();
};
window.removeCart = async id => {
  await api('/api/cart/' + id, { method: 'DELETE' });
  await refreshMe(); renderNav(); screenCart();
};
window.applyPromo = async () => {
  const code = $('#promo').value.trim();
  try {
    const r = await api('/api/promo', { method: 'POST', body: { code } });
    sessionStorage.promo = r.code;
    $('#pe').textContent = `Промокод применён: −${r.percent}%`;
  } catch { $('#pe').textContent = 'Промокод не найден'; }
};
window.clearPromo = () => { sessionStorage.removeItem('promo'); screenCart(); };


function screenCheckout() {
  app.innerHTML = `
    <button class="ghost" onclick="location.hash='cart'">← В корзину</button>
    <h1>Оформление</h1>
    <form id="f" class="card">
      <label>Способ доставки
        <select name="delivery_method" required>
          <option value="">— выберите —</option>
          <option>Курьер</option><option>Почта</option><option>Пункт выдачи</option>
        </select>
      </label>
      <label>Дата доставки
        <input name="delivery_date" type="date" required>
      </label>
      <label>Способ оплаты
        <select name="payment_method" required>
          <option value="">— выберите —</option>
          <option>При получении</option><option>СБП</option>
        </select>
      </label>
      <p class="err" id="e"></p>
      <button style="width:100%">Подтвердить заказ</button>
    </form>
  `;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    $('#e').textContent = '';
    const body = { ...Object.fromEntries(new FormData(e.target)), promo_code: sessionStorage.promo };
    try {
      const r = await api('/api/checkout', { method: 'POST', body });
      sessionStorage.removeItem('promo');
      await refreshMe(); renderNav();
      alert('Заказ №' + r.order_id + ' оформлен на ' + money(r.total));
      location.hash = 'profile';
    } catch (err) { $('#e').textContent = err.error || 'Ошибка оформления'; }
  };
}


async function screenProfile() {
  const orders = await api('/api/orders/my');
  app.innerHTML = `
    <h1>Мои заказы</h1>
    ${orders.length ? orders.map(o => `
      <div class="card">
        <div class="row">
          <b>Заказ №${o.id}</b>
          <span class="badge" style="margin-left:auto">${o.status}</span>
        </div>
        <div class="muted">${o.created_at} — <b>${money(o.total)}</b></div>
        ${o.discount ? `<div class="muted">Скидка: −${money(o.discount)}</div>` : ''}
        ${o.items.map(i => `
          <div class="row" style="border-top:1px solid #2a2a55;padding-top:8px;margin-top:8px">
            <span>${i.title} × ${i.qty} — ${money(i.price * i.qty)}</span>
            ${o.status === 'Завершено'
              ? `<button class="ghost" style="margin-left:auto"
                   onclick="location.hash='product/${i.product_id}'">Оставить отзыв</button>`
              : ''}
          </div>`).join('')}
      </div>`).join('') : '<p>Заказов пока нет</p>'}
  `;
}


function screenLogin() {
  app.innerHTML = `
    <h1>Вход</h1>
    <form id="f" class="card">
      <label>Логин<input name="login" required></label>
      <label>Пароль<input name="password" type="password" required></label>
      <p class="err" id="e"></p>
      <button style="width:100%">Войти</button>
      <p class="err" style="margin-top:10px">
        Ещё не зарегистрированы? <a href="#register">Регистрация</a>
      </p>
    </form>
  `;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await api('/api/login', { method: 'POST', body: fd });
      await refreshMe(); renderNav();
      location.hash = 'catalog';
    } catch (err) { $('#e').textContent = err.error || 'Ошибка'; }
  };
}


function screenRegister() {
  const rules = {
    login: v => /^[A-Za-z0-9]{6,}$/.test(v) || 'латиница/цифры, ≥6',
    password: v => v.length >= 8 || '≥8 символов',
    full_name: v => /^[А-Яа-яЁё\s]+$/.test(v) || 'только кириллица',
    phone: v => /^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(v) || '8(XXX)XXX-XX-XX',
    email: v => /^\S+@\S+\.\S+$/.test(v) || 'некорректная почта',
  };
  app.innerHTML = `
    <h1>Регистрация</h1>
    <form id="f" class="card">
      ${Object.keys(rules).map(k => `
        <label>${k}<input name="${k}" required><div class="err" data-e="${k}"></div></label>
      `).join('')}
      <p class="err" id="e"></p>
      <button style="width:100%">Создать аккаунт</button>
      <p class="err" style="margin-top:10px">Уже есть аккаунт? <a href="#login">Вход</a></p>
    </form>
  `;
  const f = $('#f');
  f.querySelectorAll('input').forEach(inp => inp.oninput = () => {
    const m = rules[inp.name](inp.value);
    f.querySelector(`[data-e="${inp.name}"]`).textContent = m === true ? '' : m;
  });
  f.onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f));
    for (const [k, r] of Object.entries(rules)) {
      const m = r(fd[k] || '');
      if (m !== true) return f.querySelector(`[data-e="${k}"]`).textContent = m;
    }
    try {
      await api('/api/register', { method: 'POST', body: fd });
      await refreshMe(); renderNav();
      location.hash = 'catalog';
    } catch (err) {
      (err.errors || []).forEach(x =>
        f.querySelector(`[data-e="${x.field}"]`).textContent = x.msg);
      $('#e').textContent = err.error || '';
    }
  };
}


let adminState = { status: 'all' };

async function screenAdmin() {
  if (!me || me.role !== 'admin') {
    app.innerHTML = '<p class="err">Доступ только для администратора</p>';
    return;
  }
  const orders = await api('/api/admin/orders?status=' + adminState.status);

  app.innerHTML = `
    <h1>Админ-панель · заказы</h1>
    <div class="filters">
      <select id="a-filter">
        ${['all', 'Новый', 'В обработке', 'Завершено'].map(s =>
          `<option value="${s}" ${adminState.status === s ? 'selected' : ''}>${s === 'all' ? 'Все статусы' : s}</option>`).join('')}
      </select>
      <select id="a-new-status">
        <option value="Новый">Новый</option>
        <option value="В обработке">В обработке</option>
        <option value="Завершено">Завершено</option>
      </select>
      <button onclick="massStatus()">Сменить статус выбранным</button>
      <button class="ghost" onclick="toggleAll()">Выбрать/снять все</button>
    </div>

    <div id="list">
      ${orders.length ? orders.map(o => `
        <div class="card">
          <label class="row">
            <input type="checkbox" class="ord-chk" data-id="${o.id}" style="width:auto">
            <b>№${o.id}</b> — ${o.login}
            <span class="badge" style="margin-left:auto">${o.status}</span>
          </label>
          <div class="muted">${o.created_at} · ${money(o.total)} · ${o.delivery_method} · ${o.payment_method}</div>
          ${o.items.map(i => `<div class="muted">• ${i.title} × ${i.qty} — ${money(i.price * i.qty)}</div>`).join('')}
        </div>`).join('') : '<p>Заказов нет</p>'}
    </div>
  `;
  $('#a-filter').onchange = e => { adminState.status = e.target.value; screenAdmin(); };
}
window.massStatus = async () => {
  const ids = [...document.querySelectorAll('.ord-chk:checked')].map(c => +c.dataset.id);
  if (!ids.length) return alert('Отметьте хотя бы один заказ');
  const status = $('#a-new-status').value;
  try {
    await api('/api/admin/orders/status', { method: 'POST', body: { ids, status } });
    alert(`Статус обновлён у ${ids.length} заказ(ов)`);
    screenAdmin();
  } catch (e) { alert(e.error || 'Ошибка'); }
};
window.toggleAll = () => {
  const chks = [...document.querySelectorAll('.ord-chk')];
  const allChecked = chks.every(c => c.checked);
  chks.forEach(c => c.checked = !allChecked);
};


const routes = {
  catalog: screenCatalog,
  product: screenProduct,
  cart: screenCart,
  checkout: screenCheckout,
  profile: screenProfile,
  login: screenLogin,
  register: screenRegister,
  admin: screenAdmin,
};

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || 'catalog';
  const [page, arg] = raw.split('/');
  return { page, arg };
}

async function route() {
  const { page, arg } = parseHash();
  const fn = routes[page] || routes.catalog;
  try {
    await fn(arg);
  } catch (e) {
    if (e.status === 401) { location.hash = 'login'; return; }
    app.innerHTML = `<p class="err">Ошибка: ${e.error || e.message}</p>
      <button class="ghost" onclick="location.hash='catalog'">← В каталог</button>`;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('hashchange', route);

window.addCart = async (id, btn) => {
  if (!me) { location.hash = 'login'; return; }
  try {
    await api('/api/cart', { method: 'POST', body: { product_id: id } });
    await refreshMe(); renderNav();
    if (btn) { btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 300); }
  } catch (e) { alert(e.error || 'Не удалось добавить'); }
};
window.toggleWish = async id => {
  if (!me) { location.hash = 'login'; return; }
  try {
    const r = await api('/api/wishlist', { method: 'POST', body: { product_id: id } });
    alert(r.added ? 'Добавлено в избранное' : 'Удалено из избранного');
  } catch { alert('Ошибка'); }
};


(async () => {
  await refreshMe();
  renderNav();
  if (!location.hash) location.hash = 'catalog';
  route();
})();