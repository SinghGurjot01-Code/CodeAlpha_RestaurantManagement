import { cleanText } from '../utils/validators.js';

export function createInventoryService({ inventoryRepo }) {
  return {
    async listInventory({ q = '' } = {}) {
      const items = await inventoryRepo.list({ q: cleanText(q, 120) });
      const lowStockCount = items.filter((i) => i.isLowStock).length;
      return { items, lowStockCount };
    },

    async addInventoryItem(payload = {}) {
      const name = cleanText(payload.name ?? payload.n, 120);
      if (!name) {
        const err = new Error('Inventory item name is required.');
        err.status = 400;
        throw err;
      }
      const quantity = Number(payload.quantity ?? payload.q);
      if (Number.isNaN(quantity) || quantity < 0) {
        const err = new Error('Inventory quantity must be 0 or greater.');
        err.status = 400;
        throw err;
      }
      const unit = cleanText(payload.unit ?? payload.u, 32) || 'kg';
      const lowStockThreshold =
        payload.lowStockThreshold !== undefined ? Number(payload.lowStockThreshold) : 15;

      // If an inventory item with this name already exists, restock it rather than failing
      const existing = await inventoryRepo.findByName(name);
      if (existing) {
        return inventoryRepo.update(existing.id, {
          restockAmount: quantity,
          unit,
        });
      }

      return inventoryRepo.create({
        name,
        quantity,
        unit,
        lowStockThreshold,
      });
    },

    async updateInventoryItem(id, payload = {}) {
      const existing = await inventoryRepo.findById(id);
      if (!existing) {
        const err = new Error('Inventory item not found.');
        err.status = 404;
        throw err;
      }

      if (payload.quantity !== undefined && (Number.isNaN(Number(payload.quantity)) || Number(payload.quantity) < 0)) {
        const err = new Error('Inventory quantity cannot be negative.');
        err.status = 400;
        throw err;
      }

      return inventoryRepo.update(existing.id, {
        name: payload.name !== undefined ? cleanText(payload.name, 120) : undefined,
        quantity: payload.quantity ?? payload.q,
        restockAmount: payload.restockAmount,
        unit: payload.unit !== undefined ? cleanText(payload.unit, 32) : undefined,
        lowStockThreshold: payload.lowStockThreshold,
      });
    },

    async getInventoryLogs(limit = 30) {
      return inventoryRepo.listLogs(limit);
    },
  };
}
