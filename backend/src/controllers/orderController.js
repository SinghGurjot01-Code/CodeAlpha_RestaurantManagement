const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const listOrders = asyncHandler(async (req, res) => {
  const { type = '', orderType = '', status = '', q = '' } = req.query || {};
  const orders = await req.ctx.orderService.listOrders({
    orderType: orderType || type,
    status,
    q,
  });
  res.json({ orders });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await req.ctx.orderService.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  res.json({ order });
});

export const createOrder = asyncHandler(async (req, res) => {
  const order = await req.ctx.orderService.placeOrder(req.body || {});
  res.status(201).json({ order });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await req.ctx.orderService.updateOrderStatus(req.params.id, req.body || {});
  res.json({ order });
});
