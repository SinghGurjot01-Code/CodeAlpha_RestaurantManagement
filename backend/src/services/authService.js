import { hashPassword, verifyPassword, signToken, verifyToken } from '../utils/crypto.js';
import { isValidEmail, cleanText, VALID_STAFF_ROLES } from '../utils/validators.js';

export function createAuthService({ staffRepo, jwtSecret, sessionTtlHours = 168 }) {
  return {
    async login({ email, password }) {
      if (!isValidEmail(email)) {
        const err = new Error('Please enter a valid staff email address.');
        err.status = 400;
        throw err;
      }
      if (typeof password !== 'string' || !password) {
        const err = new Error('Invalid email or password.');
        err.status = 401;
        throw err;
      }

      const row = await staffRepo.findByEmailWithHash(email);
      if (!row || !verifyPassword(password, row.password_hash)) {
        const err = new Error('Invalid email or password.');
        err.status = 401;
        throw err;
      }

      const user = staffRepo.formatStaff(row);
      const token = signToken({ sub: user.id, email: user.email, role: user.role }, jwtSecret, sessionTtlHours);
      return { user, token };
    },

    async authenticateToken(token) {
      const payload = verifyToken(token, jwtSecret);
      if (!payload || !payload.sub) return null;
      return staffRepo.findById(payload.sub);
    },

    async listStaff() {
      return staffRepo.listAll();
    },

    async createStaff(actor, { fullName, name, email, password, role = 'Staff' } = {}) {
      if (!actor || !['Admin', 'Manager'].includes(actor.role)) {
        const err = new Error('Only Admin or Manager can add staff members.');
        err.status = 403;
        throw err;
      }
      const staffName = cleanText(fullName ?? name, 120);
      if (!staffName) {
        const err = new Error('Staff member name is required.');
        err.status = 400;
        throw err;
      }
      if (!isValidEmail(email)) {
        const err = new Error('A valid staff email is required.');
        err.status = 400;
        throw err;
      }
      const staffRole = VALID_STAFF_ROLES.includes(role) ? role : 'Staff';
      const rawPassword = typeof password === 'string' && password.length >= 6 ? password : 'admin123';
      const passwordHash = hashPassword(rawPassword);

      const created = await staffRepo.create({
        fullName: staffName,
        email,
        passwordHash,
        role: staffRole,
      });
      if (!created) {
        const err = new Error('A staff user with this email already exists.');
        err.status = 409;
        throw err;
      }
      return created;
    },

    async getSettings() {
      return staffRepo.getSettings();
    },

    async updateSettings(actor, payload = {}) {
      if (!actor) {
        const err = new Error('Authentication required.');
        err.status = 401;
        throw err;
      }
      const name = payload.name !== undefined ? cleanText(payload.name, 120) : undefined;
      const taxPercent = payload.taxPercent ?? payload.tax;
      if (taxPercent !== undefined && (Number.isNaN(Number(taxPercent)) || Number(taxPercent) < 0 || Number(taxPercent) > 50)) {
        const err = new Error('Tax percentage must be between 0 and 50.');
        err.status = 400;
        throw err;
      }
      return staffRepo.updateSettings({
        name: name || undefined,
        taxPercent,
        openTime: payload.openTime ?? payload.open,
        closeTime: payload.closeTime ?? payload.close,
      });
    },
  };
}
