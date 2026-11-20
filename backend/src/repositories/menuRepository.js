/**
 * D1 Repository for Menu Categories, Menu Items, and Menu Ingredient Mappings.
 */
export function createMenuRepository(db) {
  const formatMenuItem = (row, ingredients = []) =>
    row
      ? {
          id: row.id,
          name: row.name,
          category: row.category_name,
          categoryId: row.category_id,
          price: Number(row.price),
          status: row.status,
          emoji: row.emoji || '🍽️',
          assetKey: row.asset_key || '',
          ingredients,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;

  const baseSelect = `
    SELECT
      m.id, m.category_id, c.name AS category_name, m.name, m.price,
      m.status, m.emoji, m.asset_key, m.created_at, m.updated_at
    FROM menu_items m
    JOIN menu_categories c ON c.id = m.category_id
  `;

  return {
    async listCategories() {
      const { results } = await db
        .prepare(`SELECT id, name, sort_order FROM menu_categories ORDER BY sort_order ASC, id ASC`)
        .all();
      return results || [];
    },

    async ensureCategory(categoryName) {
      const clean = String(categoryName || 'Main Course').trim();
      const existing = await db
        .prepare(`SELECT id, name FROM menu_categories WHERE lower(name) = lower(?1)`)
        .bind(clean)
        .first();
      if (existing) return existing;
      const res = await db
        .prepare(`INSERT INTO menu_categories (name, sort_order) VALUES (?1, 99)`)
        .bind(clean)
        .run();
      return { id: res?.meta?.last_row_id, name: clean };
    },

    async getIngredientsByMenuIds(menuIds = []) {
      if (!menuIds.length) return new Map();
      const placeholders = menuIds.map((_, i) => `?${i + 1}`).join(', ');
      const { results } = await db
        .prepare(
          `SELECT
             mim.menu_item_id, mim.inventory_item_id, mim.quantity_required,
             ii.name AS ingredient_name, ii.quantity AS current_stock, ii.unit
           FROM menu_ingredient_mappings mim
           JOIN inventory_items ii ON ii.id = mim.inventory_item_id
           WHERE mim.menu_item_id IN (${placeholders})`
        )
        .bind(...menuIds.map(Number))
        .all();

      const map = new Map();
      for (const r of results || []) {
        const list = map.get(r.menu_item_id) || [];
        list.push({
          inventoryItemId: r.inventory_item_id,
          name: r.ingredient_name,
          quantityRequired: Number(r.quantity_required),
          currentStock: Number(r.current_stock),
          unit: r.unit,
        });
        map.set(r.menu_item_id, list);
      }
      return map;
    },

    async list({ category = '', q = '' } = {}) {
      const clauses = [];
      const params = [];

      if (category && category !== 'All') {
        params.push(category);
        clauses.push(`lower(c.name) = lower(?${params.length})`);
      }
      if (q) {
        params.push(`%${q.toLowerCase()}%`);
        clauses.push(`(lower(m.name) LIKE ?${params.length} OR lower(c.name) LIKE ?${params.length})`);
      }

      const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { results } = await db
        .prepare(`${baseSelect} ${whereSql} ORDER BY CASE m.id WHEN 1 THEN 1 WHEN 7 THEN 2 WHEN 8 THEN 3 WHEN 4 THEN 4 ELSE 5 END, m.id ASC`)
        .bind(...params)
        .all();

      const rows = results || [];
      const ingMap = await this.getIngredientsByMenuIds(rows.map((r) => r.id));
      return rows.map((r) => formatMenuItem(r, ingMap.get(r.id) || []));
    },

    async findById(id) {
      const row = await db.prepare(`${baseSelect} WHERE m.id = ?1`).bind(Number(id)).first();
      if (!row) return null;
      const ingMap = await this.getIngredientsByMenuIds([row.id]);
      return formatMenuItem(row, ingMap.get(row.id) || []);
    },

    async findByIds(ids = []) {
      const cleanIds = [...new Set(ids.map(Number).filter((n) => !Number.isNaN(n)))];
      if (!cleanIds.length) return [];
      const placeholders = cleanIds.map((_, i) => `?${i + 1}`).join(', ');
      const { results } = await db
        .prepare(`${baseSelect} WHERE m.id IN (${placeholders})`)
        .bind(...cleanIds)
        .all();
      const rows = results || [];
      const ingMap = await this.getIngredientsByMenuIds(cleanIds);
      return rows.map((r) => formatMenuItem(r, ingMap.get(r.id) || []));
    },

    async create({ name, category = 'Main Course', price, status = 'In Stock', emoji = '🍽️', assetKey = '', ingredients = [] }) {
      const cat = await this.ensureCategory(category);
      const res = await db
        .prepare(
          `INSERT INTO menu_items (category_id, name, price, status, emoji, asset_key)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        )
        .bind(cat.id, name.trim(), Number(price), status, emoji || '🍽️', assetKey || '')
        .run();
      const newId = res?.meta?.last_row_id;

      if (Array.isArray(ingredients) && ingredients.length) {
        await this.setIngredients(newId, ingredients);
      } else {
        // Default recipe mapping to Flour (Maida) if present so new items participate in inventory tracking
        const flour = await db.prepare(`SELECT id FROM inventory_items WHERE name = 'Flour (Maida)'`).first();
        if (flour) {
          await db
            .prepare(`INSERT OR IGNORE INTO menu_ingredient_mappings (menu_item_id, inventory_item_id, quantity_required) VALUES (?1, ?2, 1)`)
            .bind(newId, flour.id)
            .run();
        }
      }
      return this.findById(newId);
    },

    async setIngredients(menuItemId, ingredients = []) {
      await db.prepare(`DELETE FROM menu_ingredient_mappings WHERE menu_item_id = ?1`).bind(Number(menuItemId)).run();
      for (const ing of ingredients) {
        let invId = ing.inventoryItemId ? Number(ing.inventoryItemId) : null;
        if (!invId && ing.name) {
          const found = await db
            .prepare(`SELECT id FROM inventory_items WHERE lower(name) = lower(?1)`)
            .bind(String(ing.name).trim())
            .first();
          if (found) invId = found.id;
        }
        if (invId) {
          const qty = Math.max(0.01, Number(ing.quantityRequired) || 1);
          await db
            .prepare(
              `INSERT OR REPLACE INTO menu_ingredient_mappings (menu_item_id, inventory_item_id, quantity_required)
               VALUES (?1, ?2, ?3)`
            )
            .bind(Number(menuItemId), invId, qty)
            .run();
        }
      }
    },

    async update(id, fields = {}) {
      const existing = await this.findById(id);
      if (!existing) return null;

      let categoryId = existing.categoryId;
      if (fields.category !== undefined) {
        const cat = await this.ensureCategory(fields.category);
        categoryId = cat.id;
      }

      const name = fields.name !== undefined ? String(fields.name).trim() : existing.name;
      const price = fields.price !== undefined ? Number(fields.price) : existing.price;
      const status = fields.status !== undefined ? fields.status : existing.status;
      const emoji = fields.emoji !== undefined ? fields.emoji : existing.emoji;
      const assetKey = fields.assetKey !== undefined ? fields.assetKey : existing.assetKey;

      await db
        .prepare(
          `UPDATE menu_items
           SET category_id = ?1, name = ?2, price = ?3, status = ?4, emoji = ?5, asset_key = ?6,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?7`
        )
        .bind(categoryId, name, price, status, emoji, assetKey, Number(id))
        .run();

      if (Array.isArray(fields.ingredients)) {
        await this.setIngredients(id, fields.ingredients);
      }

      return this.findById(id);
    },

    async remove(id) {
      const res = await db.prepare(`DELETE FROM menu_items WHERE id = ?1`).bind(Number(id)).run();
      return (res?.meta?.changes || 0) > 0;
    },
  };
}
