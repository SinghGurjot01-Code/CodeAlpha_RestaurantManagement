/**
 * Dashboard & Daily Sales Report Service.
 * Computes all statistics directly from D1 records (orders, order_items, reservations, inventory_items, menu_items).
 */
export function createReportService({ orderRepo, reservationRepo, inventoryRepo, menuRepo, tableRepo, staffRepo }) {
  return {
    async getDashboard() {
      const [orders, reservations, inventoryItems, tables, settings, staff] = await Promise.all([
        orderRepo.list(),
        reservationRepo.list(),
        inventoryRepo.list(),
        tableRepo.list(),
        staffRepo.getSettings(),
        staffRepo.listAll(),
      ]);

      const activeOrders = orders.filter((o) => o.status !== 'Cancelled');
      const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const totalOrders = activeOrders.length;
      const activeReservations = reservations.filter((r) => r.status !== 'Cancelled');
      const lowStockItems = inventoryItems.filter((i) => i.isLowStock);

      return {
        stats: {
          totalRevenue,
          totalOrders,
          totalReservations: activeReservations.length,
          lowStockCount: lowStockItems.length,
        },
        lowStockItems,
        recentOrders: orders.slice(0, 5),
        tables,
        settings,
        staff,
      };
    },

    async getDailySalesReport() {
      const [orders, reservations, menuItems] = await Promise.all([
        orderRepo.list(),
        reservationRepo.list(),
        menuRepo.list(),
      ]);

      const activeOrders = orders.filter((o) => o.status !== 'Cancelled');
      const totalSales = activeOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const totalOrders = activeOrders.length;
      const averageOrderValue = totalOrders ? Math.round(totalSales / totalOrders) : 0;

      const ordersByStatus = {
        Preparing: orders.filter((o) => o.status === 'Preparing').length,
        Ready: orders.filter((o) => o.status === 'Ready').length,
        Served: orders.filter((o) => o.status === 'Served').length,
        Cancelled: orders.filter((o) => o.status === 'Cancelled').length,
      };

      // Aggregate top-selling menu items by actual order_items revenue and quantity
      const salesByMenuId = new Map();
      for (const order of activeOrders) {
        for (const item of order.items || []) {
          const key = item.menuItemId || item.name;
          const prev = salesByMenuId.get(key) || {
            menuItemId: item.menuItemId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantitySold: 0,
            revenue: 0,
          };
          prev.quantitySold += Number(item.quantity);
          prev.revenue += Number(item.lineTotal);
          salesByMenuId.set(key, prev);
        }
      }

      const topMenuItems = [...menuItems]
        .map((m) => {
          const sold = salesByMenuId.get(m.id);
          return {
            id: m.id,
            name: m.name,
            category: m.category,
            price: m.price,
            emoji: m.emoji,
            assetKey: m.assetKey,
            quantitySold: sold ? sold.quantitySold : 0,
            revenue: sold ? sold.revenue : 0,
          };
        })
        .sort((a, b) => b.revenue - a.revenue || b.price - a.price)
        .slice(0, 4);

      return {
        totalSales,
        totalOrders,
        averageOrderValue,
        totalReservations: reservations.length,
        ordersByStatus,
        topMenuItems,
      };
    },
  };
}
