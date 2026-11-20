import { VALID_ORDER_TYPES, VALID_ORDER_STATUSES, cleanText } from '../utils/validators.js';

export function createOrderService({ orderRepo, menuRepo, inventoryRepo, tableRepo, staffRepo }) {
  return {
    async listOrders({ orderType = '', status = '', q = '' } = {}) {
      return orderRepo.list({
        orderType: cleanText(orderType, 40),
        status: cleanText(status, 40),
        q: cleanText(q, 120),
      });
    },

    async getOrder(id) {
      if (!id || Number.isNaN(Number(id))) return null;
      return orderRepo.findById(Number(id));
    },

    /**
     * Place an order atomically:
     * 1. Validate all menu item IDs and quantities.
     * 2. Fetch actual menu prices from D1.
     * 3. Calculate subtotal and tax on the server.
     * 4. Check ingredient availability via menu_ingredient_mappings.
     * 5. Create order + order_items, deduct inventory, and write inventory_logs in an atomic batch.
     */
    async placeOrder(payload = {}) {
      // Accept either `items: [{ menuItemId, quantity }]` or `cart: { "1": 2, "8": 1 }`
      let rawItems = [];
      if (Array.isArray(payload.items)) {
        rawItems = payload.items.map((x) => ({
          menuItemId: Number(x.menuItemId ?? x.id),
          quantity: Number(x.quantity ?? x.qty),
        }));
      } else if (payload.cart && typeof payload.cart === 'object') {
        rawItems = Object.entries(payload.cart).map(([k, v]) => ({
          menuItemId: Number(k),
          quantity: Number(v),
        }));
      }

      if (!rawItems.length) {
        const err = new Error('Your order is empty. Please add at least one menu item.');
        err.status = 400;
        throw err;
      }

      // Aggregate duplicate menu item entries if any
      const qtyByMenuId = new Map();
      for (const item of rawItems) {
        if (!Number.isInteger(item.menuItemId) || item.menuItemId <= 0) {
          const err = new Error('Invalid menu item ID in order.');
          err.status = 400;
          throw err;
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100) {
          const err = new Error('Item quantity must be a positive integer between 1 and 100.');
          err.status = 400;
          throw err;
        }
        qtyByMenuId.set(item.menuItemId, (qtyByMenuId.get(item.menuItemId) || 0) + item.quantity);
      }

      const requestedIds = [...qtyByMenuId.keys()];
      const menuItems = await menuRepo.findByIds(requestedIds);
      if (menuItems.length !== requestedIds.length) {
        const err = new Error('One or more selected menu items do not exist.');
        err.status = 400;
        throw err;
      }

      const outOfStock = menuItems.find((m) => m.status !== 'In Stock');
      if (outOfStock) {
        const err = new Error(`"${outOfStock.name}" is currently out of stock.`);
        err.status = 400;
        throw err;
      }

      // Compute subtotal, item count, and aggregate required ingredients from recipes
      let subtotal = 0;
      let itemCount = 0;
      const orderItems = [];
      const requiredByInvId = new Map();

      for (const menu of menuItems) {
        const qty = qtyByMenuId.get(menu.id);
        const lineTotal = Number((menu.price * qty).toFixed(2));
        subtotal += lineTotal;
        itemCount += qty;
        orderItems.push({
          menuItemId: menu.id,
          name: menu.name,
          unitPrice: menu.price,
          quantity: qty,
          lineTotal,
        });

        for (const ing of menu.ingredients || []) {
          const prev = requiredByInvId.get(ing.inventoryItemId) || {
            inventoryItemId: ing.inventoryItemId,
            name: ing.name,
            unit: ing.unit,
            requiredAmount: 0,
          };
          prev.requiredAmount = Number((prev.requiredAmount + ing.quantityRequired * qty).toFixed(3));
          requiredByInvId.set(ing.inventoryItemId, prev);
        }
      }

      // Check current inventory stock in D1 before executing atomic batch
      const allInventory = await inventoryRepo.list();
      const stockMap = new Map(allInventory.map((i) => [i.id, i]));
      const ingredientDeductions = [...requiredByInvId.values()];

      for (const reqIng of ingredientDeductions) {
        const current = stockMap.get(reqIng.inventoryItemId);
        const available = current ? current.quantity : 0;
        if (!current || available < reqIng.requiredAmount) {
          const err = new Error(
            `Insufficient inventory for ingredient "${reqIng.name}": required ${reqIng.requiredAmount} ${reqIng.unit}, available ${available} ${reqIng.unit}.`
          );
          err.status = 400;
          throw err;
        }
      }

      const settings = await staffRepo.getSettings();
      const taxPercent = Number(settings.taxPercent ?? 5);
      const taxAmount = Math.round((subtotal * taxPercent) / 100);
      const totalAmount = Math.round(subtotal + taxAmount);

      const orderType = VALID_ORDER_TYPES.includes(payload.orderType ?? payload.t)
        ? (payload.orderType ?? payload.t)
        : 'Dine-in';
      const customerName = cleanText(payload.customerName, 120) || 'Guest';

      let tableId = null;
      let tableNumber = '–';
      const rawTable = cleanText(payload.tableNumber ?? payload.tb ?? '', 16);
      if (orderType === 'Dine-in' && rawTable && rawTable !== '–') {
        const table = await tableRepo.findByIdOrNumber(rawTable);
        if (table) {
          tableId = table.id;
          tableNumber = table.tableNumber;
        } else {
          tableNumber = rawTable;
        }
      }

      try {
        return await orderRepo.createAtomic({
          orderType,
          tableId,
          tableNumber,
          customerName,
          itemCount,
          subtotal,
          taxPercent,
          taxAmount,
          totalAmount,
          orderItems,
          ingredientDeductions,
        });
      } catch (err) {
        if (/CHECK constraint failed/i.test(String(err?.message || err?.cause?.message))) {
          const stockErr = new Error('Insufficient inventory stock to fulfill this order.');
          stockErr.status = 400;
          throw stockErr;
        }
        throw err;
      }
    },

    async updateOrderStatus(id, { status } = {}) {
      const existing = await this.getOrder(id);
      if (!existing) {
        const err = new Error('Order not found.');
        err.status = 404;
        throw err;
      }

      let nextStatus = status;
      if (!nextStatus) {
        const cycle = ['Preparing', 'Ready', 'Served'];
        const idx = cycle.indexOf(existing.status);
        nextStatus = idx >= 0 ? cycle[(idx + 1) % cycle.length] : 'Preparing';
      }

      if (!VALID_ORDER_STATUSES.includes(nextStatus)) {
        const err = new Error(`Invalid order status. Allowed: ${VALID_ORDER_STATUSES.join(', ')}`);
        err.status = 400;
        throw err;
      }

      return orderRepo.updateStatus(existing.id, nextStatus);
    },
  };
}
