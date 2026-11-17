import fs from 'fs';
import { Router } from 'express';
import {
  getUserByToken,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
} from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import {
  createBackupSnapshot,
  db,
  getBackupFilePath,
  getEmailDeliveryConfig,
  listBackupSnapshots,
  recordAppError,
  restoreBackupSnapshot,
  validateBackupSchema,
} from '../db.ts';
import type { DatabaseSchema } from '../types.ts';

const router = Router();

// Public platform status & maintenance page payload
router.get('/status', (_req, res) => {
  const store = db.get();
  const maintenance = store.maintenance || {
    enabled: false,
    message: 'نقوم حالياً بأعمال صيانة وتحديثات لتحسين أداء المنصة. سنعود قريباً.',
  };
  res.json({
    status: maintenance.enabled ? 'maintenance' : 'operational',
    maintenance,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      api: 'up',
      database: 'up',
      websocket: 'up',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      emailConfigured: getEmailDeliveryConfig().enabled,
    },
  });
});

// Lightweight healthcheck endpoint
router.get('/health', (_req, res) => {
  const store = db.get();
  res.json({
    ok: true,
    status: store.maintenance?.enabled ? 'maintenance' : 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Client runtime error telemetry
router.post('/monitoring/client-error', (req, res) => {
  const { message, path: clientPath, stack } = req.body as {
    message?: string;
    path?: string;
    stack?: string;
  };

  if (!message || !String(message).trim()) {
    res.status(400).json({ error: 'Missing error message' });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;
  const user = getUserByToken(token);

  recordAppError({
    source: 'client',
    message: String(message),
    path: clientPath ? String(clientPath) : undefined,
    userId: user?.id,
    stack: stack ? String(stack) : undefined,
    notifyAdmin: false,
  });

  res.status(201).json({ ok: true });
});

// Admin: view error logs
router.get('/admin/system/errors', requireAuth, requirePermission('view_sensitive_data'), (_req, res) => {
  const store = db.get();
  res.json({ errors: store.errorLogs || [] });
});

// Admin: clear error logs
router.delete('/admin/system/errors', requireAuth, requirePermission('view_sensitive_data'), (_req, res) => {
  const store = db.get();
  store.errorLogs = [];
  db.save();
  res.json({ ok: true });
});

// Admin: list database backup snapshots
router.get('/admin/system/backups', requireAuth, requirePermission('view_sensitive_data'), (_req, res) => {
  res.json({ backups: listBackupSnapshots() });
});

// Admin: create manual backup snapshot
router.post('/admin/system/backups', requireAuth, requirePermission('view_sensitive_data'), (_req, res) => {
  const backup = createBackupSnapshot('manual');
  res.status(201).json({ backup });
});

// Admin: download specific backup JSON file securely
router.get(
  '/admin/system/backups/:filename/download',
  requireAuth,
  requirePermission('view_sensitive_data'),
  (req, res) => {
    const filePath = getBackupFilePath(req.params.filename);
    if (!filePath) {
      res.status(404).json({ error: 'ملف النسخة الاحتياطية غير موجود.' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${req.params.filename}"`
    );
    res.send(content);
  }
);

// Super Admin ONLY: restore validated database backup JSON
router.post('/admin/system/restore', requireAuth, requireSuperAdmin, (req, res) => {
  const { data } = req.body as { data?: unknown };
  if (!validateBackupSchema(data)) {
    res.status(400).json({
      error: 'ملف النسخة الاحتياطية غير صالح أو يفتقد الجداول الأساسية للمنصة.',
    });
    return;
  }

  const candidate = data as DatabaseSchema;
  if (!candidate.users.some((u) => u.role === 'admin')) {
    res.status(400).json({
      error: 'ملف النسخة الاحتياطية لا يحتوي على أي حساب أدمن. تم إلغاء الاستعادة للحماية.',
    });
    return;
  }

  const { preRestoreBackup } = restoreBackupSnapshot(candidate);
  res.json({ ok: true, preRestoreBackup });
});

// Super Admin ONLY: toggle or update maintenance mode
router.put(
  '/admin/system/maintenance',
  requireAuth,
  requireSuperAdmin,
  (req: AuthenticatedRequest, res) => {
    const { enabled, message } = req.body as {
      enabled?: boolean;
      message?: string;
    };

    const store = db.get();
    store.maintenance = {
      enabled: Boolean(enabled),
      message:
        message?.trim() ||
        store.maintenance?.message ||
        'نقوم حالياً بأعمال صيانة وتحديثات لتحسين أداء المنصة. سنعود قريباً.',
      updatedAt: new Date().toISOString(),
      updatedBy: req.currentUser!.name,
    };
    db.save();

    res.json({ maintenance: store.maintenance });
  }
);

export default router;
