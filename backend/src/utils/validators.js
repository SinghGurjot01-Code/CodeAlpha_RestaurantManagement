export const VALID_MENU_CATEGORIES = ['Starters', 'Main Course', 'Desserts', 'Beverages'];
export const VALID_MENU_STATUSES = ['In Stock', 'Out of Stock'];
export const VALID_ORDER_TYPES = ['Dine-in', 'Takeaway', 'Online'];
export const VALID_ORDER_STATUSES = ['Preparing', 'Ready', 'Served', 'Cancelled'];
export const VALID_RESERVATION_STATUSES = ['Upcoming', 'Checked In', 'Completed', 'Cancelled'];
export const VALID_STAFF_ROLES = ['Admin', 'Manager', 'Staff'];

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254;
}

export function cleanText(val, maxLen = 250) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}
