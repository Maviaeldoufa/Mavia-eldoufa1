import crypto from 'crypto';
import { Router } from 'express';
import {
  requireAuth,
  requirePermission,
  requireSuperAdmin,
} from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import {
  ADMIN_PERMISSIONS_CATALOG,
  ALL_ADMIN_PERMISSIONS,
  db,
  isUserSuperAdmin,
  recordAdminAudit,
} from '../db.ts';
import type {
  AdminOfficial,
  AdminPermissionKey,
  AdminRankColor,
  AdminRankIcon,
} from '../types.ts';

const router = Router();

const VALID_BADGE_ICONS = new Set<AdminRankIcon>([
  'crown',
  'medal',
  'cpu',
  'graduation-cap',
  'users',
  'headset',
  'clipboard-check',
]);

const VALID_BADGE_COLORS = new Set<AdminRankColor>([
  'gold',
  'silver',
  'sky',
  'emerald',
  'violet',
  'amber',
  'rose',
]);

function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits;
}

function isValidWhatsappNumber(raw: string): boolean {
  const digits = normalizeWhatsappNumber(raw);
  return digits.length >= 8 && digits.length <= 16;
}

function formatWhatsappLink(raw: string): string {
  const digits = normalizeWhatsappNumber(raw);
  if (digits.startsWith('00')) {
    return `https://wa.me/${digits.slice(2)}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `https://wa.me/2${digits}`;
  }
  return `https://wa.me/${digits}`;
}

function getClientIp(req: AuthenticatedRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

/**
 * Student Support Directory (Zero phone numbers or PII leaked)
 */
router.get('/support/directory', requireAuth, (_req: AuthenticatedRequest, res) => {
  const store = db.get();
  const ranks = [...(store.adminRanks || [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
  const officials = store.adminOfficials || [];

  const publicRanks = ranks
    .filter((rank) => rank.isVisibleInSupport !== false)
    .map((rank) => {
      const activeOfficials = officials
        .filter(
          (o) =>
            o.rankId === rank.id &&
            o.isActive &&
            o.showInSupport &&
            isValidWhatsappNumber(o.whatsappNumber)
        )
        .map((o) => ({
          id: o.id,
          rankId: o.rankId,
          displayName: o.displayName,
          titleNote: o.titleNote || undefined,
          hasWhatsapp: true,
        }));

      return {
        id: rank.id,
        slug: rank.slug,
        nameAr: rank.nameAr,
        nameEn: rank.nameEn,
        description: rank.description,
        badgeIcon: rank.badgeIcon,
        badgeColor: rank.badgeColor,
        displayOrder: rank.displayOrder,
        isSuperAdminRank: rank.isSuperAdminRank,
        officials: activeOfficials,
      };
    });

  res.json({ ranks: publicRanks });
});

/**
 * Server-verified contact link retrieval for a single clicked active official.
 * Never returns raw phone numbers in directory queries.
 */
router.post(
  '/support/officials/:id/whatsapp-link',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const store = db.get();
    const official = (store.adminOfficials || []).find((o) => o.id === id);

    if (!official || !official.isActive || !official.showInSupport) {
      res.status(404).json({ error: 'هذا المسؤول غير متاح حالياً في مركز الدعم.' });
      return;
    }

    const rank = (store.adminRanks || []).find((r) => r.id === official.rankId);
    if (!rank || rank.isVisibleInSupport === false) {
      res.status(404).json({ error: 'هذا القسم الإداري مخفي حالياً من مركز الدعم.' });
      return;
    }

    if (!isValidWhatsappNumber(official.whatsappNumber)) {
      res.status(400).json({ error: 'وسيلة التواصل عبر واتساب غير مكتملة لهذا المسؤول.' });
      return;
    }

    res.json({
      whatsappUrl: formatWhatsappLink(official.whatsappNumber),
      officialName: official.displayName,
      rankNameAr: rank.nameAr,
      rankNameEn: rank.nameEn,
    });
  }
);

/**
 * Admin Directory: View ranks, permissions catalog, officials & assignable users
 */
router.get(
  '/admin/ranks',
  requireAuth,
  requirePermission('manage_officials'),
  (req: AuthenticatedRequest, res) => {
    const store = db.get();
    const callerIsSuperAdmin = isUserSuperAdmin(req.currentUser);
    const ranks = [...(store.adminRanks || [])].sort(
      (a, b) => a.displayOrder - b.displayOrder
    );

    const officials = (store.adminOfficials || []).map((o) => {
      const isProtectedRank =
        o.rankId === 'rank-super-admin' || o.rankId === 'rank-deputy-director';
      if (!callerIsSuperAdmin && isProtectedRank) {
        return {
          ...o,
          whatsappNumber: '********',
        };
      }
      return o;
    });

    const candidates = (store.users || []).map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      year: u.year,
      adminRankId: u.adminRankId,
      isProtected: u.isProtected,
      isSuspended: Boolean(u.isSuspended),
    }));

    res.json({
      ranks,
      officials,
      candidates,
      permissionsCatalog: ADMIN_PERMISSIONS_CATALOG,
      canEditRanks: callerIsSuperAdmin,
      canManageOfficials: true,
    });
  }
);

