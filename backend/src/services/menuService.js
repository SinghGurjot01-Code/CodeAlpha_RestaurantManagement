import { VALID_MENU_STATUSES, cleanText } from '../utils/validators.js';

export function createMenuService({ menuRepo }) {
  return {
    async listMenu({ category = '', q = '' } = {}) {
      const items = await menuRepo.list({ category: cleanText(category, 80), q: cleanText(q, 120) });
      const categories = await menuRepo.listCategories();
      return { items, categories };
    },

    async getMenuItem(id) {
      if (!id || Number.isNaN(Number(id))) return null;
      return menuRepo.findById(Number(id));
    },

    async createMenuItem(payload = {}) {
      const name = cleanText(payload.name ?? payload.n, 120);
      if (!name) {
        const err = new Error('Menu item name is required.');
        err.status = 400;
        throw err;
      }
      const price = Number(payload.price ?? payload.p);
      if (Number.isNaN(price) || price <= 0 || price > 100000) {
        const err = new Error('Menu item price must be a positive number.');
        err.status = 400;
        throw err;
      }
      const category = cleanText(payload.category ?? payload.c, 80) || 'Main Course';
      const status = VALID_MENU_STATUSES.includes(payload.status) ? payload.status : 'In Stock';
      const emoji = cleanText(payload.emoji ?? payload.e, 16) || '🍽️';
      const assetKey = cleanText(payload.assetKey, 32);

      try {
        return await menuRepo.create({
          name,
          category,
          price,
          status,
          emoji,
          assetKey,
          ingredients: Array.isArray(payload.ingredients) ? payload.ingredients : [],
        });
      } catch (err) {
        if (/UNIQUE constraint failed/i.test(String(err?.message || err?.cause?.message))) {
          const dupErr = new Error('A menu item with this name already exists.');
          dupErr.status = 409;
          throw dupErr;
        }
        throw err;
      }
    },

    async updateMenuItem(id, payload = {}) {
      const existing = await this.getMenuItem(id);
      if (!existing) {
        const err = new Error('Menu item not found.');
        err.status = 404;
        throw err;
      }

      const updates = {};
      if (payload.name !== undefined || payload.n !== undefined) {
        const nm = cleanText(payload.name ?? payload.n, 120);
        if (!nm) {
          const err = new Error('Menu item name cannot be empty.');
          err.status = 400;
          throw err;
        }
        updates.name = nm;
      }
      if (payload.price !== undefined || payload.p !== undefined) {
        const pr = Number(payload.price ?? payload.p);
        if (Number.isNaN(pr) || pr <= 0 || pr > 100000) {
          const err = new Error('Menu item price must be a positive number.');
          err.status = 400;
          throw err;
        }
        updates.price = pr;
      }
      if (payload.category !== undefined || payload.c !== undefined) {
        updates.category = cleanText(payload.category ?? payload.c, 80) || existing.category;
      }
      if (payload.status !== undefined || payload.s !== undefined) {
        const st = payload.status ?? payload.s;
        if (!VALID_MENU_STATUSES.includes(st)) {
          const err = new Error('Invalid menu item status.');
          err.status = 400;
          throw err;
        }
        updates.status = st;
      }
      if (payload.emoji !== undefined || payload.e !== undefined) {
        updates.emoji = cleanText(payload.emoji ?? payload.e, 16) || existing.emoji;
      }
      if (Array.isArray(payload.ingredients)) {
        updates.ingredients = payload.ingredients;
      }

      return menuRepo.update(existing.id, updates);
    },

    async deleteMenuItem(id) {
      const existing = await this.getMenuItem(id);
      if (!existing) {
        const err = new Error('Menu item not found.');
        err.status = 404;
        throw err;
      }
      await menuRepo.remove(existing.id);
      return { deleted: true, id: existing.id };
    },
  };
}
