# CodeAlpha Task 3 — DineHub (Restaurant Management System)

**Live Application (Vercel):** <https://ca-dinehub.vercel.app>  
**Backend API (Cloudflare Workers + D1):** <https://codealpha-dinehub.singhgurjotpal84.workers.dev>  
**GitHub Repository:** <https://github.com/SinghGurjot01-Code/CodeAlpha_RestaurantManagement>

A full-stack **Restaurant Management System** built for the **CodeAlpha Backend Development Internship — Task 3**.  
DineHub connects the complete customer and admin restaurant frontend (`DineHub – Restaurant Management.html`) to a modular **Node.js + Express.js 5** backend running on **Cloudflare Workers** (`nodejs_compat` + `httpServerHandler`) with **Cloudflare D1** (SQLite-compatible relational database).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology Stack](#3-technology-stack)
4. [Architecture & Project Structure](#4-architecture--project-structure)
5. [Database Schema (10 Entities in Cloudflare D1)](#5-database-schema-10-entities-in-cloudflare-d1)
6. [API Documentation](#6-api-documentation)
7. [Business Logic & Atomic Order Processing](#7-business-logic--atomic-order-processing)
8. [Local Installation & D1 Setup](#8-local-installation--d1-setup)
9. [Testing Instructions](#9-testing-instructions)
10. [Environment Variables & Configuration](#10-environment-variables--configuration)
11. [Deployment Instructions (Vercel + Cloudflare Workers & D1)](#11-deployment-instructions-vercel--cloudflare-workers--d1)

---

## 1. Project Overview

DineHub provides both a **Customer Portal** and a **Staff/Admin Management Suite**:
- **Customer Portal (`#home`, `#menu`, `#reserve`, `#order`, `#status`)**:
  - Browse popular dishes, search menu items, and filter by category (`All`, `Starters`, `Main Course`, `Desserts`, `Beverages`).
  - Build a cart, choose order type (`Dine-in`, `Takeaway`, `Online`) and dining table (`T1`–`T9`), review live server-configured tax calculations, and submit orders.
  - Check real-time table availability by date, time, and guest count and book reservations.
  - Track live order status (`Placed` → `Preparing` → `Ready` → `Served`).
- **Staff & Admin Suite (`#login`, `#admin-dashboard`, `#admin-orders`, `#admin-reservations`, `#admin-menu`, `#admin-inventory`, `#admin-reports`, `#admin-settings`)**:
  - Role-based staff authentication (`Admin`, `Manager`, `Staff`).
  - Real-time KPI dashboard (revenue, total orders, active reservations, low-stock alerts, recent orders).
  - Order queue management with status progression and search/type filters.
  - Table reservation management with status updates (`Upcoming` → `Checked In` → `Completed`).
  - Menu CRUD with recipe ingredient mappings.
  - Inventory stock tracking, low-stock alerts, and audit log history.
  - Daily sales reports and restaurant profile/staff/table settings.

---

## 2. Features

- **100% Frontend Preservation**: Preserves the exact orange (`#f57c00`), deep green (`#0f4a26`), and cream/white (`#fbf9f5`) palette, Poppins typography, layout, responsive sidebar, and all 8 embedded base64 food and restaurant illustrations from `DineHub – Restaurant Management.html`.
- **Express.js 5 on Cloudflare Workers**: Pure ES modules (`"type": "module"`) running Express 5 via `cloudflare:node` (`httpServerHandler`).
- **Atomic Order & Inventory Auto-Deduction**: Orders validate menu items, compute prices and tax server-side, verify recipe ingredient quantities via `menu_ingredient_mappings`, create `orders` and `order_items` records, deduct stock from `inventory_items`, and record `inventory_logs` in a single atomic D1 `db.batch()` transaction.
- **Smart Table Availability & Double-Booking Prevention**: Assigns the smallest suitable available table (`T1`–`T9`) and enforces a partial `UNIQUE` index (`uq_reservations_active_slot`) on `(table_id, reservation_date, reservation_time)` for active bookings.
- **Real Staff Authentication**: `node:crypto` `scrypt` password hashing with 16-byte random salt, constant-time verification, and HMAC-SHA256 tokens (`HttpOnly; SameSite=Lax` cookie + `Bearer` header).

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (preserved from `DineHub – Restaurant Management.html`) |
| **Backend** | Node.js + **Express.js 5** (ES Modules) |
| **Runtime** | **Cloudflare Workers** (`nodejs_compat`, `enable_nodejs_http_server_modules`) |
| **Database** | **Cloudflare D1** (SQLite-compatible SQL) |
| **CLI & Tooling** | Cloudflare **Wrangler 4**, **Vercel CLI** |
| **Testing** | Native Node.js test runner (`node --test`) |

---

## 4. Architecture & Project Structure

```
CodeAlpha_RestaurantManagement/
├── frontend/
│   ├── index.html              # DineHub shell loading separated CSS, assets, config, and app logic
│   ├── dinehub.backup.html     # Untouched backup of original DineHub – Restaurant Management.html
│   ├── css/
│   │   └── styles.css          # Extracted DineHub stylesheet verbatim
│   ├── js/
│   │   ├── config.js           # Runtime API_BASE_URL configuration
│   │   └── app.js              # Frontend state & UI wired to Express + D1 REST APIs
│   └── assets/
│       └── dinehub-assets.js   # All 8 embedded base64 images (m1..m4, hero, pizza, pasta, table)
├── backend/
│   ├── src/
│   │   ├── worker.mjs          # Cloudflare Worker entry point (httpServerHandler + D1 binding)
│   │   ├── app.js              # Express 5 application factory
│   │   ├── routes/
│   │   │   └── index.js        # REST API route definitions
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── menuController.js
│   │   │   ├── orderController.js
│   │   │   ├── reservationController.js
│   │   │   └── inventoryController.js
│   │   ├── services/
│   │   │   ├── authService.js
│   │   │   ├── menuService.js
│   │   │   ├── orderService.js
│   │   │   ├── reservationService.js
│   │   │   ├── inventoryService.js
│   │   │   └── reportService.js
│   │   ├── repositories/
│   │   │   ├── staffRepository.js
│   │   │   ├── menuRepository.js
│   │   │   ├── orderRepository.js
│   │   │   ├── reservationRepository.js
│   │   │   ├── tableRepository.js
│   │   │   └── inventoryRepository.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── rateLimit.js
│   │   │   └── errorHandler.js
│   │   └── utils/
│   │       ├── crypto.js
│   │       └── validators.js
│   ├── migrations/
│   │   └── 0001_init_dinehub.sql # Schema for all 10 entities + seed data
│   ├── tests/
│   │   ├── unit.test.js
│   │   └── api.test.js
│   ├── package.json
│   ├── wrangler.jsonc
│   └── .dev.vars.example
├── .gitignore
└── README.md
```

---

## 5. Database Schema (10 Entities in Cloudflare D1)

Defined in [`backend/migrations/0001_init_dinehub.sql`](backend/migrations/0001_init_dinehub.sql):

1. **`menu_categories`**: `id`, `name UNIQUE`, `sort_order`, `created_at`, `updated_at`
2. **`menu_items`**: `id`, `category_id REFERENCES menu_categories(id)`, `name UNIQUE`, `price`, `status CHECK ('In Stock','Out of Stock')`, `emoji`, `asset_key`, `created_at`, `updated_at`
3. **`restaurant_tables`**: `id`, `table_number UNIQUE` (`T1`–`T9`), `capacity`, `status CHECK ('Free','Reserved','Occupied')`, `created_at`, `updated_at`
4. **`orders`**: `id`, `order_type CHECK ('Dine-in','Takeaway','Online')`, `table_id`, `table_number`, `customer_name`, `item_count`, `subtotal`, `tax_percent`, `tax_amount`, `total_amount`, `status CHECK ('Preparing','Ready','Served','Cancelled')`, `created_at`, `updated_at`
5. **`order_items`**: `id`, `order_id REFERENCES orders(id) ON DELETE CASCADE`, `menu_item_id`, `item_name`, `unit_price`, `quantity`, `line_total`, `created_at`
6. **`reservations`**: `id`, `guest_name`, `guest_phone`, `table_id REFERENCES restaurant_tables(id)`, `table_number`, `reservation_date`, `reservation_time`, `party_size`, `status CHECK ('Upcoming','Checked In','Completed','Cancelled')`, `created_at`, `updated_at` + partial unique index `uq_reservations_active_slot`
7. **`inventory_items`**: `id`, `name UNIQUE`, `quantity CHECK (quantity >= 0)`, `unit`, `low_stock_threshold`, `created_at`, `updated_at`
8. **`menu_ingredient_mappings`**: `id`, `menu_item_id REFERENCES menu_items(id)`, `inventory_item_id REFERENCES inventory_items(id)`, `quantity_required`, `UNIQUE(menu_item_id, inventory_item_id)`
9. **`inventory_logs`**: `id`, `inventory_item_id`, `item_name`, `change_amount`, `action`, `order_id`, `created_at`
10. **`staff_users`** (+ `restaurant_settings`): `id`, `full_name`, `email UNIQUE`, `password_hash`, `role CHECK ('Admin','Manager','Staff')`, `created_at`, `updated_at`

---

## 6. API Documentation

### Menu
- `GET /api/menu` — List menu items (with recipe ingredients) and categories (`?category=`, `?q=`)
- `GET /api/menu/:id` — Get single menu item details
- `POST /api/menu` — Create menu item *(Admin / Manager)*
- `PATCH /api/menu/:id` — Update menu item price, name, status, or recipe *(Admin / Manager)*
- `DELETE /api/menu/:id` — Delete menu item *(Admin / Manager)*

### Orders
- `GET /api/orders` — List orders with line items (`?type=`, `?status=`, `?q=`)
- `GET /api/orders/:id` — Get single order with all purchased items
- `POST /api/orders` — Place an order with automatic recipe ingredient check, deduction, and logging
- `PATCH /api/orders/:id/status` — Advance or set order status *(Staff / Manager / Admin)*

### Reservations & Tables
- `GET /api/reservations` — List reservations (`?status=`, `?date=`)
- `GET /api/reservations/availability` — Check table availability for `?date=YYYY-MM-DD&time=8:00%20PM&partySize=4`
- `POST /api/reservations` — Create a reservation (auto-assigns best available table and prevents double-booking)
- `PATCH /api/reservations/:id/status` — Update reservation status *(Staff / Manager / Admin)*
- `DELETE /api/reservations/:id` — Delete reservation *(Staff / Manager / Admin)*
- `GET /api/tables` & `GET /api/tables/:id` — List dining tables with live occupancy status

### Inventory, Dashboard, Reports & Authentication
- `GET /api/inventory` — List inventory items and low-stock count *(Auth)*
- `POST /api/inventory` — Add or restock an inventory item *(Auth)*
- `PATCH /api/inventory/:id` — Adjust stock quantity or threshold *(Auth)*
- `GET /api/inventory/logs` — View stock movement audit trail *(Auth)*
- `GET /api/dashboard` — Live KPI stats, recent orders, low-stock items, tables, staff, and settings *(Auth)*
- `GET /api/reports/daily-sales` — Sales totals, average order value, status breakdown, and top menu items *(Auth)*
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — Staff authentication

---

## 7. Business Logic & Atomic Order Processing

When `POST /api/orders` is called:
1. All `menuItemId`s and `quantity` values are validated.
2. Authoritative prices and `menu_ingredient_mappings` are loaded from D1 (client-supplied prices are ignored).
3. Subtotal, tax (`restaurant_settings.tax_percent`), and total are computed on the server.
4. Total required quantity for each ingredient across all ordered dishes is aggregated and compared against `inventory_items.quantity`.
5. `orderRepository.createAtomic()` executes a single `db.batch([...])` containing the `orders` insert, all `order_items` inserts, all `UPDATE inventory_items SET quantity = quantity - ?` statements, and all `INSERT INTO inventory_logs` entries.

---

## 8. Local Installation & D1 Setup

Requirements: **Node.js 20+** and npm.

```bash
cd CodeAlpha_RestaurantManagement/backend
npm install

# Apply D1 schema migration and seed initial DineHub data into local D1 (.wrangler/)
npm run db:migrate:local

# Start local Cloudflare Worker + frontend at http://localhost:8787
npm run dev
```

Default seeded staff accounts (password: `admin123`):
- `admin@dinehub.com` (`Admin`)
- `riya@dinehub.com` (`Manager`)
- `sahil@dinehub.com` (`Staff`)

---

## 9. Testing Instructions

```bash
cd backend
npm test            # Full unit + integration test suite (Worker + local D1)
npm run test:unit   # Fast unit tests only
```

---

## 10. Environment Variables & Configuration

Configured in [`backend/wrangler.jsonc`](backend/wrangler.jsonc) and [`backend/.dev.vars.example`](backend/.dev.vars.example):
- `DB`: Cloudflare D1 database binding (`codealpha-dinehub-db`)
- `JWT_SECRET`: Secret key for signing staff session tokens (`wrangler secret put JWT_SECRET` in production)
- `CORS_ORIGIN`: Allowed frontend origin(s) when hosted separately
- `SESSION_TTL_HOURS`: Session token lifetime in hours (default `168`)

---

## 11. Deployment Instructions (Vercel + Cloudflare Workers & D1)

- **Vercel (`https://ca-dinehub.vercel.app`)** hosts the frontend static assets and proxies `/api/:path*` via [`frontend/vercel.json`](frontend/vercel.json) directly to the Cloudflare Worker (`https://codealpha-dinehub.singhgurjotpal84.workers.dev/api/:path*`).
- **Cloudflare Workers + D1 (`https://codealpha-dinehub.singhgurjotpal84.workers.dev`)** runs the Express 5 API and persists data in the remote D1 database `codealpha-dinehub-db` (`0f31c380-1ba8-4e35-a6ca-c7b1c08ac3ad`).

```bash
# 1. Create and migrate the remote Cloudflare D1 database
cd backend
npx wrangler login
npx wrangler d1 create codealpha-dinehub-db
# Ensure database_id is set in backend/wrangler.jsonc -> d1_databases[0].database_id
npm run db:migrate:remote

# 2. Set the production JWT secret and deploy the Express Worker
npx wrangler secret put JWT_SECRET
npm run deploy

# 3. Deploy the frontend to Vercel
cd ../frontend
vercel deploy --prod --name ca-dinehub
```

---

## License

MIT