/**
 * Super Admin ONLY: Update a rank's name, icon, support visibility, and permissions
 */
router.patch(
  '/admin/ranks/:rankId',
  requireAuth,
  requireSuperAdmin,
  (req: AuthenticatedRequest, res) => {
    const { rankId } = req.params;
    const {
      nameAr,
      nameEn,
      description,
      badgeIcon,
      badgeColor,
      isVisibleInSupport,
      permissions,
    } = req.body as {
      nameAr?: string;
      nameEn?: string;
      description?: string;
      badgeIcon?: AdminRankIcon;
      badgeColor?: AdminRankColor;
      isVisibleInSupport?: boolean;
      permissions?: AdminPermissionKey[];
    };

    const store = db.get();
    const rank = (store.adminRanks || []).find((r) => r.id === rankId);
    if (!rank) {
      res.status(404).json({ error: 'الرتبة الإدارية غير موجودة.' });
      return;
    }

    if (typeof nameAr === 'string' && nameAr.trim().length >= 2) {
      rank.nameAr = nameAr.trim().slice(0, 80);
    }
    if (typeof nameEn === 'string' && nameEn.trim().length >= 2) {
      rank.nameEn = nameEn.trim().slice(0, 80);
    }
    if (typeof description === 'string') {
      rank.description = description.trim().slice(0, 240);
    }
    if (badgeIcon && VALID_BADGE_ICONS.has(badgeIcon)) {
      rank.badgeIcon = badgeIcon;
    }
    if (badgeColor && VALID_BADGE_COLORS.has(badgeColor)) {
      rank.badgeColor = badgeColor;
    }
    if (typeof isVisibleInSupport === 'boolean') {
      rank.isVisibleInSupport = isVisibleInSupport;
    }

    if (Array.isArray(permissions)) {
      if (rank.isSuperAdminRank || rank.id === 'rank-super-admin') {
        // Super Admin rank cannot have its core permissions stripped
        rank.permissions = [...ALL_ADMIN_PERMISSIONS];
      } else {
        const validSet = new Set<AdminPermissionKey>(ALL_ADMIN_PERMISSIONS);
        rank.permissions = Array.from(
          new Set(
            permissions.filter(
              (p): p is AdminPermissionKey =>
                validSet.has(p) && p !== 'manage_ranks'
            )
          )
        );
      }
    }

    rank.updatedAt = new Date().toISOString();
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'rank.update',
      details: `Updated rank ${rank.nameAr} (${rank.id}) — permissions: ${rank.permissions.length}`,
      ip: getClientIp(req),
    });

    res.json({ rank });
  }
);

/**
 * Super Admin (or explicitly delegated Deputy for non-sovereign ranks):
 * Assign an existing user into an administrative rank + WhatsApp contact
 */
