const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const listInventory = asyncHandler(async (req, res) => {
  const { q = '' } = req.query || {};
  const { items, lowStockCount } = await req.ctx.inventoryService.listInventory({ q });
  res.json({ items, lowStockCount });
});

export const createInventoryItem = asyncHandler(async (req, res) => {
  const item = await req.ctx.inventoryService.addInventoryItem(req.body || {});
  res.status(201).json({ item });
});

export const updateInventoryItem = asyncHandler(async (req, res) => {
  const item = await req.ctx.inventoryService.updateInventoryItem(req.params.id, req.body || {});
  res.json({ item });
});

export const listInventoryLogs = asyncHandler(async (req, res) => {
  const limit = Number(req.query?.limit) || 30;
  const logs = await req.ctx.inventoryService.getInventoryLogs(limit);
  res.json({ logs });
});

export const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await req.ctx.reportService.getDashboard();
  res.json(dashboard);
});

export const getDailySales = asyncHandler(async (req, res) => {
  const report = await req.ctx.reportService.getDailySalesReport();
  res.json(report);
});
