/**
 * D1 Repository for Table Reservations.
 */
export function createReservationRepository(db) {
  const formatReservation = (row) =>
    row
      ? {
          id: row.id,
          guestName: row.guest_name,
          guestPhone: row.guest_phone || '',
          tableId: row.table_id,
          tableNumber: row.table_number,
          date: row.reservation_date,
          time: row.reservation_time,
          dateTimeDisplay: `${row.reservation_date}, ${row.reservation_time}`,
          partySize: Number(row.party_size),
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;

  const baseSelect = `
    SELECT
      id, guest_name, guest_phone, table_id, table_number,
      reservation_date, reservation_time, party_size, status, created_at, updated_at
    FROM reservations
  `;

  return {
    async list({ status = '', date = '' } = {}) {
      const clauses = [];
      const params = [];

      if (status && status !== 'All') {
        params.push(status);
        clauses.push(`status = ?${params.length}`);
      }
      if (date) {
        params.push(date);
        clauses.push(`reservation_date = ?${params.length}`);
      }

      const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { results } = await db
        .prepare(`${baseSelect} ${whereSql} ORDER BY id DESC`)
        .bind(...params)
        .all();
      return (results || []).map(formatReservation);
    },

    async findById(id) {
      const row = await db.prepare(`${baseSelect} WHERE id = ?1`).bind(Number(id)).first();
      return formatReservation(row);
    },

    async hasActiveConflict({ tableId, date, time, excludeId = null }) {
      const sql = excludeId
        ? `SELECT id FROM reservations
           WHERE table_id = ?1 AND reservation_date = ?2 AND lower(reservation_time) = lower(?3)
             AND status IN ('Upcoming', 'Checked In') AND id != ?4`
        : `SELECT id FROM reservations
           WHERE table_id = ?1 AND reservation_date = ?2 AND lower(reservation_time) = lower(?3)
             AND status IN ('Upcoming', 'Checked In')`;
      const stmt = db.prepare(sql);
      const bound = excludeId
        ? stmt.bind(Number(tableId), date, time, Number(excludeId))
        : stmt.bind(Number(tableId), date, time);
      return Boolean(await bound.first());
    },

    async create({ guestName, guestPhone = '', tableId, tableNumber, date, time, partySize }) {
      try {
        const res = await db
          .prepare(
            `INSERT INTO reservations (
               guest_name, guest_phone, table_id, table_number, reservation_date, reservation_time, party_size, status
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Upcoming')`
          )
          .bind(
            guestName.trim(),
            guestPhone.trim(),
            Number(tableId),
            tableNumber,
            date.trim(),
            time.trim(),
            Number(partySize)
          )
          .run();
        return this.findById(res?.meta?.last_row_id);
      } catch (err) {
        if (/uq_reservations_active_slot|UNIQUE constraint failed/i.test(String(err?.message || err?.cause?.message))) {
          const conflictErr = new Error('Selected table is already reserved for that date and time.');
          conflictErr.status = 409;
          throw conflictErr;
        }
        throw err;
      }
    },

    async updateStatus(id, status) {
      const existing = await this.findById(id);
      if (!existing) return null;
      await db
        .prepare(
          `UPDATE reservations
           SET status = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?2`
        )
        .bind(status, Number(id))
        .run();
      return this.findById(id);
    },

    async remove(id) {
      const res = await db.prepare(`DELETE FROM reservations WHERE id = ?1`).bind(Number(id)).run();
      return (res?.meta?.changes || 0) > 0;
    },
  };
}
