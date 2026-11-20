/**
 * D1 Repository for Restaurant Dining Tables (T1..T9).
 * Computes real-time occupancy from active reservations and active dine-in orders.
 */
export function createTableRepository(db) {
  const formatTable = (row) => {
    if (!row) return null;
    const hasOccupied = Number(row.active_occupied || 0) > 0;
    const hasReserved = Number(row.active_reserved || 0) > 0;
    const computedStatus = hasOccupied ? 'Occupied' : hasReserved ? 'Reserved' : 'Free';
    return {
      id: row.id,
      tableNumber: row.table_number,
      capacity: Number(row.capacity),
      status: computedStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const baseSelect = `
    SELECT
      t.id, t.table_number, t.capacity, t.status, t.created_at, t.updated_at,
      (
        SELECT COUNT(*) FROM reservations r
        WHERE r.table_id = t.id AND r.status = 'Checked In'
      ) + (
        SELECT COUNT(*) FROM orders o
        WHERE (o.table_id = t.id OR o.table_number = t.table_number) AND o.status = 'Preparing'
      ) AS active_occupied,
      (
        SELECT COUNT(*) FROM reservations r
        WHERE r.table_id = t.id AND r.status = 'Upcoming'
      ) AS active_reserved
    FROM restaurant_tables t
  `;

  return {
    async list() {
      const { results } = await db.prepare(`${baseSelect} ORDER BY t.id ASC`).all();
      return (results || []).map(formatTable);
    },

    async findByIdOrNumber(idOrNumber) {
      const val = String(idOrNumber || '').trim();
      const row = /^\d+$/.test(val)
        ? await db.prepare(`${baseSelect} WHERE t.id = ?1`).bind(Number(val)).first()
        : await db.prepare(`${baseSelect} WHERE upper(t.table_number) = upper(?1)`).bind(val).first();
      return formatTable(row);
    },

    /**
     * Find all tables that can accommodate `partySize` and do NOT have an overlapping active reservation
     * ('Upcoming' or 'Checked In') for `date` and `time`. Ordered by smallest sufficient capacity first.
     */
    async findAvailableTables({ date, time, partySize = 2 }) {
      const { results } = await db
        .prepare(
          `SELECT t.id, t.table_number, t.capacity, t.status, t.created_at, t.updated_at
           FROM restaurant_tables t
           WHERE t.capacity >= ?1
             AND NOT EXISTS (
               SELECT 1 FROM reservations r
               WHERE r.table_id = t.id
                 AND r.reservation_date = ?2
                 AND lower(r.reservation_time) = lower(?3)
                 AND r.status IN ('Upcoming', 'Checked In')
             )
           ORDER BY t.capacity ASC, t.id ASC`
        )
        .bind(Number(partySize), String(date).trim(), String(time).trim())
        .all();

      return (results || []).map((r) => ({
        id: r.id,
        tableNumber: r.table_number,
        capacity: Number(r.capacity),
        status: 'Free',
      }));
    },
  };
}
