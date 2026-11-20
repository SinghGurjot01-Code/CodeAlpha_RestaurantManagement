/**
 * D1 Repository for Staff Users & Restaurant Settings.
 */
export function createStaffRepository(db) {
  const formatStaff = (row) =>
    row
      ? {
          id: row.id,
          name: row.full_name,
          fullName: row.full_name,
          email: row.email,
          role: row.role,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;

  return {
    async findByEmailWithHash(email) {
      const norm = String(email || '').trim().toLowerCase();
      return (
        (await db
          .prepare(
            `SELECT id, full_name, email, password_hash, role, created_at, updated_at
             FROM staff_users WHERE lower(email) = ?1`
          )
          .bind(norm)
          .first()) || null
      );
    },

    async findById(id) {
      const row = await db
        .prepare(
          `SELECT id, full_name, email, role, created_at, updated_at
           FROM staff_users WHERE id = ?1`
        )
        .bind(Number(id))
        .first();
      return formatStaff(row);
    },

    async listAll() {
      const { results } = await db
        .prepare(`SELECT id, full_name, email, role, created_at, updated_at FROM staff_users ORDER BY id ASC`)
        .all();
      return (results || []).map(formatStaff);
    },

    async create({ fullName, email, passwordHash, role = 'Staff' }) {
      const norm = email.trim().toLowerCase();
      try {
        const res = await db
          .prepare(
            `INSERT INTO staff_users (full_name, email, password_hash, role)
             VALUES (?1, ?2, ?3, ?4)`
          )
          .bind(fullName.trim(), norm, passwordHash, role)
          .run();
        return this.findById(res?.meta?.last_row_id);
      } catch (err) {
        if (/UNIQUE constraint failed/i.test(String(err?.message || err?.cause?.message))) {
          return null;
        }
        throw err;
      }
    },

    async getSettings() {
      const row = await db
        .prepare(`SELECT name, tax_percent, open_time, close_time, updated_at FROM restaurant_settings WHERE id = 1`)
        .first();
      return row
        ? {
            name: row.name,
            tax: Number(row.tax_percent),
            taxPercent: Number(row.tax_percent),
            open: row.open_time,
            close: row.close_time,
            updatedAt: row.updated_at,
          }
        : { name: 'DineHub Restaurant', tax: 5, taxPercent: 5, open: '10:00', close: '23:00' };
    },

    async updateSettings({ name, taxPercent, openTime, closeTime }) {
      const cur = await this.getSettings();
      await db
        .prepare(
          `UPDATE restaurant_settings
           SET name = ?1, tax_percent = ?2, open_time = ?3, close_time = ?4,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = 1`
        )
        .bind(
          name ?? cur.name,
          taxPercent !== undefined ? Number(taxPercent) : cur.taxPercent,
          openTime ?? cur.open,
          closeTime ?? cur.close
        )
        .run();
      return this.getSettings();
    },

    formatStaff,
  };
}
