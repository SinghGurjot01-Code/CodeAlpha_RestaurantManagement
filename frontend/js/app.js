// DineHub Frontend Application — connected to Express 5 on Cloudflare Workers + D1 APIs
const API_BASE = ((window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || '').replace(/\/+$/, '');
const A = window.DINEHUB_ASSETS || {};
const I = {
  dash: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  orders: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h6',
  cal: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  fork: 'M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  chart: 'M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  out: 'M9 21H4V3h5M16 17l5-5-5-5M21 12H9',
  cart: 'M3 4h3l2 12h10l2-8H7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  chev: 'M6 9l6 6 6-6',
  logo: 'M3 20h18M5 17a7 7 0 0 1 14 0zM12 10V7M10 7h4'
};

const ic = (n) =>
  `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${I[n]}"/></svg>`;
const $ = (s) => document.querySelector(s),
  money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const ph = (k, c, l) =>
  A[k] ? `<img src="${A[k]}" class="ph ${c}" alt="${l}">` : `<div class="ph ${c}">${l}<br>(asset: ${k})</div>`;

let menu = [];
let cart = { 1: 1, 8: 1 };
let orders = [];
let res = [];
let inv = [];
let logs = [];
let tables = [];
let staff = [];
let dashStats = null;
let salesReport = null;
let cfg = { name: 'DineHub Restaurant', tax: 5, open: '10:00', close: '23:00' };
let orderTypeChoice = 'Dine-in';
let orderTableChoice = 'T1';

let fc = 'All',
  q = '',
  of = 'All',
  rf = 'All',
  oq = '',
  iq = '';
let authed = false,
  currentUser = null,
  authToken = '',
  nextR = 'admin-dashboard';

try {
  authToken = localStorage.getItem('dh_auth_token') || '';
} catch {}

function saveToken(t) {
  authToken = t || '';
  try {
    if (authToken) localStorage.setItem('dh_auth_token', authToken);
    else localStorage.removeItem('dh_auth_token');
  } catch {}
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const response = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers,
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = response.status;
    throw err;
  }
  return data;
}

function mapMenu(item) {
  return {
    id: item.id,
    n: item.name,
    c: item.category,
    p: Number(item.price),
    s: item.status,
    e: item.emoji || '🍽️',
    assetKey: item.assetKey || ''
  };
}

function mapOrder(o) {
  return {
    id: o.id,
    t: o.orderType,
    tb: o.tableNumber || '–',
    it: Number(o.itemCount),
    a: Number(o.totalAmount),
    s: o.status,
    items: o.items || [],
    createdAt: o.createdAt
  };
}

function mapReservation(r) {
  return {
    id: r.id,
    g: r.guestName,
    tb: r.tableNumber,
    d: `${r.date}, ${r.time}`,
    date: r.date,
    time: r.time,
    p: Number(r.partySize),
    s: r.status
  };
}

function mapInventory(x) {
  return {
    id: x.id,
    n: x.name,
    q: Number(x.quantity),
    u: x.unit,
    s: x.status,
    threshold: Number(x.lowStockThreshold ?? 15)
  };
}

function fmtLogTime(iso) {
  if (!iso) return 'Today';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return String(iso);
    return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Today';
  }
}

async function syncPublicData() {
  try {
    const [menuRes, ordersRes, resRes, tablesRes, settingsRes] = await Promise.all([
      api('/api/menu'),
      api('/api/orders'),
      api('/api/reservations'),
      api('/api/tables'),
      api('/api/settings')
    ]);
    menu = (menuRes.items || []).map(mapMenu);
    orders = (ordersRes.orders || []).map(mapOrder);
    res = (resRes.reservations || []).map(mapReservation);
    tables = tablesRes.tables || [];
    if (settingsRes.settings) {
      cfg = {
        name: settingsRes.settings.name,
        tax: Number(settingsRes.settings.taxPercent ?? 5),
        open: settingsRes.settings.open,
        close: settingsRes.settings.close
      };
    }
  } catch (err) {
    toast(err.message);
  }
}

async function syncAdminData() {
  if (!authed) return;
  try {
    const [invRes, logsRes, dashRes, repRes] = await Promise.all([
      api('/api/inventory'),
      api('/api/inventory/logs'),
      api('/api/dashboard'),
      api('/api/reports/daily-sales')
    ]);
    inv = (invRes.items || []).map(mapInventory);
    logs = (logsRes.logs || []).map((l) => [l.itemName, l.action, fmtLogTime(l.createdAt)]);
    dashStats = dashRes.stats || null;
    if (dashRes.staff) {
      staff = dashRes.staff.map((u) => [u.name || u.fullName, u.email, u.role, u.id]);
    }
    if (dashRes.tables) tables = dashRes.tables;
    if (dashRes.settings) {
      cfg = {
        name: dashRes.settings.name,
        tax: Number(dashRes.settings.taxPercent ?? 5),
        open: dashRes.settings.open,
        close: dashRes.settings.close
      };
    }
    salesReport = repRes || null;
  } catch (err) {
    if (err.status === 401) {
      authed = false;
      currentUser = null;
      saveToken('');
    }
  }
}

