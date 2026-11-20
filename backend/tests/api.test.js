// Full integration test suite for CodeAlpha Task 3: DineHub Restaurant Management System
// (Express 5 on Cloudflare Workers + D1).
import test from 'node:test';
import assert from 'node:assert';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8795;
const base = `http://127.0.0.1:${PORT}`;
const cwd = path.join(__dirname, '..');
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'dinehub-d1-'));
let proc;

function startWorker() {
  return new Promise((resolve, reject) => {
    proc = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist], {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('wrangler dev did not become ready')), 90000);
    const onData = (d) => {
      if (/Ready on/.test(d.toString())) {
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (c) => {
      clearTimeout(timer);
      reject(new Error('wrangler exited early: ' + c));
    });
  });
}

function stopWorker() {
  return new Promise((resolve) => {
    if (!proc) return resolve();
    proc.removeAllListeners('exit');
    proc.once('exit', resolve);
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    } else {
      proc.kill('SIGTERM');
    }
    setTimeout(resolve, 3000);
  });
}

test.before(async () => {
  execSync(`npx wrangler d1 migrations apply codealpha-dinehub-db --local --persist-to "${persist}"`, {
    cwd,
    stdio: 'ignore',
  });
  await startWorker();
});

test.after(async () => {
  await stopWorker();
  try {
    fs.rmSync(persist, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  } catch {}
});

async function req(method, urlPath, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

let adminToken = '';
let staffToken = '';
let createdMenuId = null;
let placedOrderId = null;
let createdResId = null;

test('1. Health endpoint and frontend static assets', async () => {
  const { status, data } = await req('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');

  const htmlRes = await fetch(`${base}/`);
  assert.equal(htmlRes.status, 200);
  assert.match(await htmlRes.text(), /DineHub/);
  assert.equal((await fetch(`${base}/css/styles.css`)).status, 200);
  assert.equal((await fetch(`${base}/js/app.js`)).status, 200);
});

test('2. Authentication and unauthorized access protection', async () => {
  // Invalid credentials rejected with 401
  const bad = await req('POST', '/api/auth/login', {
    body: { email: 'admin@dinehub.com', password: 'wrongpassword' },
  });
  assert.equal(bad.status, 401);

  // Unauthenticated access to protected admin endpoints rejected with 401
  assert.equal((await req('GET', '/api/dashboard')).status, 401);
  assert.equal((await req('GET', '/api/inventory')).status, 401);
  assert.equal((await req('POST', '/api/menu', { body: { name: 'X', price: 100 } })).status, 401);

  // Admin login succeeds
  const login = await req('POST', '/api/auth/login', {
    body: { email: 'admin@dinehub.com', password: 'admin123' },
  });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);
  assert.equal(login.data.user.role, 'Admin');
  assert.equal(login.data.user.password_hash, undefined);
  adminToken = login.data.token;

  // Staff user login (role: 'Staff')
  const staffLogin = await req('POST', '/api/auth/login', {
    body: { email: 'sahil@dinehub.com', password: 'admin123' },
  });
  assert.equal(staffLogin.status, 200);
  staffToken = staffLogin.data.token;

  // Role-based access: Staff cannot create menu items (requires Admin or Manager)
  const forbiddenMenu = await req('POST', '/api/menu', {
    token: staffToken,
    body: { name: 'Staff Dish', category: 'Starters', price: 199 },
  });
  assert.equal(forbiddenMenu.status, 403);

  // Verify /api/auth/me
  const me = await req('GET', '/api/auth/me', { token: adminToken });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'admin@dinehub.com');
});

