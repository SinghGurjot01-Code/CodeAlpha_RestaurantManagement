import express from 'express';
import * as authController from '../controllers/authController.js';
import * as menuController from '../controllers/menuController.js';
import * as orderController from '../controllers/orderController.js';
import * as reservationController from '../controllers/reservationController.js';
import * as inventoryController from '../controllers/inventoryController.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 60000, max: 50, keyPrefix: 'dh-auth' });
const writeLimiter = rateLimit({ windowMs: 60000, max: 120, keyPrefix: 'dh-write' });

// Health check
router.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'dinehub-api' }));

// Authentication & Staff / Settings
router.post('/api/auth/login', authLimiter, authController.login);
router.post('/api/auth/logout', authController.logout);
router.get('/api/auth/me', optionalAuth, authController.me);
router.get('/api/staff', requireAuth, authController.listStaff);
router.post('/api/staff', writeLimiter, requireAuth, requireRole('Admin', 'Manager'), authController.createStaff);
router.get('/api/settings', authController.getSettings);
router.patch('/api/settings', writeLimiter, requireAuth, requireRole('Admin', 'Manager'), authController.updateSettings);

// Menu
router.get('/api/menu', menuController.listMenu);
router.get('/api/menu/:id', menuController.getMenuItem);
router.post('/api/menu', writeLimiter, requireAuth, requireRole('Admin', 'Manager'), menuController.createMenuItem);
router.patch('/api/menu/:id', writeLimiter, requireAuth, requireRole('Admin', 'Manager'), menuController.updateMenuItem);
router.delete('/api/menu/:id', writeLimiter, requireAuth, requireRole('Admin', 'Manager'), menuController.deleteMenuItem);

// Orders
router.get('/api/orders', optionalAuth, orderController.listOrders);
router.get('/api/orders/:id', optionalAuth, orderController.getOrder);
router.post('/api/orders', writeLimiter, optionalAuth, orderController.createOrder);
router.patch('/api/orders/:id/status', writeLimiter, requireAuth, orderController.updateOrderStatus);

// Reservations
router.get('/api/reservations/availability', reservationController.checkAvailability);
router.get('/api/reservations', optionalAuth, reservationController.listReservations);
router.post('/api/reservations', writeLimiter, optionalAuth, reservationController.createReservation);
router.patch('/api/reservations/:id/status', writeLimiter, requireAuth, reservationController.updateReservationStatus);
router.delete('/api/reservations/:id', writeLimiter, requireAuth, reservationController.deleteReservation);

// Tables
router.get('/api/tables', reservationController.listTables);
router.get('/api/tables/:id', reservationController.getTable);

// Inventory & Logs
router.get('/api/inventory/logs', requireAuth, inventoryController.listInventoryLogs);
router.get('/api/inventory', requireAuth, inventoryController.listInventory);
router.post('/api/inventory', writeLimiter, requireAuth, inventoryController.createInventoryItem);
router.patch('/api/inventory/:id', writeLimiter, requireAuth, inventoryController.updateInventoryItem);

// Dashboard & Reports
router.get('/api/dashboard', requireAuth, inventoryController.getDashboard);
router.get('/api/reports/daily-sales', requireAuth, inventoryController.getDailySales);

export default router;