async function refreshAll() {
  await syncPublicData();
  if (authed) await syncAdminData();
  render();
}

async function login() {
  const emailEl = $('#login-email');
  const passEl = $('#login-password');
  const btn = $('#login-btn');
  const email = (emailEl ? emailEl.value : '').trim();
  const password = passEl ? passEl.value : '';
  if (!email || !password) {
    return toast('Enter your staff email and password');
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing in…';
  }
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    authed = true;
    currentUser = data.user;
    saveToken(data.token);
    await refreshAll();
    toast(`Welcome back, ${currentUser.name || currentUser.fullName}`);
    const t = nextR;
    nextR = 'admin-dashboard';
    if (location.hash == '#' + t) render();
    else location.hash = t;
  } catch (err) {
    toast(err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Staff Login';
    }
  }
}

async function logoutStaff() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {}
  authed = false;
  currentUser = null;
  saveToken('');
  toast('Logged out');
  location.hash = 'home';
  render();
}

async function saveS() {
  const f = new FormData($('#sf'));
  try {
    const data = await api('/api/settings', {
      method: 'PATCH',
      body: {
        name: f.get('n'),
        taxPercent: +f.get('t'),
        open: f.get('o'),
        close: f.get('c')
      }
    });
    cfg = {
      name: data.settings.name,
      tax: Number(data.settings.taxPercent),
      open: data.settings.open,
      close: data.settings.close
    };
    toast('Settings saved');
    render();
  } catch (err) {
    toast(err.message);
  }
}

function addS() {
  form(
    'Add staff',
    [
      { k: 'n', l: 'Name' },
      { k: 'e', l: 'Email', t: 'email' },
      { k: 'r', l: 'Role (Admin / Manager / Staff)', v: 'Staff' },
      { k: 'pw', l: 'Password', t: 'password', v: 'admin123' }
    ],
    async (d) => {
      try {
        await api('/api/staff', {
          method: 'POST',
          body: { fullName: d.n, email: d.e, role: d.r, password: d.pw }
        });
        toast('Staff member added');
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
  );
}

const cats = ['All', 'Starters', 'Main Course', 'Desserts', 'Beverages'];
const pc = {
  Preparing: 'y',
  Served: 'g',
  Ready: 'g',
  Upcoming: 'o',
  'Checked In': 'g',
  Completed: 'g',
  Cancelled: 'r',
  'In Stock': 'g',
  'Low Stock': 'r',
  'Out of Stock': 'r'
};
const pill = (s) => `<span class="pill ${pc[s] || 'o'}">${s}</span>`;
const toast = (m) => {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.className = 'on';
  setTimeout(() => (t.className = ''), 2400);
};
const low = () => (dashStats ? dashStats.lowStockCount : inv.filter((x) => x.q <= (x.threshold || 15)).length);
const cnt = () => Object.values(cart).reduce((a, b) => a + b, 0);

function form(title, fields, cb) {
  $('#dlg').innerHTML = `<h3 style="margin-bottom:14px">${title}</h3><form method="dialog" onsubmit="return false">${fields
    .map(
      (f) =>
        `<div class="field"><label>${f.l}</label><input name="${f.k}" type="${f.t || 'text'}" value="${
          f.v !== undefined ? f.v : ''
        }" required></div>`
    )
    .join('')}<div class="row"><button class="btn w" id="ok">Save</button><button class="btn s w" onclick="$('#dlg').close()" type="button">Cancel</button></div></form>`;
  $('#dlg').showModal();
  $('#ok').onclick = async () => {
    const f = $('#dlg form');
    if (!f.reportValidity()) return;
    const vals = Object.fromEntries(new FormData(f));
    $('#dlg').close();
    await cb(vals);
    render();
  };
}

function tabs(list, cur, fn) {
  return `<div class="tabs">${list
    .map((c) => `<button class="${c == cur ? 'on' : ''}" onclick="${fn}('${c}')">${c}</button>`)
    .join('')}</div>`;
}
const setC = (c) => {
    fc = c;
    render();
  },
  setO = (c) => {
    of = c;
    render();
  },
  setR = (c) => {
    rf = c;
    render();
  };

function dish(m, adm, pop) {
  if (pop)
    return `<div class="card row" style="padding:10px"><div class="thumb" style="overflow:hidden">${th(
      m,
      'width:100%;height:100%'
    )}</div><div><b>${m.n}</b><div>${money(m.p)}</div></div><button class="add sp" onclick="addC(${
      m.id
    })" aria-label="Add">${ic('plus')}</button></div>`;
  return adm
    ? `<div class="item"><div class="thumb" style="overflow:hidden">${th(
        m,
        'width:100%;height:100%'
      )}</div><div><b>${m.n}</b><div class="mut">${m.c} · <b style="color:#1b9a47;font-weight:600">${
        m.s
      }</b></div></div><b class="sp">${money(m.p)}</b><button class="btn s" onclick="editM(${m.id})">${ic(
        'edit'
      )}</button><button class="btn s" style="color:var(--r);background:var(--rs);border-color:#f5c2c2" onclick="delM(${
        m.id
      })">${ic('trash')}</button></div>`
    : `<div class="card"><div class="thumb" style="width:100%;height:110px;font-size:52px;margin-bottom:10px;overflow:hidden">${th(
        m,
        'width:100%;height:100%'
      )}</div><b>${m.n}</b><div class="mut">${m.c}</div><div class="row" style="margin-top:8px"><b>${money(
        m.p
      )}</b><button class="add sp" onclick="addC(${m.id})" aria-label="Add">${ic('plus')}</button></div></div>`;
}

