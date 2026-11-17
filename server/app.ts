import express from 'express';
import fs from 'fs';
import { getUserByToken } from './auth.ts';
import { db, recordAppError, UPLOADS_DIR } from './db.ts';
import { globalApiRateLimiter } from './rateLimit.ts';
import { IS_VERCEL } from './storage.ts';
import { isSupabaseDbEnabled } from './supabase.ts';
import accountRoutes from './routes/accountRoutes.ts';
import aiRoutes from './routes/aiRoutes.ts';
import authRoutes from './routes/authRoutes.ts';
import communityRoutes from './routes/communityRoutes.ts';
import courseRoutes from './routes/courseRoutes.ts';
import courseTutorRoutes from './routes/courseTutorRoutes.ts';
import dashboardRoutes from './routes/dashboardRoutes.ts';
import learningRoutes from './routes/learningRoutes.ts';
import notificationRoutes from './routes/notificationRoutes.ts';
import platformRoutes from './routes/platformRoutes.ts';
import ranksRoutes from './routes/ranksRoutes.ts';
import supportRoutes from './routes/supportRoutes.ts';
import systemRoutes from './routes/systemRoutes.ts';

const MAINTENANCE_EXEMPT_PATHS = new Set([
  '/status',
  '/health',
  '/platform/config',
  '/auth/login',
  '/auth/logout',
  '/auth/me',
  '/monitoring/client-error',
]);

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  const allowedOriginsRaw = (process.env.CORS_ORIGINS || '').trim();
  const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        allowedOrigins.length === 0 ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin);
      if (isAllowed) {
        res.setHeader(
          'Access-Control-Allow-Origin',
          allowedOrigins.includes('*') ? '*' : origin
        );
        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization'
        );
      }
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!IS_VERCEL || fs.existsSync(UPLOADS_DIR)) {
    app.use('/uploads', express.static(UPLOADS_DIR));
  }

  // Sync latest shared snapshot from Supabase before API routes and flush dirty
  // state to Supabase before transmitting responses (required for Vercel serverless).
  app.use('/api', (req, res, next) => {
    if (isSupabaseDbEnabled()) {
      let responseFlushDone = false;
      let flushPromise: Promise<void> | null = null;

      const flushOnce = async () => {
        if (responseFlushDone) return;
        if (!db.isDirty()) {
          responseFlushDone = true;
          return;
        }
        if (!flushPromise) {
          flushPromise = db
            .flushRemoteIfDirty()
            .catch((err) => {
              console.error('Supabase flush before response failed:', err);
            })
            .finally(() => {
              responseFlushDone = true;
            });
        }
        await flushPromise;
      };

      const origJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        if (responseFlushDone || !db.isDirty()) {
          return origJson(body);
        }
        void flushOnce().then(() => {
          if (!res.headersSent) {
            origJson(body);
          }
        });
        return res;
      }) as typeof res.json;

      const origSend = res.send.bind(res);
      res.send = ((body?: unknown) => {
        if (responseFlushDone || !db.isDirty()) {
          return origSend(body);
        }
        void flushOnce().then(() => {
          if (!res.headersSent) {
            origSend(body);
          }
        });
        return res;
      }) as typeof res.send;
    }

    db.ensureRemoteSynced()
      .then(() => next())
      .catch((err) => next(err));
  });

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

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'مسار API غير موجود.' });
  });

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

  return app;
}
