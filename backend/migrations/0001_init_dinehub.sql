-- Migration 0001: DineHub Restaurant Management System (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

-- 1. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2. Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
  name        TEXT    NOT NULL UNIQUE,
  price       REAL    NOT NULL CHECK (price >= 0),
  status      TEXT    NOT NULL DEFAULT 'In Stock' CHECK (status IN ('In Stock', 'Out of Stock')),
  emoji       TEXT    NOT NULL DEFAULT '🍽️',
  asset_key   TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_status ON menu_items(status);

-- 3. Tables (Restaurant dining tables T1..T9)
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  table_number TEXT    NOT NULL UNIQUE,
  capacity     INTEGER NOT NULL CHECK (capacity >= 1),
  status       TEXT    NOT NULL DEFAULT 'Free' CHECK (status IN ('Free', 'Reserved', 'Occupied')),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 4. Orders
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_type    TEXT    NOT NULL DEFAULT 'Dine-in' CHECK (order_type IN ('Dine-in', 'Takeaway', 'Online')),
  table_id      INTEGER REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  table_number  TEXT    NOT NULL DEFAULT '–',
  customer_name TEXT    NOT NULL DEFAULT 'Guest',
  item_count    INTEGER NOT NULL CHECK (item_count >= 1),
  subtotal      REAL    NOT NULL CHECK (subtotal >= 0),
  tax_percent   REAL    NOT NULL DEFAULT 5 CHECK (tax_percent >= 0),
  tax_amount    REAL    NOT NULL CHECK (tax_amount >= 0),
  total_amount  REAL    NOT NULL CHECK (total_amount >= 0),
  status        TEXT    NOT NULL DEFAULT 'Preparing' CHECK (status IN ('Preparing', 'Ready', 'Served', 'Cancelled')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- 5. Order Items (retains item names, quantities, and unit prices at the time of purchase)
CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name    TEXT    NOT NULL,
  unit_price   REAL    NOT NULL CHECK (unit_price >= 0),
  quantity     INTEGER NOT NULL CHECK (quantity >= 1),
  line_total   REAL    NOT NULL CHECK (line_total >= 0),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 6. Reservations
CREATE TABLE IF NOT EXISTS reservations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_name       TEXT    NOT NULL,
  guest_phone      TEXT    NOT NULL DEFAULT '',
  table_id         INTEGER NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  table_number     TEXT    NOT NULL,
  reservation_date TEXT    NOT NULL,
  reservation_time TEXT    NOT NULL,
  party_size       INTEGER NOT NULL CHECK (party_size >= 1 AND party_size <= 20),
  status           TEXT    NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Checked In', 'Completed', 'Cancelled')),
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(reservation_date, reservation_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);

-- Database-level unique constraint preventing double-booking of the same table at the same date & time for active bookings
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_active_slot
  ON reservations(table_id, reservation_date, reservation_time)
  WHERE status IN ('Upcoming', 'Checked In');

-- 7. Inventory Items
CREATE TABLE IF NOT EXISTS inventory_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL UNIQUE,
  quantity            REAL    NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit                TEXT    NOT NULL DEFAULT 'kg',
  low_stock_threshold REAL    NOT NULL DEFAULT 15 CHECK (low_stock_threshold >= 0),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 8. Menu Ingredient Mappings (Recipe requirements per 1 unit of menu item)
CREATE TABLE IF NOT EXISTS menu_ingredient_mappings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id      INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_required REAL    NOT NULL DEFAULT 1 CHECK (quantity_required > 0),
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (menu_item_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_ingredients_menu ON menu_ingredient_mappings(menu_item_id);

-- 9. Inventory Logs
CREATE TABLE IF NOT EXISTS inventory_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name         TEXT    NOT NULL,
  change_amount     REAL    NOT NULL DEFAULT 0,
  action            TEXT    NOT NULL,
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_created ON inventory_logs(created_at);

-- 10. Staff Users
CREATE TABLE IF NOT EXISTS staff_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin', 'Manager', 'Staff')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Restaurant Profile Settings
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  name        TEXT    NOT NULL DEFAULT 'DineHub Restaurant',
  tax_percent REAL    NOT NULL DEFAULT 5 CHECK (tax_percent >= 0),
  open_time   TEXT    NOT NULL DEFAULT '10:00',
  close_time  TEXT    NOT NULL DEFAULT '23:00',
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ================= SEED DATA =================

INSERT OR IGNORE INTO restaurant_settings (id, name, tax_percent, open_time, close_time)
VALUES (1, 'DineHub Restaurant', 5, '10:00', '23:00');

INSERT OR IGNORE INTO menu_categories (id, name, sort_order) VALUES
  (1, 'Starters', 1),
  (2, 'Main Course', 2),
  (3, 'Desserts', 3),
  (4, 'Beverages', 4);

-- 4 existing menu items with exact IDs (1, 7, 8, 4), prices, categories, emojis, and asset keys from DineHub HTML
INSERT OR IGNORE INTO menu_items (id, category_id, name, price, status, emoji, asset_key) VALUES
  (1, 2, 'Margherita Pizza', 499, 'In Stock', '🍕', 'm1'),
  (7, 2, 'Loaded Pizza', 549, 'In Stock', '🍕', 'm2'),
  (8, 1, 'Grilled Sandwich', 349, 'In Stock', '🥪', 'm3'),
  (4, 3, 'Chocolate Brownie', 249, 'In Stock', '🍫', 'm4');

-- 9 Restaurant tables (T1..T9) with realistic capacities
INSERT OR IGNORE INTO restaurant_tables (id, table_number, capacity, status) VALUES
  (1, 'T1', 2, 'Free'),
  (2, 'T2', 2, 'Reserved'),
  (3, 'T3', 2, 'Free'),
  (4, 'T4', 4, 'Occupied'),
  (5, 'T5', 4, 'Reserved'),
  (6, 'T6', 4, 'Free'),
  (7, 'T7', 6, 'Occupied'),
  (8, 'T8', 6, 'Free'),
  (9, 'T9', 8, 'Free');

-- Realistic Inventory Items (matching DineHub HTML + Chocolate Brownie ingredients)
INSERT OR IGNORE INTO inventory_items (id, name, quantity, unit, low_stock_threshold) VALUES
  (1, 'Tomatoes', 12, 'kg', 15),
  (2, 'Paneer', 8, 'kg', 15),
  (3, 'Rice', 50, 'kg', 15),
  (4, 'Flour (Maida)', 35, 'kg', 15),
  (5, 'Cocoa & Chocolate', 20, 'kg', 15);

-- Menu Ingredient Mappings (Recipe per item ordered)
-- Margherita Pizza (1) -> Tomatoes (1) + Flour (Maida) (4)
-- Loaded Pizza (7) -> Tomatoes (1) + Flour (Maida) (4)
-- Grilled Sandwich (8) -> Flour (Maida) (4)
-- Chocolate Brownie (4) -> Flour (Maida) (4) + Cocoa & Chocolate (5)
INSERT OR IGNORE INTO menu_ingredient_mappings (menu_item_id, inventory_item_id, quantity_required) VALUES
  (1, 1, 1),
  (1, 4, 1),
  (7, 1, 1),
  (7, 4, 1),
  (8, 4, 1),
  (4, 4, 1),
  (4, 5, 1);

-- Initial Inventory Log
INSERT OR IGNORE INTO inventory_logs (id, inventory_item_id, item_name, change_amount, action)
VALUES (1, NULL, 'Seed data', 0, 'Initial stock loaded');

-- Initial Historical Orders from DineHub HTML (#7839..#7842)
INSERT OR IGNORE INTO orders (id, order_type, table_id, table_number, customer_name, item_count, subtotal, tax_percent, tax_amount, total_amount, status) VALUES
  (7839, 'Dine-in', 2, 'T2', 'Table 2 Guest', 3, 867, 5, 43, 910, 'Preparing'),
  (7840, 'Takeaway', NULL, '–', 'Takeaway Guest', 2, 457, 5, 23, 480, 'Ready'),
  (7841, 'Dine-in', 7, 'T7', 'Table 7 Guest', 4, 1181, 5, 59, 1240, 'Served'),
  (7842, 'Dine-in', 4, 'T4', 'Table 4 Guest', 2, 590, 5, 30, 620, 'Preparing');

INSERT OR IGNORE INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, line_total) VALUES
  (1, 7839, 1, 'Margherita Pizza', 499, 1, 499),
  (2, 7839, 8, 'Grilled Sandwich', 349, 1, 349),
  (3, 7840, 4, 'Chocolate Brownie', 249, 2, 498),
  (4, 7841, 7, 'Loaded Pizza', 549, 2, 1098),
  (5, 7842, 1, 'Margherita Pizza', 499, 1, 499);

-- Initial Reservations from DineHub HTML
INSERT OR IGNORE INTO reservations (id, guest_name, table_id, table_number, reservation_date, reservation_time, party_size, status) VALUES
  (1, 'Aman Singh', 5, 'T5', '2026-11-19', '7:00 PM', 4, 'Upcoming'),
  (2, 'Kavya Mehta', 2, 'T2', '2026-11-19', '8:00 PM', 2, 'Upcoming'),
  (3, 'Rohit Sharma', 7, 'T7', '2026-11-19', '8:30 PM', 6, 'Checked In'),
  (4, 'Neha Verma', 3, 'T3', '2026-11-19', '9:00 PM', 2, 'Completed');

-- Staff Users (default password for seeded accounts: `admin123`, hashed with scrypt)
INSERT OR IGNORE INTO staff_users (id, full_name, email, password_hash, role) VALUES
  (1, 'Admin', 'admin@dinehub.com', 'scrypt:a1b2c3d4e5f60718293a4b5c6d7e8f90:7c43f80888aec4f243a0260d244acb67ec6cf57fbd24d638206bd49f858714c66d1f344dfc0fd966549384e2021176646919ef63add209a8201a7ee09fab58f1', 'Admin'),
  (2, 'Riya Kapoor', 'riya@dinehub.com', 'scrypt:a1b2c3d4e5f60718293a4b5c6d7e8f90:7c43f80888aec4f243a0260d244acb67ec6cf57fbd24d638206bd49f858714c66d1f344dfc0fd966549384e2021176646919ef63add209a8201a7ee09fab58f1', 'Manager'),
  (3, 'Sahil Verma', 'sahil@dinehub.com', 'scrypt:a1b2c3d4e5f60718293a4b5c6d7e8f90:7c43f80888aec4f243a0260d244acb67ec6cf57fbd24d638206bd49f858714c66d1f344dfc0fd966549384e2021176646919ef63add209a8201a7ee09fab58f1', 'Staff');