const dk = { 1: 'm1', 7: 'm2', 8: 'm3', 4: 'm4' };
const th = (m, st) => {
  const key = (m && m.assetKey) || dk[m.id];
  return A[key] ? `<img src="${A[key]}" alt="${m.n}" style="${st};object-fit:cover">` : m.e;
};
const filt = () => menu.filter((m) => (fc == 'All' || m.c == fc) && m.n.toLowerCase().includes(q.toLowerCase()));

function mlist(adm) {
  const l = filt();
  return l.length
    ? adm
      ? `<div class="card">${l.map((m) => dish(m, 1)).join('')}</div>`
      : `<div class="grid g3">${l.map((m) => dish(m)).join('')}</div>`
    : '<p class="mut">No items found.</p>';
}
function sr(adm) {
  return `<div class="search">${ic('search')}<input placeholder="Search menu items…" value="${q}" oninput="q=this.value;$('#list').innerHTML=mlist(${
    adm ? 1 : 0
  })"></div>`;
}
function addC(id) {
  cart[id] = (cart[id] || 0) + 1;
  toast('Added to order');
  render();
}
async function delM(id) {
  try {
    await api(`/api/menu/${id}`, { method: 'DELETE' });
    delete cart[id];
    toast('Menu item deleted');
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
}
function editM(id) {
  const m = menu.find((x) => x.id == id);
  if (!m) return;
  form(
    'Edit item',
    [
      { k: 'n', l: 'Name', v: m.n },
      { k: 'p', l: 'Price (₹)', t: 'number', v: m.p }
    ],
    async (d) => {
      try {
        await api(`/api/menu/${id}`, {
          method: 'PATCH',
          body: { name: d.n, price: +d.p }
        });
        toast('Menu item updated');
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
  );
}
function addM() {
  form(
    'Add menu item',
    [
      { k: 'n', l: 'Name' },
      { k: 'c', l: 'Category (Starters / Main Course / Desserts / Beverages)', v: 'Main Course' },
      { k: 'p', l: 'Price (₹)', t: 'number' }
    ],
    async (d) => {
      try {
        await api('/api/menu', {
          method: 'POST',
          body: { name: d.n, category: d.c, price: +d.p, status: 'In Stock', emoji: '🍽️' }
        });
        toast('Menu item created');
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
  );
}
function addI() {
  form(
    'Add inventory item',
    [
      { k: 'n', l: 'Item' },
      { k: 'q', l: 'Current stock', t: 'number' },
      { k: 'u', l: 'Unit', v: 'kg' }
    ],
    async (d) => {
      try {
        await api('/api/inventory', {
          method: 'POST',
          body: { name: d.n, quantity: +d.q, unit: d.u }
        });
        toast('Inventory updated');
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
  );
}
function editI(id) {
  const x = inv.find((item) => item.id == id);
  if (!x) return;
  form(
    `Update Stock — ${x.n}`,
    [
      { k: 'q', l: `New Stock (${x.u})`, t: 'number', v: x.q },
      { k: 'u', l: 'Unit', v: x.u }
    ],
    async (d) => {
      try {
        await api(`/api/inventory/${id}`, {
          method: 'PATCH',
          body: { quantity: +d.q, unit: d.u }
        });
        toast('Stock updated');
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
  );
}

async function cyc(orderId) {
  try {
    await api(`/api/orders/${orderId}/status`, { method: 'PATCH', body: {} });
    toast(`Order #ORD-${orderId} status updated`);
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
}

async function cycR(resId) {
  try {
    await api(`/api/reservations/${resId}/status`, { method: 'PATCH', body: {} });
    toast('Reservation status updated');
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
}

function qty(id, d) {
  cart[id] = (cart[id] || 0) + d;
  if (cart[id] <= 0) delete cart[id];
  render();
}

async function place() {
  const ks = Object.keys(cart).filter((k) => menu.some((m) => m.id == k));
  if (!ks.length) return toast('Your order is empty');
  const btn = $('#place-order-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Placing Order…';
  }
  try {
    const items = ks.map((k) => ({ menuItemId: Number(k), quantity: Number(cart[k]) }));
    const resData = await api('/api/orders', {
      method: 'POST',
      body: {
        orderType: orderTypeChoice,
        tableNumber: orderTypeChoice === 'Dine-in' ? orderTableChoice : '–',
        items
      }
    });
    cart = {};
    await refreshAll();
    toast(`Order #ORD-${resData.order.id} placed!`);
    location.hash = 'status';
  } catch (err) {
    toast(err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Place Order';
    }
  }
}

async function reserve() {
  const f = $('#rf');
  if (!f.reportValidity()) return;
  const d = new FormData(f);
  const date = d.get('d');
  const time = d.get('t');
  const partySize = +d.get('p');
  const guestName = (d.get('g') || 'Guest').trim() || 'Guest';

  try {
    // 1. Check real table availability first
    const avail = await api(
      `/api/reservations/availability?date=${encodeURIComponent(date)}&time=${encodeURIComponent(
        time
      )}&partySize=${encodeURIComponent(partySize)}`
    );
    if (!avail.available) {
      return toast(`No tables available for ${partySize} guests at ${time}`);
    }
    // 2. Persist reservation on the best available table
    const created = await api('/api/reservations', {
      method: 'POST',
      body: {
        guestName,
        date,
        time,
        partySize
      }
    });
    f.reset();
    await refreshAll();
    toast(`Table ${created.reservation.tableNumber} reserved for ${created.reservation.guestName}!`);
  } catch (err) {
    toast(err.message);
  }
}

// ===== customer =====
function cust(r) {
  const nav = [
    ['home', 'Home'],
    ['menu', 'Menu'],
    ['reserve', 'Reserve'],
    ['order', 'Order'],
    ['status', 'Status']
  ];
  const h = `<header class="hdr"><a href="#home" class="logo">${ic(
    'logo'
  )}<span>Dine<b>Hub</b></span></a><nav class="nav">${nav
    .map((n) => `<a href="#${n[0]}" class="${r == n[0] ? 'on' : ''}">${n[1]}</a>`)
    .join('')}<a href="${
    authed ? '#admin-dashboard' : '#login'
  }" class="av" style="width:34px;height:34px;padding:0;border:0;color:#fff">${ic('user')}</a></nav></header><div class="wrap">`;
  let b = '';
  if (r == 'home')
    b = `<section class="hero"><div class="tx"><h1>Discover<span>Our Menu</span></h1><p>Delicious food, great ambience and a memorable dining experience.</p><a class="btn o" href="#menu">Order Now →</a></div>${
      A.pizza ? `<img src="${A.pizza}" alt="">` : ''
    }</section>
<div class="row" style="margin:26px 0 12px"><h2>Popular Items</h2><a class="sp" style="color:var(--o);font-weight:600" href="#menu">View All</a></div><div class="grid g3">${menu
      .slice(0, 3)
      .map((m) => dish(m, 0, 1))
      .join('')}</div>
${
  A.hero ? `<img src="${A.hero}" alt="" style="width:100%;display:block;border-radius:18px;margin-top:26px">` : ''
}<div class="card row" style="margin-top:26px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><h2>Reserve a Table</h2><p class="mut">Book your table in advance for a seamless dining experience.</p><a class="btn" href="#reserve">Find Tables</a></div><div style="width:220px;max-width:100%">${ph(
      'table',
      '',
      'Table illustration'
    )}</div></div>`;
  if (r == 'menu')
    b = `<h1>Our Menu</h1>${sr(0)}${tabs(cats, fc, 'setC')}<div id="list" style="margin-top:14px">${mlist(0)}</div>`;
  if (r == 'reserve')
    b = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:center"><div><h1 style="font-size:30px">Reserve a Table</h1><p class="mut" style="margin-bottom:18px">Book your table in advance for a seamless dining experience.</p><form id="rf"><div class="inp">${ic(
      'user'
    )}<input name="g" placeholder="Your Name (e.g. Aman Singh)" value="Guest" required></div><div class="inp"><input name="d" type="date" value="${new Date()
      .toISOString()
      .slice(0, 10)}" required></div><div class="inp">${ic(
      'clock'
    )}<select name="t"><option>7:00 PM</option><option selected>8:00 PM</option><option>9:00 PM</option></select></div><div class="inp">${ic(
      'user'
    )}<select name="p">${[1, 2, 3, 4, 5, 6, 8]
      .map((n) => `<option value="${n}" ${n == 4 ? 'selected' : ''}>${n} ${n > 1 ? 'People' : 'Person'}</option>`)
      .join(
        ''
      )}</select></div><button type="button" class="btn w" style="justify-content:center;padding:13px" onclick="reserve()">Find Tables</button></form></div>${ph(
      'table',
      '',
      'Table illustration'
    )}</div>`;
  if (r == 'order') {
    const ks = Object.keys(cart).filter((k) => menu.some((m) => m.id == k)),
      sub = ks.reduce((a, k) => {
        const m = menu.find((m) => m.id == k);
        return a + (m ? m.p * cart[k] : 0);
      }, 0),
      tax = Math.round((sub * cfg.tax) / 100);
    b = `<h1>Your Order</h1><div class="card" style="margin-top:14px">${
      ks.length
        ? `<div class="row" style="margin-bottom:12px;flex-wrap:wrap"><div class="field" style="margin:0;flex:1;min-width:140px"><label>Order Type</label><select onchange="orderTypeChoice=this.value;render()">${[
            'Dine-in',
            'Takeaway',
            'Online'
          ]
            .map((t) => `<option ${orderTypeChoice == t ? 'selected' : ''}>${t}</option>`)
            .join('')}</select></div>${
            orderTypeChoice === 'Dine-in'
              ? `<div class="field" style="margin:0;flex:1;min-width:140px"><label>Table</label><select onchange="orderTableChoice=this.value">${Array.from(
                  { length: 9 },
                  (_, i) => 'T' + (i + 1)
                )
                  .map((t) => `<option ${orderTableChoice == t ? 'selected' : ''}>${t}</option>`)
                  .join('')}</select></div>`
              : ''
          }</div>` +
          ks
            .map((k) => {
              const m = menu.find((x) => x.id == k);
              return `<div class="item"><div class="thumb" style="overflow:hidden">${th(
                m,
                'width:100%;height:100%'
              )}</div><b>${m.n}</b><span class="qty sp"><button onclick="qty(${k},-1)">−</button>${
                cart[k]
              }<button onclick="qty(${k},1)">+</button></span><b style="width:70px;text-align:right">${money(
                m.p * cart[k]
              )}</b></div>`;
            })
            .join('') +
          `<div class="row" style="margin-top:12px"><span>Subtotal</span><b class="sp">${money(
            sub
          )}</b></div><div class="row"><span>Tax (${cfg.tax}%)</span><b class="sp">${money(
            tax
          )}</b></div><div class="row" style="font-size:17px;margin:8px 0 12px;background:#d9f2d3;border-radius:8px;padding:8px 12px"><b>Total</b><b class="sp" style="color:var(--g)">${money(
            sub + tax
          )}</b></div><button class="btn o w" id="place-order-btn" onclick="place()">Place Order</button>`
        : '<p class="mut">Your order is empty. <a href="#menu" style="color:var(--o)">Browse the menu</a></p>'
    }</div>`;
  }
  if (r == 'login')
    b = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0;border-radius:20px;overflow:hidden;box-shadow:0 6px 30px rgba(0,0,0,.1);margin-top:10px"><div style="background:url(${
      A.pasta
    }) center/cover,var(--g);color:#fff;padding:32px;min-height:460px"><div class="logo" style="color:#fff;font-size:30px">${ic(
      'logo'
    )}DineHub</div><p style="font-size:17px;font-weight:600;margin:8px 0 16px">Restaurant Management System</p><p style="max-width:300px;opacity:.9">Complete restaurant solution to manage orders, reservations, menu and inventory seamlessly.</p><h3 style="margin:20px 0 8px">Features</h3>${[
      'Order Management',
      'Table Reservations',
      'Menu Management',
      'Inventory Tracking',
      'Auto Inventory Update',
      'Role-based Access'
    ]
      .map((f) => `<div style="margin:5px 0">• ${f}</div>`)
      .join(
        ''
      )}</div><div style="padding:32px;background:#fff;display:flex;flex-direction:column;justify-content:center"><h2 style="margin-bottom:14px">Staff Login</h2><div class="field"><label>Email</label><input id="login-email" type="email" value="admin@dinehub.com" placeholder="admin@dinehub.com"></div><div class="field"><label>Password</label><input id="login-password" type="password" value="admin123"></div><button type="button" id="login-btn" class="btn w" style="justify-content:center" onclick="login()">Staff Login</button><a class="btn o w" style="justify-content:center;margin-top:10px" href="#home">Continue as Customer</a><p class="mut" style="margin-top:10px">Staff accounts: admin@dinehub.com / riya@dinehub.com / sahil@dinehub.com (password: admin123)</p></div></div>`;
  if (r == 'status') {
    const sp = ['Preparing', 'Ready', 'Served'];
    b = `<h1>Order Status</h1><p class="mut">Track your orders in real time.</p>${orders
      .slice(0, 6)
      .map(
        (o) =>
          `<div class="card" style="margin:12px 0"><div class="row"><b>#ORD-${o.id}</b><span class="mut">${o.t} · ${
            o.it
          } items</span><b class="sp">${money(o.a)}</b></div><div class="row" style="margin-top:14px;gap:4px">${[
            'Placed',
            ...sp
          ]
            .map((t, i) => {
              const c = 1 + sp.indexOf(o.s);
              return `<div style="flex:1;text-align:center;font-size:12px"><div style="height:8px;border-radius:4px;background:${
                i <= c ? 'var(--o)' : '#eee'
              }"></div><div style="margin-top:6px;font-weight:${i == c ? 700 : 400};color:${
                i <= c ? 'var(--ink)' : 'var(--mut)'
              }">${t}</div></div>`;
            })
            .join('')}</div></div>`
      )
      .join('')}<a class="btn" href="#menu">Order more</a>`;
  }
  return h + b + '</div>';
}

function welcome() {
  return `<div style="min-height:100vh;display:flex;justify-content:center;background:#f3efe7"><div style="position:relative;width:100%;max-width:420px;min-height:100vh;background:#fff;overflow:hidden;text-align:center;padding:12vh 28px 0"><div class="logo" style="flex-direction:column;font-size:36px;font-weight:800;gap:4px"><svg class="i" style="width:84px;height:84px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${I.logo}"/></svg>DineHub</div><p class="mut" style="margin:4px 0 36px">Restaurant Management</p><a class="btn o w" style="justify-content:center;padding:14px;position:relative;z-index:2" href="#home">Continue as Customer</a><a class="btn w" style="justify-content:center;padding:13px;margin-top:12px;background:#fff;color:var(--g);border:2px solid var(--g);position:relative;z-index:2" href="#login">Staff Login</a><svg viewBox="0 0 400 200" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:100%;height:34%"><path d="M0 70C110 0 230 130 400 50V200H0Z" fill="#1c8a3a"/><path d="M0 130C120 80 250 190 400 120V200H0Z" fill="#f57c00"/></svg></div></div>`;
}

// ===== admin =====
function adm(r) {
  const nav = [
    ['dashboard', 'Dashboard', 'dash'],
    ['orders', 'Orders', 'orders'],
    ['reservations', 'Reservations', 'cal'],
    ['menu', 'Menu', 'fork'],
    ['inventory', 'Inventory', 'box'],
    ['reports', 'Reports', 'chart']
  ];
  const side = `<aside class="side" id="side"><div class="logo">${ic(
    'logo'
  )}<span>Dine<b>Hub</b></span></div>${nav
    .map((n) => `<a href="#admin-${n[0]}" class="${r == 'admin-' + n[0] ? 'on' : ''}">${ic(n[2])}${n[1]}</a>`)
    .join('')}<a href="#admin-settings" class="${
    r == 'admin-settings' ? 'on' : ''
  }" style="margin-top:auto">${ic('gear')}Settings</a><a href="#home" onclick="logoutStaff();return false">${ic(
    'out'
  )}Logout</a></aside>`;
  const T = r.slice(6),
    title = T[0].toUpperCase() + T.slice(1);
  let b = '';
  const userName = (currentUser && (currentUser.name || currentUser.fullName)) || 'Admin';
  const sub = {
    dashboard: `Welcome back, ${userName}`,
    orders: 'View and manage restaurant orders',
    reservations: 'Manage table bookings and availability',
    menu: 'Manage your restaurant menu items',
    inventory: 'Track ingredients and stock levels',
    reports: 'Sales and performance insights',
    settings: 'Restaurant profile, staff and tables'
  };
  const rev = dashStats ? dashStats.totalRevenue : orders.reduce((a, o) => a + o.a, 0);
  const totalOrd = dashStats ? dashStats.totalOrders : orders.length;
  const totalRes = dashStats ? dashStats.totalReservations : res.length;
  const otab = (o) =>
    `<tr><td>#ORD-${o.id}</td><td>${o.t}</td><td>${o.tb}</td><td>${o.it} items</td><td>${money(
      o.a
    )}</td><td><span style="cursor:pointer" onclick="cyc(${o.id})">${pill(o.s)}</span></td></tr>`;

  if (T == 'dashboard') {
    const ys = [4, 10, 14, 13, 19, 22, 28],
      xl = ['9 AM', '11 AM', '1 PM', '3 PM', '5 PM', '7 PM', '9 PM'],
      X = (i) => 52 + i * 62,
      Y = (v) => 170 - v * 5,
      d = ys.map((v, i) => [X(i), Y(v)]);
    let p = 'M' + d[0];
    for (let i = 1; i < d.length; i++) {
      const m = (d[i - 1][0] + d[i][0]) / 2;
      p += `C${m},${d[i - 1][1]} ${m},${d[i][1]} ${d[i][0]},${d[i][1]}`;
    }
    const ago = ['Just now', '5 min ago', '8 min ago'];
    b = `<div class="grid g4">${[
      ['orders', money(rev), 'Total Revenue', '+12%', 'o'],
      ['cart', totalOrd, 'Orders', '+8%', 'g'],
      ['cal', totalRes, 'Reservations', '+25%', 'o'],
      ['box', low(), 'Low Stock Items', '-8%', 'r']
    ]
      .map(
        (k) =>
          `<div class="card kpi t${k[4]}"><div class="ic">${ic(k[0])}</div><div><b>${k[1]}</b><span class="mut">${
            k[2]
          }</span><em class="dl ${k[3][0] == '-' ? 'dn' : 'up'}">${k[3][0] == '-' ? '↘' : '↗'} ${
            k[3]
          }</em></div></div>`
      )
      .join('')}</div>
<div class="grid g2" style="margin-top:14px"><div class="card"><div class="row"><h3>Revenue Overview</h3><span class="pillbox sp">Today ${ic(
      'chev'
    )}</span></div><svg viewBox="0 0 450 195" style="width:100%;margin-top:8px"><defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f57c00" stop-opacity=".35"/><stop offset="1" stop-color="#f57c00" stop-opacity="0"/></linearGradient></defs>${[
      0, 1, 2, 3, 4, 5
    ]
      .map(
        (k) =>
          `<line x1="40" x2="440" y1="${170 - k * 30}" y2="${
            170 - k * 30
          }" stroke="#ece7dd"/><text x="32" y="${
            174 - k * 30
          }" font-size="10" fill="#6b7a70" text-anchor="end">${k ? k * 6 + 'K' : '0'}</text>`
      )
      .join('')}<path d="${p}L${X(6)},170L${X(0)},170Z" fill="url(#gr)"/><path d="${p}" fill="none" stroke="#f57c00" stroke-width="3" stroke-linecap="round"/>${d
      .map((c) => `<circle cx="${c[0]}" cy="${c[1]}" r="3.5" fill="#fff" stroke="#f57c00" stroke-width="2"/>`)
      .join('')}${xl
      .map((t, i) => `<text x="${X(i)}" y="190" font-size="10" fill="#6b7a70" text-anchor="middle">${t}</text>`)
      .join('')}</svg></div>
<div class="card"><div class="row"><h3>Recent Orders</h3><a class="sp" style="color:var(--o);font-weight:600;font-size:13px" href="#admin-orders">View All</a></div>${orders
      .slice(0, 3)
      .map(
        (o, i) =>
          `<div class="item"><div class="thumb" style="width:40px;height:40px;color:var(--o)">${ic(
            'orders'
          )}</div><div><b>#ORD-${o.id}</b><div class="mut">${
            o.tb != '–' ? 'Table ' + o.tb.slice(1) : o.t
          } · ${o.it} items</div></div><div class="sp" style="text-align:right"><b>${money(
            o.a
          )}</b><div class="mut">${ago[i] || 'Today'}</div></div></div>`
      )
      .join('')}</div></div>`;
  }
  if (T == 'orders') {
    window.oT = () =>
      `<div class="card tw" style="padding:0"><table><tr><th>Order ID</th><th>Type</th><th>Table</th><th>Items</th><th>Amount</th><th>Status</th></tr>${orders
        .filter(
          (o) =>
            (of == 'All' || o.t == of) &&
            ('#ORD-' + o.id + ' ' + o.t + ' ' + o.tb).toLowerCase().includes(oq.toLowerCase())
        )
        .map(otab)
        .join('')}</table></div>`;
    b = `${tabs(['All', 'Dine-in', 'Takeaway', 'Online'], of, 'setO')}<div class="search">${ic(
      'search'
    )}<input placeholder="Search by order ID, table or item…" value="${oq}" oninput="oq=this.value;$('#list').innerHTML=oT()"></div><div id="list">${oT()}</div><p class="mut">Tap a status to advance it.</p>`;
  }
  if (T == 'reservations') {
    const l = res.filter((x) => rf == 'All' || x.s == rf);
    b = `<div class="pillbox" style="margin-bottom:12px">${ic('cal')}Nov 19, 2026 ${ic('chev')}</div>${tabs(
      ['All', 'Upcoming', 'Checked In', 'Completed', 'Cancelled'],
      rf,
      'setR'
    )}<div class="card tw" style="margin-top:12px;padding:0"><table><tr><th>Guest</th><th>Table</th><th>Date & Time</th><th>People</th><th>Status</th></tr>${l
      .map(
        (x) =>
          `<tr><td>${x.g}</td><td>${x.tb}</td><td>${x.d}</td><td>${x.p}</td><td><span style="cursor:pointer" onclick="cycR(${x.id})">${pill(
            x.s
          )}</span></td></tr>`
      )
      .join('')}</table></div>`;
  }
  if (T == 'menu') b = `${tabs(cats, fc, 'setC')}${sr(1)}<div id="list">${mlist(1)}</div>`;
  if (T == 'inventory') {
    window.iT = () =>
      `<div class="card tw" style="padding:0"><table><tr><th>Item</th><th>Current Stock</th><th>Unit</th><th>Status</th></tr>${inv
        .filter((x) => x.n.toLowerCase().includes(iq.toLowerCase()))
        .map(
          (x) =>
            `<tr style="cursor:pointer" onclick="editI(${x.id})" title="Click to adjust stock"><td>${x.n}</td><td>${
              x.q
            }</td><td>${x.u}</td><td>${pill(x.q <= (x.threshold || 15) ? 'Low Stock' : 'In Stock')}</td></tr>`
        )
        .join('')}</table></div>`;
    b = `<div class="search">${ic(
      'search'
    )}<input placeholder="Search inventory item…" value="${iq}" oninput="iq=this.value;$('#list').innerHTML=iT()"></div><div id="list">${iT()}</div><div class="card" style="margin-top:14px"><h3 style="margin-bottom:6px">Stock Log</h3>${logs
      .map((l) => `<div class="item"><b>${l[0]}</b><span class="mut">${l[1]}</span><span class="mut sp">${l[2]}</span></div>`)
      .join('')}</div>`;
  }
  if (T == 'reports') {
    const tot = salesReport ? salesReport.totalSales : orders.reduce((a, o) => a + o.a, 0),
      ordCount = salesReport ? salesReport.totalOrders : orders.length,
      avgOrd = salesReport ? salesReport.averageOrderValue : Math.round(tot / Math.max(orders.length, 1)),
      resCount = salesReport ? salesReport.totalReservations : res.length,
      by = ['Preparing', 'Ready', 'Served'].map((x) => [
        x,
        salesReport && salesReport.ordersByStatus
          ? salesReport.ordersByStatus[x] || 0
          : orders.filter((o) => o.s == x).length
      ]),
      mx = Math.max(...by.map((x) => x[1]), 1),
      top = [...menu].sort((a, b) => b.p - a.p).slice(0, 4);
    b = `<div class="grid g4" style="margin-bottom:14px">${[
      ['Total Sales', money(tot)],
      ['Orders', ordCount],
      ['Avg. Order', money(avgOrd)],
      ['Reservations', resCount]
    ]
      .map(
        (k) =>
          `<div class="card"><span class="mut">${k[0]}</span><b style="display:block;font-size:22px">${k[1]}</b></div>`
      )
      .join(
        ''
      )}</div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))"><div class="card"><h3>Orders by status</h3><div class="bars" style="margin-top:14px">${by
      .map((x) => `<div><i style="height:${(x[1] / mx) * 140}px"></i>${x[0]} (${x[1]})</div>`)
      .join('')}</div></div><div class="card"><h3>Top menu items</h3>${top
      .map(
        (m) =>
          `<div class="item"><div class="thumb" style="width:40px;height:40px;overflow:hidden">${th(
            m,
            'width:100%;height:100%'
          )}</div><b>${m.n}</b><b class="sp">${money(m.p)}</b></div>`
      )
      .join('')}</div></div>`;
  }
  if (T == 'settings') {
    const tb = (
      tables.length
        ? tables.map((tObj) => {
            const st = tObj.status;
            const cls = st === 'Occupied' ? 'r' : st === 'Reserved' ? 'o' : 'g';
            return `<div class="pill ${cls}" style="text-align:center;padding:10px 0;border-radius:12px"><b>${tObj.tableNumber}</b><div style="font-size:10px">${st}</div></div>`;
          })
        : Array.from({ length: 9 }, (_, i) => {
            const t = 'T' + (i + 1),
              oc = res.some((x) => x.tb == t && x.s == 'Checked In') || orders.some((o) => o.tb == t && o.s == 'Preparing'),
              rv = res.some((x) => x.tb == t && x.s == 'Upcoming');
            return `<div class="pill ${oc ? 'r' : rv ? 'o' : 'g'}" style="text-align:center;padding:10px 0;border-radius:12px"><b>${t}</b><div style="font-size:10px">${
              oc ? 'Occupied' : rv ? 'Reserved' : 'Free'
            }</div></div>`;
          })
    ).join('');
    b = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="card"><h3 style="margin-bottom:12px">Restaurant Profile</h3><form id="sf"><div class="field"><label>Name</label><input name="n" value="${
      cfg.name
    }"></div><div class="field"><label>Tax (%)</label><input name="t" type="number" value="${
      cfg.tax
    }"></div><div class="row"><div class="field" style="flex:1"><label>Opens</label><input name="o" type="time" value="${
      cfg.open
    }"></div><div class="field" style="flex:1"><label>Closes</label><input name="c" type="time" value="${
      cfg.close
    }"></div></div><button type="button" class="btn" onclick="saveS()">Save Changes</button></form></div><div class="card"><div class="row"><h3>Staff &amp; Roles</h3><button class="btn s sp" onclick="addS()">${ic(
      'plus'
    )}Add</button></div>${staff
      .map(
        (u) =>
          `<div class="item"><div class="av">${u[0][0]}</div><div><b>${u[0]}</b><div class="mut">${
            u[1]
          }</div></div><span class="pill ${u[2] == 'Admin' ? 'o' : 'g'} sp">${u[2]}</span></div>`
      )
      .join(
        ''
      )}</div><div class="card"><h3 style="margin-bottom:12px">Tables</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(70px,1fr))">${tb}</div></div></div>`;
  }
  const act =
    T == 'dashboard'
      ? `<div class="row"><span class="pillbox">${ic('cal')}Today, Nov 19, 2026 ${ic(
          'chev'
        )}</span><span class="bell">${ic('bell')}</span><span class="av">${userName[0] || 'A'}</span></div>`
      : T == 'menu'
      ? `<button class="btn" onclick="addM()">${ic('plus')}Add Item</button>`
      : T == 'inventory'
      ? `<button class="btn" onclick="addI()">${ic('plus')}Add Item</button>`
      : T == 'reservations'
      ? `<a class="btn" href="#reserve">${ic('plus')}New Reservation</a>`
      : '';
  return `<div class="admin">${side}<main class="main"><div class="top"><button class="burger" onclick="$('#side').classList.toggle('open')" aria-label="Menu">${ic(
    'menu'
  )}</button><div><h1>${title}</h1><span class="mut">${sub[T]}</span></div><div class="sp">${act}</div></div>${b}</main></div>`;
}

function render() {
  let r = location.hash.slice(1) || 'home';
  if (r.startsWith('admin-') && !authed) {
    nextR = r;
    r = 'login';
  }
  $('#app').innerHTML = r == 'welcome' ? welcome() : r.startsWith('admin-') ? adm(r) : cust(r);
}

addEventListener('hashchange', () => {
  q = '';
  oq = '';
  iq = '';
  fc = 'All';
  render();
  scrollTo(0, 0);
});

// Boot: verify staff session if any, load live data from D1, and render
(async function init() {
  render();
  try {
    const meData = await api('/api/auth/me');
    if (meData && meData.user) {
      authed = true;
      currentUser = meData.user;
    }
  } catch {
    authed = false;
    currentUser = null;
    saveToken('');
  }
  await refreshAll();
})();
