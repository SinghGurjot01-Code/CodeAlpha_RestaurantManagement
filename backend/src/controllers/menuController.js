const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const listMenu = asyncHandler(async (req, res) => {
  const { category = '', q = '' } = req.query || {};
  const { items, categories } = await req.ctx.menuService.listMenu({ category, q });
  res.json({ items, categories });
});

export const getMenuItem = asyncHandler(async (req, res) => {
  const item = await req.ctx.menuService.getMenuItem(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Menu item not found.' });
  }
  res.json({ item });
});

export const createMenuItem = asyncHandler(async (req, res) => {
  const item = await req.ctx.menuService.createMenuItem(req.body || {});
  res.status(201).json({ item });
});

export const updateMenuItem = asyncHandler(async (req, res) => {
  const item = await req.ctx.menuService.updateMenuItem(req.params.id, req.body || {});
  res.json({ item });
});

export const deleteMenuItem = asyncHandler(async (req, res) => {
  const result = await req.ctx.menuService.deleteMenuItem(req.params.id);
  res.json(result);
});
