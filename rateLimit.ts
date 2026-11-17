import type { NextFunction, Request, Response } from 'express';

interface RateBucket {
  timestamps: number[];
}

interface LockoutEntry {
  failedCount: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

const ipBuckets = new Map<string, RateBucket>();
const loginLockouts = new Map<string, LockoutEntry>();

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of ipBuckets.entries()) {
    if (
      bucket.timestamps.length === 0 ||
      now - bucket.timestamps[bucket.timestamps.length - 1] > 30 * 60 * 1000
    ) {
      ipBuckets.delete(key);
    }
  }
  for (const [key, entry] of loginLockouts.entries()) {
    if (now > entry.lockedUntil && now - entry.lastAttemptAt > LOCKOUT_WINDOW_MS) {
      loginLockouts.delete(key);
    }
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

export function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${options.keyPrefix}:${ip}`;
    const bucket = ipBuckets.get(key) || { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < options.windowMs);

    if (bucket.timestamps.length >= options.maxRequests) {
      const oldest = bucket.timestamps[0] || now;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((oldest + options.windowMs - now) / 1000)
      );
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: options.message,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    bucket.timestamps.push(now);
    ipBuckets.set(key, bucket);
    next();
  };
}

export function checkLoginLockout(identifier: string): {
  locked: boolean;
  retryAfterSeconds: number;
} {
  const key = identifier.trim().toLowerCase();
  if (!key) return { locked: false, retryAfterSeconds: 0 };
  const entry = loginLockouts.get(key);
  if (!entry) return { locked: false, retryAfterSeconds: 0 };
  const now = Date.now();
  if (entry.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
    };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

export function recordFailedLogin(identifier: string): {
  locked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
} {
  const key = identifier.trim().toLowerCase();
  if (!key) {
    return { locked: false, remainingAttempts: MAX_FAILED_LOGINS, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  const existing = loginLockouts.get(key);
  const resetNeeded = !existing || now - existing.lastAttemptAt > LOCKOUT_WINDOW_MS;
  const failedCount = resetNeeded ? 1 : existing.failedCount + 1;

  if (failedCount >= MAX_FAILED_LOGINS) {
    const lockedUntil = now + LOCKOUT_DURATION_MS;
    loginLockouts.set(key, {
      failedCount,
      lockedUntil,
      lastAttemptAt: now,
    });
    return {
      locked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }

  loginLockouts.set(key, {
    failedCount,
    lockedUntil: 0,
    lastAttemptAt: now,
  });

  return {
    locked: false,
    remainingAttempts: MAX_FAILED_LOGINS - failedCount,
    retryAfterSeconds: 0,
  };
}

export function clearLoginFailures(identifier: string): void {
  const key = identifier.trim().toLowerCase();
  if (key) {
    loginLockouts.delete(key);
  }
}

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: Number(process.env.MVIA_LOGIN_RATE_MAX) || 20,
  keyPrefix: 'login',
  message: 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها. يرجى المحاولة لاحقاً.',
});

export const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: Number(process.env.MVIA_REGISTER_RATE_MAX) || 12,
  keyPrefix: 'register',
  message: 'تم تجاوز عدد محاولات إنشاء الحسابات من هذا العنوان. يرجى المحاولة لاحقاً.',
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: Number(process.env.MVIA_AI_RATE_MAX) || 25,
  keyPrefix: 'ai',
  message: 'تم إرسال عدد كبير من طلبات المساعد الذكي. انتظر قليلاً ثم أعد المحاولة.',
});

export const globalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: Number(process.env.MVIA_GLOBAL_RATE_MAX) || 240,
  keyPrefix: 'api',
  message: 'تم إرسال طلبات كثيرة جداً في وقت قصير. يرجى الانتظار لحظات.',
});