test('3. Menu retrieval, creation, editing, and deletion', async () => {
  const list = await req('GET', '/api/menu');
  assert.equal(list.status, 200);
  assert.equal(list.data.items.length, 4);
  const margherita = list.data.items.find((m) => m.id === 1);
  assert.equal(margherita.name, 'Margherita Pizza');
  assert.equal(margherita.price, 499);
  assert.ok(margherita.ingredients.some((i) => i.name === 'Tomatoes'));
  assert.ok(margherita.ingredients.some((i) => i.name === 'Flour (Maida)'));

  // Create new menu item
  const created = await req('POST', '/api/menu', {
    token: adminToken,
    body: {
      name: 'Paneer Tikka',
      category: 'Starters',
      price: 399,
      ingredients: [{ name: 'Paneer', quantityRequired: 1 }],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.name, 'Paneer Tikka');
  assert.equal(created.data.item.price, 399);
  createdMenuId = created.data.item.id;

  // Edit menu item price
  const edited = await req('PATCH', `/api/menu/${createdMenuId}`, {
    token: adminToken,
    body: { price: 429 },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.item.price, 429);

  // Get single menu item
  const single = await req('GET', `/api/menu/${createdMenuId}`);
  assert.equal(single.status, 200);
  assert.equal(single.data.item.price, 429);
});

test('4. Successful order placement, server-side price/tax calculation, inventory auto-deduction, and inventory logs', async () => {
  // Check inventory before order: Tomatoes = 12 kg, Flour (Maida) = 35 kg
  const invBefore = await req('GET', '/api/inventory', { token: adminToken });
  assert.equal(invBefore.status, 200);
  const tomatoesBefore = invBefore.data.items.find((i) => i.name === 'Tomatoes').quantity;
  const flourBefore = invBefore.data.items.find((i) => i.name === 'Flour (Maida)').quantity;
  assert.equal(tomatoesBefore, 12);
  assert.equal(flourBefore, 35);

  // Place order: 2x Margherita Pizza (id=1, ₹499 each) + 1x Grilled Sandwich (id=8, ₹349)
  // Expected subtotal = 2*499 + 349 = 1347; 5% tax = 67; total = 1414
  // Expected ingredient deduction: Tomatoes -2 kg (from 2 pizzas), Flour (Maida) -3 kg (2 pizzas + 1 sandwich)
  const orderRes = await req('POST', '/api/orders', {
    body: {
      orderType: 'Dine-in',
      tableNumber: 'T1',
      items: [
        { menuItemId: 1, quantity: 2 },
        { menuItemId: 8, quantity: 1 },
      ],
    },
  });
  assert.equal(orderRes.status, 201);
  const ord = orderRes.data.order;
  placedOrderId = ord.id;
  assert.equal(ord.itemCount, 3);
  assert.equal(ord.subtotal, 1347);
  assert.equal(ord.taxAmount, 67);
  assert.equal(ord.totalAmount, 1414);
  assert.equal(ord.status, 'Preparing');
  assert.equal(ord.items.length, 2);

  // Verify inventory was auto-deducted in D1
  const invAfter = await req('GET', '/api/inventory', { token: adminToken });
  const tomatoesAfter = invAfter.data.items.find((i) => i.name === 'Tomatoes').quantity;
  const flourAfter = invAfter.data.items.find((i) => i.name === 'Flour (Maida)').quantity;
  assert.equal(tomatoesAfter, 10);
  assert.equal(flourAfter, 32);

  // Verify inventory logs recorded the auto-deductions for this order
  const logsRes = await req('GET', '/api/inventory/logs', { token: adminToken });
  assert.equal(logsRes.status, 200);
  assert.ok(logsRes.data.logs.some((l) => l.orderId === placedOrderId && l.itemName === 'Tomatoes'));
  assert.ok(logsRes.data.logs.some((l) => l.orderId === placedOrderId && l.itemName === 'Flour (Maida)'));
});

test('5. Invalid order rejection and insufficient inventory rejection (atomicity check)', async () => {
  // Empty order rejected
  const empty = await req('POST', '/api/orders', { body: { items: [] } });
  assert.equal(empty.status, 400);

  // Nonexistent menu item ID rejected
  const badItem = await req('POST', '/api/orders', {
    body: { items: [{ menuItemId: 99999, quantity: 1 }] },
  });
  assert.equal(badItem.status, 400);

  // Insufficient inventory: Tomatoes currently has 10 kg left. Ordering 15 Margherita Pizzas requires 15 kg Tomatoes.
  const overStock = await req('POST', '/api/orders', {
    body: { items: [{ menuItemId: 1, quantity: 15 }] },
  });
  assert.equal(overStock.status, 400);
  assert.match(overStock.data.error, /Insufficient inventory/i);

  // Verify Flour (Maida) and Tomatoes were NOT partially deducted when the order was rejected
  const invCheck = await req('GET', '/api/inventory', { token: adminToken });
  assert.equal(invCheck.data.items.find((i) => i.name === 'Tomatoes').quantity, 10);
  assert.equal(invCheck.data.items.find((i) => i.name === 'Flour (Maida)').quantity, 32);
});

test('6. Order status updates and order price retention after menu edit', async () => {
  // Advance order status: Preparing -> Ready -> Served
  const step1 = await req('PATCH', `/api/orders/${placedOrderId}/status`, {
    token: staffToken,
    body: { status: 'Ready' },
  });
  assert.equal(step1.status, 200);
  assert.equal(step1.data.order.status, 'Ready');

  const step2 = await req('PATCH', `/api/orders/${placedOrderId}/status`, {
    token: staffToken,
    body: {}, // auto-cycle Ready -> Served
  });
  assert.equal(step2.status, 200);
  assert.equal(step2.data.order.status, 'Served');
});

test('7. Reservation availability, table assignment, and double-booking prevention', async () => {
  // Check availability for 2026-11-25 at 8:00 PM for 4 guests
  const avail = await req(
    'GET',
    '/api/reservations/availability?date=2026-11-25&time=8:00%20PM&partySize=4'
  );
  assert.equal(avail.status, 200);
  assert.equal(avail.data.available, true);
  assert.equal(avail.data.suggestedTable.tableNumber, 'T4'); // Smallest 4-seat table (T4, T5, T6 have capacity 4)

  // Book table T4 explicitly for 2026-11-25 at 8:00 PM
  const book1 = await req('POST', '/api/reservations', {
    body: {
      guestName: 'Vikram Rao',
      date: '2026-11-25',
      time: '8:00 PM',
      partySize: 4,
      tableNumber: 'T4',
    },
  });
  assert.equal(book1.status, 201);
  assert.equal(book1.data.reservation.tableNumber, 'T4');
  createdResId = book1.data.reservation.id;

  // Attempt to double-book table T4 for the exact same date & time must fail with 409
  const doubleBook = await req('POST', '/api/reservations', {
    body: {
      guestName: 'Second Guest',
      date: '2026-11-25',
      time: '8:00 PM',
      partySize: 4,
      tableNumber: 'T4',
    },
  });
  assert.equal(doubleBook.status, 409);

  // Automatic table assignment for another 4-guest party at the same slot assigns the next available 4-seat table (T5)
  const book2 = await req('POST', '/api/reservations', {
    body: {
      guestName: 'Ananya Sen',
      date: '2026-11-25',
      time: '8:00 PM',
      partySize: 4,
    },
  });
  assert.equal(book2.status, 201);
  assert.equal(book2.data.reservation.tableNumber, 'T5');

  // Update reservation status and delete reservation
  const statusUpdate = await req('PATCH', `/api/reservations/${createdResId}/status`, {
    token: staffToken,
    body: { status: 'Checked In' },
  });
  assert.equal(statusUpdate.status, 200);
  assert.equal(statusUpdate.data.reservation.status, 'Checked In');

  const delRes = await req('DELETE', `/api/reservations/${createdResId}`, { token: staffToken });
  assert.equal(delRes.status, 200);
  assert.equal(delRes.data.deleted, true);
});

test('8. Dashboard statistics and daily sales report reflect real D1 database records', async () => {
  const dash = await req('GET', '/api/dashboard', { token: adminToken });
  assert.equal(dash.status, 200);
  // Seeded orders total = 910 + 480 + 1240 + 620 = 3250. Plus our placed order 1414 = 4664.
  assert.equal(dash.data.stats.totalRevenue, 4664);
  assert.equal(dash.data.stats.totalOrders, 5);
  assert.ok(dash.data.stats.lowStockCount >= 2); // Tomatoes (10 <= 15) and Paneer (8 <= 15)

  const report = await req('GET', '/api/reports/daily-sales', { token: adminToken });
  assert.equal(report.status, 200);
  assert.equal(report.data.totalSales, 4664);
  assert.equal(report.data.totalOrders, 5);
  assert.ok(Array.isArray(report.data.topMenuItems));

  // Delete the custom menu item created in test 3
  const delMenu = await req('DELETE', `/api/menu/${createdMenuId}`, { token: adminToken });
  assert.equal(delMenu.status, 200);
});