router.post(
  '/admin/officials',
  requireAuth,
  requirePermission('manage_officials'),
  (req: AuthenticatedRequest, res) => {
    const {
      userId,
      rankId,
      displayName,
      whatsappNumber,
      titleNote,
      showInSupport,
      isActive,
    } = req.body as {
      userId?: string;
      rankId?: string;
      displayName?: string;
      whatsappNumber?: string;
      titleNote?: string;
      showInSupport?: boolean;
      isActive?: boolean;
    };

    if (!userId?.trim() || !rankId?.trim() || !whatsappNumber?.trim()) {
      res.status(400).json({
        error: 'يرجى تحديد المستخدم والرتبة الإدارية ورقم الواتساب.',
      });
      return;
    }

    if (!isValidWhatsappNumber(whatsappNumber)) {
      res.status(400).json({
        error: 'رقم الواتساب غير صالح (يجب أن يكون من 8 إلى 16 رقماً).',
      });
      return;
    }

    const store = db.get();
    const callerIsSuperAdmin = isUserSuperAdmin(req.currentUser);
    const targetUser = store.users.find((u) => u.id === userId.trim());
    if (!targetUser) {
      res.status(404).json({ error: 'المستخدم المحدد غير موجود في قاعدة البيانات.' });
      return;
    }

    const targetRank = (store.adminRanks || []).find((r) => r.id === rankId.trim());
    if (!targetRank) {
      res.status(404).json({ error: 'الرتبة الإدارية غير موجودة.' });
      return;
    }

    // Prevent self-promotion / self-modification
    if (targetUser.id === req.currentUser!.id && !callerIsSuperAdmin) {
      res.status(403).json({
        error: 'لا يمكنك تعديل رتبتك أو ترقية نفسك.',
      });
      return;
    }

    // Only Super Admin can assign into Super Admin or Deputy ranks or promote non-admins
    if (!callerIsSuperAdmin) {
      if (
        targetRank.isSuperAdminRank ||
        targetRank.id === 'rank-super-admin' ||
        targetRank.id === 'rank-deputy-director'
      ) {
        res.status(403).json({
          error: 'تعيين أو تعديل منصب المدير العام أو نائبه محصور بالمدير العام فقط.',
        });
        return;
      }
      if (targetUser.isProtected || targetUser.adminRankId === 'rank-super-admin') {
        res.status(403).json({
          error: 'لا تملك صلاحية تعديل منصب المدير العام.',
        });
        return;
      }
    }

    if (
      (targetRank.isSuperAdminRank || targetRank.id === 'rank-super-admin') &&
      !callerIsSuperAdmin
    ) {
      res.status(403).json({
        error: 'لا يمكن لغير المدير العام تعيين منصب المدير العام.',
      });
      return;
    }

    if (!Array.isArray(store.adminOfficials)) {
      store.adminOfficials = [];
    }

    const now = new Date().toISOString();
    const cleanDisplayName = (displayName?.trim() || targetUser.name).slice(0, 80);
    const cleanWhatsapp = normalizeWhatsappNumber(whatsappNumber);

    // Sync user's single authoritative rank assignment & promote to admin role
    targetUser.role = 'admin';
    targetUser.adminRankId = targetRank.id;

    // Prevent duplicate official records for same user: update existing record if found
    const existingOfficial = store.adminOfficials.find(
      (o) => o.userId === targetUser.id
    );

    let savedOfficial: AdminOfficial;
    if (existingOfficial) {
      existingOfficial.rankId = targetRank.id;
      existingOfficial.displayName = cleanDisplayName;
      existingOfficial.whatsappNumber = cleanWhatsapp;
      existingOfficial.titleNote = titleNote?.trim().slice(0, 120) || undefined;
      existingOfficial.showInSupport =
        typeof showInSupport === 'boolean' ? showInSupport : true;
      existingOfficial.isActive = typeof isActive === 'boolean' ? isActive : true;
      existingOfficial.updatedAt = now;
      savedOfficial = existingOfficial;
    } else {
      savedOfficial = {
        id: `official-${crypto.randomUUID()}`,
        userId: targetUser.id,
        rankId: targetRank.id,
        displayName: cleanDisplayName,
        whatsappNumber: cleanWhatsapp,
        titleNote: titleNote?.trim().slice(0, 120) || undefined,
        showInSupport: typeof showInSupport === 'boolean' ? showInSupport : true,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        assignedBy: req.currentUser!.id,
        createdAt: now,
        updatedAt: now,
      };
      store.adminOfficials.unshift(savedOfficial);
    }

    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'official.assign',
      targetUserId: targetUser.id,
      targetUserName: targetUser.name,
      details: `Assigned to rank ${targetRank.nameAr} (${targetRank.id})`,
      ip: getClientIp(req),
    });

    res.status(201).json({ official: savedOfficial });
  }
);

/**
 * Update official details, visibility, active status, or transfer to another rank/department
 */
