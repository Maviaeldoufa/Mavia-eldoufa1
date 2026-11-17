import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, hasUserPermission, isUserSuperAdmin } from './db.ts';
import type { AdminPermissionKey, User } from './types.ts';

export function getAdminSecretCode(): string {
  return (process.env.ADMIN_SECRET_CODE || '').trim();
}

export interface AuthenticatedRequest extends Request {
  currentUser?: User;
  authToken?: string;
}

export function createSessionToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const store = db.get();
  store.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
  });
  db.save();
  return token;
}

export function getUserByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const store = db.get();
  const session = store.sessions.find((s) => s.token === token);
  if (!session) return undefined;
  return store.users.find((u) => u.id === session.userId);
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;

  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً أو تم إنهاء جلستك.' });
    return;
  }

  if (user.isSuspended && !user.isProtected && user.role !== 'admin') {
    res.status(403).json({
      suspended: true,
      error:
        'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام (في الشات أو المنصة)، ولا يمكنك الدخول مجدداً إلا بإذن مباشر من الأدمن.',
    });
    return;
  }

  req.currentUser = user;
  req.authToken = token;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.currentUser || req.currentUser.role !== 'admin') {
    res.status(403).json({ error: 'هذه الصلاحية مخصصة للأدمن فقط.' });
    return;
  }
  next();
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.currentUser || !isUserSuperAdmin(req.currentUser)) {
    res.status(403).json({
      error: 'هذه الصلاحية حصرية للمدير العام (Super Admin) فقط.',
    });
    return;
  }
  next();
}

export function requirePermission(permission: AdminPermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.currentUser || req.currentUser.role !== 'admin') {
      res.status(403).json({ error: 'هذه الصلاحية مخصصة للمسؤولين فقط.' });
      return;
    }
    if (!hasUserPermission(req.currentUser, permission)) {
      res.status(403).json({
        error: 'رتبتك الإدارية الحالية لا تملك صلاحية تنفيذ هذا الإجراء.',
      });
      return;
    }
    next();
  };
}
