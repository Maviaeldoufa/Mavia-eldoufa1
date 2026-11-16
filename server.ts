import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { getUserByToken } from './server/auth.ts';
import { db, recordAppError, UPLOADS_DIR } from './server/db.ts';
import { globalApiRateLimiter } from './server/rateLimit.ts';
import accountRoutes from './server/routes/accountRoutes.ts';
import aiRoutes from './server/routes/aiRoutes.ts';
import authRoutes from './server/routes/authRoutes.ts';
import communityRoutes from './server/routes/communityRoutes.ts';
import courseRoutes from './server/routes/courseRoutes.ts';
import courseTutorRoutes from './server/routes/courseTutorRoutes.ts';
import dashboardRoutes from './server/routes/dashboardRoutes.ts';
import learningRoutes from './server/routes/learningRoutes.ts';
import notificationRoutes from './server/routes/notificationRoutes.ts';
import platformRoutes from './server/routes/platformRoutes.ts';
import ranksRoutes from './server/routes/ranksRoutes.ts';
import supportRoutes from './server/routes/supportRoutes.ts';
import systemRoutes from './server/routes/systemRoutes.ts';
import { attachWebSocketHub } from './server/wsHub.ts';

const PORT = Number(process.env.PORT) || 3000;

const MAINTENANCE_EXEMPT_PATHS = new Set([
  '/status',
  '/health',
  '/platform/config',
  '/auth/login',
  '/auth/logout',
  '/auth/me',
  '/monitoring/client-error',
]);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const httpServer = http.createServer(app);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/uploads', express.static(UPLOADS_DIR));

  app.use('/api', globalApiRateLimiter);

  app.use('/api', (req, res, next) => {
    const store = db.get();
    if (!store.maintenance?.enabled) {
      next();
      return;
    }

    if (MAINTENANCE_EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    const user = getUserByToken(token);
    if (user?.role === 'admin') {
      next();
      return;
    }

    res.status(503).json({
      maintenance: true,
      error:
        store.maintenance.message ||
        'المنصة في وضع الصيانة حالياً لإجراء تحديثات. سنعود قريباً.',
    });
  });

  app.use('/api', authRoutes);
  app.use('/api', accountRoutes);
  app.use('/api', courseRoutes);
  app.use('/api', courseTutorRoutes);
  app.use('/api', dashboardRoutes);
  app.use('/api', learningRoutes);
  app.use('/api', communityRoutes);
  app.use('/api', supportRoutes);
  app.use('/api', platformRoutes);
  app.use('/api', ranksRoutes);
  app.use('/api', notificationRoutes);
  app.use('/api', systemRoutes);
  app.use('/api', aiRoutes);

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('Unhandled API Error:', err);
      recordAppError({
        source: 'server',
        message: err instanceof Error ? err.message : 'Unhandled server API error',
        path: req.originalUrl,
        stack: err instanceof Error ? err.stack : undefined,
        notifyAdmin: true,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'حدث خطأ داخلي في الخادم.' });
      }
    }
  );

  attachWebSocketHub(httpServer);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mafia platform server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
