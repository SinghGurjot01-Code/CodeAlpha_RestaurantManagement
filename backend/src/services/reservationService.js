import { VALID_RESERVATION_STATUSES, cleanText } from '../utils/validators.js';

export function createReservationService({ reservationRepo, tableRepo }) {
  return {
    async listReservations({ status = '', date = '' } = {}) {
      return reservationRepo.list({
        status: cleanText(status, 40),
        date: cleanText(date, 40),
      });
    },

    async checkAvailability({ date, time, partySize = 2 } = {}) {
      const cleanDate = cleanText(date, 40);
      const cleanTime = cleanText(time, 40);
      const guests = Number(partySize || 2);

      if (!cleanDate || !cleanTime) {
        const err = new Error('Reservation date and time are required to check availability.');
        err.status = 400;
        throw err;
      }
      if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
        const err = new Error('Party size must be between 1 and 20 guests.');
        err.status = 400;
        throw err;
      }

      const availableTables = await tableRepo.findAvailableTables({
        date: cleanDate,
        time: cleanTime,
        partySize: guests,
      });

      return {
        date: cleanDate,
        time: cleanTime,
        partySize: guests,
        available: availableTables.length > 0,
        availableCount: availableTables.length,
        suggestedTable: availableTables[0] || null,
        availableTables,
      };
    },

    async createReservation(payload = {}) {
      const date = cleanText(payload.date ?? payload.d, 40);
      const time = cleanText(payload.time ?? payload.t, 40);
      const partySize = Number(payload.partySize ?? payload.guests ?? payload.p ?? 2);
      const guestName = cleanText(payload.guestName ?? payload.g ?? 'Guest', 120) || 'Guest';
      const guestPhone = cleanText(payload.guestPhone ?? payload.phone ?? '', 30);
      const requestedTable = cleanText(payload.tableNumber ?? payload.tableId ?? payload.tb ?? '', 16);

      if (!date || !time) {
        const err = new Error('Reservation date and time are required.');
        err.status = 400;
        throw err;
      }
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
        const err = new Error('Number of guests must be between 1 and 20.');
        err.status = 400;
        throw err;
      }

      let chosenTable = null;

      if (requestedTable) {
        const table = await tableRepo.findByIdOrNumber(requestedTable);
        if (!table) {
          const err = new Error(`Table "${requestedTable}" does not exist.`);
          err.status = 404;
          throw err;
        }
        if (table.capacity < partySize) {
          const err = new Error(
            `Table ${table.tableNumber} only seats ${table.capacity} guests (requested ${partySize}).`
          );
          err.status = 400;
          throw err;
        }
        const conflict = await reservationRepo.hasActiveConflict({
          tableId: table.id,
          date,
          time,
        });
        if (conflict) {
          const err = new Error(`Table ${table.tableNumber} is already booked for ${date} at ${time}.`);
          err.status = 409;
          throw err;
        }
        chosenTable = table;
      } else {
        // Deterministically find the smallest suitable available table for this date, time, and party size
        const availableTables = await tableRepo.findAvailableTables({ date, time, partySize });
        if (!availableTables.length) {
          const err = new Error(`No tables available for ${partySize} guests on ${date} at ${time}.`);
          err.status = 409;
          throw err;
        }
        chosenTable = availableTables[0];
      }

      return reservationRepo.create({
        guestName,
        guestPhone,
        tableId: chosenTable.id,
        tableNumber: chosenTable.tableNumber,
        date,
        time,
        partySize,
      });
    },

    async updateReservationStatus(id, { status } = {}) {
      const existing = await reservationRepo.findById(id);
      if (!existing) {
        const err = new Error('Reservation not found.');
        err.status = 404;
        throw err;
      }

      let nextStatus = status;
      if (!nextStatus) {
        const cycle = ['Upcoming', 'Checked In', 'Completed'];
        const idx = cycle.indexOf(existing.status);
        nextStatus = idx >= 0 ? cycle[(idx + 1) % cycle.length] : 'Upcoming';
      }

      if (!VALID_RESERVATION_STATUSES.includes(nextStatus)) {
        const err = new Error(`Invalid reservation status. Allowed: ${VALID_RESERVATION_STATUSES.join(', ')}`);
        err.status = 400;
        throw err;
      }

      return reservationRepo.updateStatus(existing.id, nextStatus);
    },

    async deleteReservation(id) {
      const existing = await reservationRepo.findById(id);
      if (!existing) {
        const err = new Error('Reservation not found.');
        err.status = 404;
        throw err;
      }
      await reservationRepo.remove(existing.id);
      return { deleted: true, id: existing.id };
    },
  };
}