router.patch(
  '/admin/officials/:id',
  requireAuth,
  requirePermission('manage_officials'),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const {
      rankId,
      displayName,
      whatsappNumber,
      titleNote,
      showInSupport,
      isActive,
    } = req.body as {
      rankId?: string;
      displayName?: string;
      whatsappNumber?: string;
      titleNote?: string;
      showInSupport?: boolean;
      isActive?: boolean;
    };

    const store = db.get();
    const official = (store.adminOfficials || []).find((o) => o.id === id);
    if (!official) {
      res.status(404).json({ error: 'بيانات المسؤول غير موجودة.' });
      return;
    }

    const callerIsSuperAdmin = isUserSuperAdmin(req.currentUser);
    const targetUser = store.users.find((u) => u.id === official.userId);

    // Nobody can edit their own rank/permissions (Super Admin may update own support card display/WhatsApp only, never downgrade self)
    if (official.userId === req.currentUser!.id && !callerIsSuperAdmin) {
      res.status(403).json({
        error: 'لا يمكنك تعديل بيانات رتبتك أو صلاحياتك بنفسك.',
      });
      return;
    }

    if (!callerIsSuperAdmin) {
      if (
        official.rankId === 'rank-super-admin' ||
        official.rankId === 'rank-deputy-director' ||
        targetUser?.isProtected
      ) {
        res.status(403).json({
          error: 'لا تملك صلاحية تعديل بيانات المدير العام أو نائبه.',
        });
        return;
      }
    }

    if (typeof rankId === 'string' && rankId.trim() && rankId.trim() !== official.rankId) {
      const nextRank = (store.adminRanks || []).find((r) => r.id === rankId.trim());
      if (!nextRank) {
        res.status(404).json({ error: 'الرتبة المنقول إليها غير موجودة.' });
        return;
      }
      if (
        official.userId === req.currentUser!.id ||
        (!callerIsSuperAdmin &&
          (nextRank.isSuperAdminRank ||
            nextRank.id === 'rank-super-admin' ||
            nextRank.id === 'rank-deputy-director'))
      ) {
        res.status(403).json({
          error: 'لا تملك صلاحية النقل إلى هذه الرتبة.',
        });
        return;
      }
      if (targetUser?.isProtected && nextRank.id !== 'rank-super-admin') {
        res.status(403).json({
          error: 'لا يمكن خفض رتبة المدير المؤسس المحمي.',
        });
        return;
      }
      official.rankId = nextRank.id;
      if (targetUser) {
        targetUser.adminRankId = nextRank.id;
        targetUser.role = 'admin';
      }
    }

    if (typeof displayName === 'string' && displayName.trim().length >= 2) {
      official.displayName = displayName.trim().slice(0, 80);
    }

    if (typeof whatsappNumber === 'string' && whatsappNumber.trim()) {
      if (!isValidWhatsappNumber(whatsappNumber)) {
        res.status(400).json({ error: 'رقم الواتساب غير صالح.' });
        return;
      }
      official.whatsappNumber = normalizeWhatsappNumber(whatsappNumber);
    }

    if (typeof titleNote === 'string') {
      official.titleNote = titleNote.trim().slice(0, 120) || undefined;
    }

    if (typeof showInSupport === 'boolean') {
      official.showInSupport = showInSupport;
    }

    if (typeof isActive === 'boolean') {
      official.isActive = isActive;
    }

    official.updatedAt = new Date().toISOString();
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'official.update',
      targetUserId: official.userId,
      targetUserName: official.displayName,
      details: `Updated official in rank ${official.rankId} (active=${official.isActive}, support=${official.showInSupport})`,
      ip: getClientIp(req),
    });

    res.json({ official });
  }
);

/**
 * Remove official from administrative directory & revoke rank permissions
 */
router.delete(
  '/admin/officials/:id',
  requireAuth,
  requirePermission('manage_officials'),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const store = db.get();
    const official = (store.adminOfficials || []).find((o) => o.id === id);
    if (!official) {
      res.status(404).json({ error: 'المسؤول غير موجود.' });
      return;
    }

    const callerIsSuperAdmin = isUserSuperAdmin(req.currentUser);
    const targetUser = store.users.find((u) => u.id === official.userId);

    if (official.userId === req.currentUser!.id) {
      res.status(403).json({ error: 'لا يمكنك إزالة نفسك من الإدارة.' });
      return;
    }

    if (
      !callerIsSuperAdmin &&
      (official.rankId === 'rank-super-admin' ||
        official.rankId === 'rank-deputy-director' ||
        targetUser?.isProtected)
    ) {
      res.status(403).json({
        error: 'لا تملك صلاحية إزالة المدير العام أو نائبه.',
      });
      return;
    }

    if (targetUser?.isProtected && official.rankId === 'rank-super-admin') {
      res.status(403).json({
        error: 'لا يمكن إزالة رتبة المدير العام عن الحساب المؤسس المحمي.',
      });
      return;
    }

    store.adminOfficials = (store.adminOfficials || []).filter((o) => o.id !== id);
    if (targetUser && !targetUser.isProtected) {
      delete targetUser.adminRankId;
      targetUser.role = 'student';
    }
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'official.remove',
      targetUserId: official.userId,
      targetUserName: official.displayName,
      details: `Removed official from rank ${official.rankId}`,
      ip: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

export default router;
