import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export function createApp(resolveContext) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    try {
      req.ctx = resolveContext(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res, next) => {
    const { corsOrigins } = req.ctx.config;
    if (!corsOrigins.length) return next();
    return cors({
      origin: corsOrigins.includes('*') ? true : corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })(req, res, next);
  });

  app.use(express.json({ limit: '512kb' }));
  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
