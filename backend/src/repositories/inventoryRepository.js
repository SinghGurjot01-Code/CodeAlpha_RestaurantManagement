/**
 * D1 Repository for Inventory Items and Inventory Logs.
 */
export function createInventoryRepository(db) {
  const formatItem = (row) => {
    if (!row) return null;
    const quantity = Number(row.quantity);
    const threshold = Number(row.low_stock_threshold ?? 15);
    return {
      id: row.id,
      name: row.name,
      quantity,
      unit: row.unit,
      lowStockThreshold: threshold,
      status: quantity <= threshold ? 'Low Stock' : 'In Stock',
      isLowStock: quantity <= threshold,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const formatLog = (row) =>
    row
      ? {
          id: row.id,
          inventoryItemId: row.inventory_item_id || null,
          itemName: row.item_name,
          changeAmount: Number(row.change_amount || 0),
          action: row.action,
          orderId: row.order_id || null,
          createdAt: row.created_at,
        }
      : null;

  return {
    async list({ q = '' } = {}) {
      if (q) {
        const { results } = await db
          .prepare(
            `SELECT id, name, quantity, unit, low_stock_threshold, created_at, updated_at
             FROM inventory_items
             WHERE lower(name) LIKE ?1
             ORDER BY id ASC`
          )
          .bind(`%${q.toLowerCase()}%`)
          .all();
        return (results || []).map(formatItem);
      }
      const { results } = await db
        .prepare(
          `SELECT id, name, quantity, unit, low_stock_threshold, created_at, updated_at
           FROM inventory_items
           ORDER BY id ASC`
        )
        .all();
      return (results || []).map(formatItem);
    },

    async findById(id) {
      const row = await db
        .prepare(
          `SELECT id, name, quantity, unit, low_stock_threshold, created_at, updated_at
           FROM inventory_items WHERE id = ?1`
        )
        .bind(Number(id))
        .first();
      return formatItem(row);
    },

    async findByName(name) {
      const row = await db
        .prepare(
          `SELECT id, name, quantity, unit, low_stock_threshold, created_at, updated_at
           FROM inventory_items WHERE lower(name) = lower(?1)`
        )
        .bind(String(name || '').trim())
        .first();
      return formatItem(row);
    },

    async create({ name, quantity, unit = 'kg', lowStockThreshold = 15 }) {
      const cleanName = name.trim();
      const qty = Number(quantity);
      const res = await db
        .prepare(
          `INSERT INTO inventory_items (name, quantity, unit, low_stock_threshold)
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(cleanName, qty, unit.trim() || 'kg', Number(lowStockThreshold ?? 15))
        .run();
      const newId = res?.meta?.last_row_id;

      await db
        .prepare(
          `INSERT INTO inventory_logs (inventory_item_id, item_name, change_amount, action)
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(newId, cleanName, qty, `Added ${qty} ${unit.trim() || 'kg'}`)
        .run();

      return this.findById(newId);
    },

    async update(id, { name, quantity, restockAmount, unit, lowStockThreshold }) {
      const existing = await this.findById(id);
      if (!existing) return null;

      let newQty = existing.quantity;
      if (restockAmount !== undefined) {
        newQty = existing.quantity + Number(restockAmount);
      } else if (quantity !== undefined) {
        newQty = Number(quantity);
      }
      if (newQty < 0) {
        const err = new Error('Inventory quantity cannot be negative.');
        err.status = 400;
        throw err;
      }

      const newName = name !== undefined ? String(name).trim() : existing.name;
      const newUnit = unit !== undefined ? String(unit).trim() : existing.unit;
      const newThreshold =
        lowStockThreshold !== undefined ? Number(lowStockThreshold) : existing.lowStockThreshold;
      const diff = newQty - existing.quantity;

      await db
        .prepare(
          `UPDATE inventory_items
           SET name = ?1, quantity = ?2, unit = ?3, low_stock_threshold = ?4,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?5`
        )
        .bind(newName, newQty, newUnit, newThreshold, Number(id))
        .run();

      if (diff !== 0) {
        const actionText =
          diff > 0 ? `Restocked +${diff} ${newUnit}` : `Adjusted ${diff} ${newUnit}`;
        await db
          .prepare(
            `INSERT INTO inventory_logs (inventory_item_id, item_name, change_amount, action)
             VALUES (?1, ?2, ?3, ?4)`
          )
          .bind(Number(id), newName, diff, actionText)
          .run();
      }

      return this.findById(id);
    },

    async listLogs(limit = 30) {
      const { results } = await db
        .prepare(
          `SELECT id, inventory_item_id, item_name, change_amount, action, order_id, created_at
           FROM inventory_logs
           ORDER BY id DESC
           LIMIT ?1`
        )
        .bind(Number(limit))
        .all();
      return (results || []).map(formatLog);
    },
  };
}
