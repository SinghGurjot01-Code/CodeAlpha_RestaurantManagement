const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const listReservations = asyncHandler(async (req, res) => {
  const { status = '', date = '' } = req.query || {};
  const reservations = await req.ctx.reservationService.listReservations({ status, date });
  res.json({ reservations });
});

export const checkAvailability = asyncHandler(async (req, res) => {
  const { date, d, time, t, partySize, guests, p } = req.query || {};
  const availability = await req.ctx.reservationService.checkAvailability({
    date: date ?? d,
    time: time ?? t,
    partySize: partySize ?? guests ?? p ?? 2,
  });
  res.json(availability);
});

export const createReservation = asyncHandler(async (req, res) => {
  const reservation = await req.ctx.reservationService.createReservation(req.body || {});
  res.status(201).json({ reservation });
});

export const updateReservationStatus = asyncHandler(async (req, res) => {
  const reservation = await req.ctx.reservationService.updateReservationStatus(req.params.id, req.body || {});
  res.json({ reservation });
});

export const deleteReservation = asyncHandler(async (req, res) => {
  const result = await req.ctx.reservationService.deleteReservation(req.params.id);
  res.json(result);
});

export const listTables = asyncHandler(async (req, res) => {
  const tables = await req.ctx.tableRepo.list();
  res.json({ tables });
});

export const getTable = asyncHandler(async (req, res) => {
  const table = await req.ctx.tableRepo.findByIdOrNumber(req.params.id);
  if (!table) {
    return res.status(404).json({ error: 'Table not found.' });
  }
  res.json({ table });
});
