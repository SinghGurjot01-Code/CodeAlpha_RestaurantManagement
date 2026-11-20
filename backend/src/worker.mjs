// Cloudflare Workers entry point: runs Express 5 via `cloudflare:node` httpServerHandler + D1 binding.
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import http from 'node:http';
import { createApp } from './app.js';
import { createStaffRepository } from './repositories/staffRepository.js';
import { createMenuRepository } from './repositories/menuRepository.js';
import { createInventoryRepository } from './repositories/inventoryRepository.js';
import { createTableRepository } from './repositories/tableRepository.js';
import { createReservationRepository } from './repositories/reservationRepository.js';
import { createOrderRepository } from './repositories/orderRepository.js';
import { createAuthService } from './services/authService.js';
import { createMenuService } from './services/menuService.js';
import { createInventoryService } from './services/inventoryService.js';
import { createOrderService } from './services/orderService.js';
import { createReservationService } from './services/reservationService.js';
import { createReportService } from './services/reportService.js';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

let cached;
function resolveContext() {
  if (!cached) {
    const staffRepo = createStaffRepository(env.DB);
    const menuRepo = createMenuRepository(env.DB);
    const inventoryRepo = createInventoryRepository(env.DB);
    const tableRepo = createTableRepository(env.DB);
    const reservationRepo = createReservationRepository(env.DB);
    const orderRepo = createOrderRepository(env.DB);

    const jwtSecret = env.JWT_SECRET || 'dinehub-dev-fallback-secret-replace-in-prod-32b';
    const sessionTtlHours = Number(env.SESSION_TTL_HOURS) || 168;

    cached = {
      staffRepo,
      menuRepo,
      inventoryRepo,
      tableRepo,
      reservationRepo,
      orderRepo,
      authService: createAuthService({ staffRepo, jwtSecret, sessionTtlHours }),
      menuService: createMenuService({ menuRepo }),
      inventoryService: createInventoryService({ inventoryRepo }),
      orderService: createOrderService({ orderRepo, menuRepo, inventoryRepo, tableRepo, staffRepo }),
      reservationService: createReservationService({ reservationRepo, tableRepo }),
      reportService: createReportService({
        orderRepo,
        reservationRepo,
        inventoryRepo,
        menuRepo,
        tableRepo,
        staffRepo,
      }),
      config: {
        corsOrigins: list(env.CORS_ORIGIN),
        sessionTtlHours,
      },
    };
  }
  return cached;
}

const app = createApp(resolveContext);
http.createServer(app).listen(8080);

export default httpServerHandler({ port: 8080 });
