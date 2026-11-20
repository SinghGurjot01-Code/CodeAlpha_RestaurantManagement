/**
 * D1 Repository for Orders and Order Items.
 * Uses `db.batch()` to execute order creation, order-item creation, conditional inventory deduction,
 * and inventory movement logging in an atomic SQLite transaction.
 */
export function createOrderRepository(db) {
  const formatOrder = (row, items = []) =>
    row
      ? {
          id: row.id,
          orderType: row.order_type,
          tableId: row.table_id || null,
          tableNumber: row.table_number || '–',
          customerName: row.customer_name || 'Guest',
          itemCount: Number(row.item_count),
          subtotal: Number(row.subtotal),
          taxPercent: Number(row.tax_percent),
          taxAmount: Number(row.tax_amount),
          totalAmount: Number(row.total_amount),
          status: row.status,
          items,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;

  const baseSelect = `
    SELECT
      id, order_type, table_id, table_number, customer_name, item_count,
      subtotal, tax_percent, tax_amount, total_amount, status, created_at, updated_at
    FROM orders
  `;

  return {
    async getOrderItemsByOrderIds(orderIds = []) {
      if (!orderIds.length) return new Map();
      const placeholders = orderIds.map((_, i) => `?${i + 1}`).join(', ');
      const { results } = await db
        .prepare(
          `SELECT id, order_id, menu_item_id, item_name, unit_price, quantity, line_total, created_at
           FROM order_items
           WHERE order_id IN (${placeholders})
           ORDER BY id ASC`
        )
        .bind(...orderIds.map(Number))
        .all();

      const map = new Map();
      for (const r of results || []) {
        const list = map.get(r.order_id) || [];
        list.push({
          id: r.id,
          menuItemId: r.menu_item_id,
          name: r.item_name,
          unitPrice: Number(r.unit_price),
          quantity: Number(r.quantity),
          lineTotal: Number(r.line_total),
        });
        map.set(r.order_id, list);
      }
      return map;
    },

    async list({ orderType = '', status = '', q = '' } = {}) {
      const clauses = [];
      const params = [];

      if (orderType && orderType !== 'All') {
        params.push(orderType);
        clauses.push(`order_type = ?${params.length}`);
      }
      if (status && status !== 'All') {
        params.push(status);
        clauses.push(`status = ?${params.length}`);
      }
      if (q) {
        const pattern = `%${q.toLowerCase()}%`;
        params.push(pattern);
        const idx = params.length;
        clauses.push(
          `(CAST(id AS TEXT) LIKE ?${idx} OR lower('#ord-' || CAST(id AS TEXT)) LIKE ?${idx} OR lower(order_type) LIKE ?${idx} OR lower(table_number) LIKE ?${idx} OR lower(customer_name) LIKE ?${idx} OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND lower(oi.item_name) LIKE ?${idx}))`
        );
      }

      const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { results } = await db
        .prepare(`${baseSelect} ${whereSql} ORDER BY id DESC`)
        .bind(...params)
        .all();

      const rows = results || [];
      const itemsMap = await this.getOrderItemsByOrderIds(rows.map((r) => r.id));
      return rows.map((r) => formatOrder(r, itemsMap.get(r.id) || []));
    },

    async findById(id) {
      const row = await db.prepare(`${baseSelect} WHERE id = ?1`).bind(Number(id)).first();
      if (!row) return null;
      const itemsMap = await this.getOrderItemsByOrderIds([row.id]);
      return formatOrder(row, itemsMap.get(row.id) || []);
    },

    /**
     * Atomically create an order, its order_items, deduct required inventory ingredients, and write inventory_logs.
     * Because `inventory_items.quantity` has `CHECK (quantity >= 0)` in SQLite, any deduction that would result
     * in negative inventory causes the entire `db.batch()` transaction to roll back automatically.
     */
    async createAtomic({
      orderType = 'Dine-in',
      tableId = null,
      tableNumber = '–',
      customerName = 'Guest',
      itemCount,
      subtotal,
      taxPercent,
      taxAmount,
      totalAmount,
      orderItems = [],
      ingredientDeductions = [],
    }) {
      // Determine next order ID (>= 8001 to match DineHub's #ORD-8001 numbering convention)
      const maxRow = await db.prepare(`SELECT COALESCE(MAX(id), 8000) AS max_id FROM orders`).first();
      const nextOrderId = Math.max(8001, Number(maxRow?.max_id || 8000) + 1);

      const statements = [];

      // 1. Insert the order record
      statements.push(
        db
          .prepare(
            `INSERT INTO orders (
               id, order_type, table_id, table_number, customer_name, item_count,
               subtotal, tax_percent, tax_amount, total_amount, status
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'Preparing')`
          )
          .bind(
            nextOrderId,
            orderType,
            tableId ? Number(tableId) : null,
            tableNumber || '–',
            customerName || 'Guest',
            Number(itemCount),
            Number(subtotal),
            Number(taxPercent),
            Number(taxAmount),
            Number(totalAmount)
          )
      );

      // 2. Insert each order_item retaining its name, quantity, and unit price at time of purchase
      for (const item of orderItems) {
        statements.push(
          db
            .prepare(
              `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
            )
            .bind(
              nextOrderId,
              Number(item.menuItemId),
              item.name,
              Number(item.unitPrice),
              Number(item.quantity),
              Number(item.lineTotal)
            )
        );
      }

      // 3. Deduct each required ingredient and insert an inventory log entry
      for (const ded of ingredientDeductions) {
        statements.push(
          db
            .prepare(
              `UPDATE inventory_items
               SET quantity = quantity - ?1,
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE id = ?2`
            )
            .bind(Number(ded.requiredAmount), Number(ded.inventoryItemId))
        );

        statements.push(
          db
            .prepare(
              `INSERT INTO inventory_logs (inventory_item_id, item_name, change_amount, action, order_id)
               VALUES (?1, ?2, ?3, ?4, ?5)`
            )
            .bind(
              Number(ded.inventoryItemId),
              ded.name,
              -Number(ded.requiredAmount),
              `Auto-deducted ${ded.requiredAmount} ${ded.unit} for #ORD-${nextOrderId}`,
              nextOrderId
            )
        );
      }

      await db.batch(statements);
      return this.findById(nextOrderId);
    },

    async updateStatus(id, status) {
      const existing = await this.findById(id);
      if (!existing) return null;
      await db
        .prepare(
          `UPDATE orders
           SET status = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?2`
        )
        .bind(status, Number(id))
        .run();
      return this.findById(id);
    },
  };
}
