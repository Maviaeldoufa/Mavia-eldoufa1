import crypto from 'crypto';
import { Router } from 'express';
import {
  requireAnyPermission,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
} from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import {
  ADMIN_PERMISSIONS_CATALOG,
  ALL_ADMIN_PERMISSIONS,
  db,
  hashPassword,
  isUserSuperAdmin,
  recordAdminAudit,
} from '../db.ts';
import type {
  AdminOfficial,
  AdminPermissionKey,
  AdminRankColor,
  AdminRankIcon,
  SupportTeamMember,
} from '../types.ts';

const MAX_SUPPORT_TEAM_SIZE = 7;

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
 * Student Support Directory (Zero raw phone numbers leaked; provides direct WhatsApp redirect links when configured)
 */
router.get('/support/directory', requireAuth, (_req: AuthenticatedRequest, res) => {
  const store = db.get();
  const ranks = [...(store.adminRanks || [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
  const officials = store.adminOfficials || [];

  const leaderOfficial = officials.find(
    (o) => o.rankId === 'rank-super-admin' && o.isActive
  );
  const founderUser = store.users.find(
    (u) => u.isProtected && u.role === 'admin'
  );
  const rawLeaderWhatsapp =
    (leaderOfficial && isValidWhatsappNumber(leaderOfficial.whatsappNumber)
      ? leaderOfficial.whatsappNumber
      : store.platformConfig?.whatsappNumber) || '';
  const leaderHasWhatsapp = isValidWhatsappNumber(rawLeaderWhatsapp);

  const leader = {
    id: 'platform-leader',
    displayName: leaderOfficial?.displayName || founderUser?.name || 'ليدر المنصة',
    titleAr: 'ليدر المنصة',
    titleEn: 'Platform Leader',
    urgencyNoteAr: 'للضرورة',
    urgencyNoteEn: 'Urgent Only',
    hasWhatsapp: leaderHasWhatsapp,
    whatsappUrl: leaderHasWhatsapp ? formatWhatsappLink(rawLeaderWhatsapp) : undefined,
  };

  const publicSupportTeam = [...(store.supportTeam || [])]
    .filter((m) => m.isActive)
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .slice(0, MAX_SUPPORT_TEAM_SIZE)
    .map((m) => {
      const validWa = isValidWhatsappNumber(m.whatsappNumber);
      return {
        id: m.id,
        slotNumber: m.slotNumber,
        userId: m.userId,
        displayName: m.displayName,
        specialty: m.specialty || undefined,
        hasWhatsapp: validWa,
        whatsappUrl: validWa ? formatWhatsappLink(m.whatsappNumber) : undefined,
      };
    });

  const publicRanks = ranks
    .filter((rank) => rank.isVisibleInSupport !== false)
    .map((rank) => {
      const activeOfficials = officials
        .filter((o) => o.rankId === rank.id && o.isActive && o.showInSupport)
        .map((o) => {
          const validWa = isValidWhatsappNumber(o.whatsappNumber);
          return {
            id: o.id,
            rankId: o.rankId,
            displayName: o.displayName,
            titleNote: o.titleNote || undefined,
            hasWhatsapp: validWa,
            whatsappUrl: validWa ? formatWhatsappLink(o.whatsappNumber) : undefined,
          };
        });

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

  res.json({ leader, supportTeam: publicSupportTeam, ranks: publicRanks });
});

/**
 * Server-verified contact link retrieval for Platform Leader (Urgent Only / للضرورة)
 */
router.post('/support/leader/whatsapp-link', requireAuth, (_req: AuthenticatedRequest, res) => {
  const store = db.get();
  const leaderOfficial = (store.adminOfficials || []).find(
    (o) => o.rankId === 'rank-super-admin' && o.isActive
  );
  const rawWhatsapp =
    (leaderOfficial && isValidWhatsappNumber(leaderOfficial.whatsappNumber)
      ? leaderOfficial.whatsappNumber
      : store.platformConfig?.whatsappNumber) || '';

  if (!isValidWhatsappNumber(rawWhatsapp)) {
    res.status(400).json({ error: 'لم يتم إضافة رقم واتساب لليدر المنصة بعد.' });
    return;
  }

  res.json({
    whatsappUrl: formatWhatsappLink(rawWhatsapp),
    displayName: leaderOfficial?.displayName || 'ليدر المنصة',
    urgencyNote: 'للضرورة',
  });
});

/**
 * Server-verified contact link retrieval for one of the 7 Admin-chosen Support Team members
 */
router.post(
  '/support/team/:id/whatsapp-link',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const store = db.get();
    const member = (store.supportTeam || []).find((m) => m.id === id);

    if (!member || !member.isActive) {
      res.status(404).json({ error: 'عضو الدعم الفني غير متاح حالياً.' });
      return;
    }

    if (!isValidWhatsappNumber(member.whatsappNumber)) {
      res.status(400).json({ error: 'لم يتم إضافة رقم واتساب لهذا العضو بعد.' });
      return;
    }

    res.json({
      whatsappUrl: formatWhatsappLink(member.whatsappNumber),
      displayName: member.displayName,
      specialty: member.specialty,
      slotNumber: member.slotNumber,
    });
  }
);

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
  requireAnyPermission('manage_officials', 'manage_support'),
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

    const supportTeam = [...(store.supportTeam || [])].sort(
      (a, b) => a.slotNumber - b.slotNumber
    );

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
      supportTeam,
      maxSupportTeamSize: MAX_SUPPORT_TEAM_SIZE,
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

    if (!userId?.trim() || !rankId?.trim()) {
      res.status(400).json({
        error: 'يرجى تحديد المستخدم والرتبة الإدارية.',
      });
      return;
    }

    const hasRawWhatsapp = Boolean(whatsappNumber?.trim());
    if (hasRawWhatsapp && !isValidWhatsappNumber(whatsappNumber!)) {
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
    const cleanWhatsapp = hasRawWhatsapp ? normalizeWhatsappNumber(whatsappNumber!) : '';

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

/**
 * Admin Selection: Assign or update one of the 7 Technical Support Team members (slots 1..7)
 */
router.post(
  '/admin/support-team',
  requireAuth,
  requireAnyPermission('manage_officials', 'manage_support'),
  (req: AuthenticatedRequest, res) => {
    const {
      userId,
      slotNumber,
      displayName,
      specialty,
      whatsappNumber,
      isActive,
    } = req.body as {
      userId?: string;
      slotNumber?: number;
      displayName?: string;
      specialty?: string;
      whatsappNumber?: string;
      isActive?: boolean;
    };

    if (!userId?.trim()) {
      res.status(400).json({
        error: 'يرجى اختيار العضو أولاً.',
      });
      return;
    }

    const hasRawWhatsapp = Boolean(whatsappNumber?.trim());
    if (hasRawWhatsapp && !isValidWhatsappNumber(whatsappNumber!)) {
      res.status(400).json({
        error: 'رقم الواتساب غير صالح (يجب أن يكون من 8 إلى 16 رقماً).',
      });
      return;
    }

    const store = db.get();
    if (!Array.isArray(store.supportTeam)) {
      store.supportTeam = [];
    }

    const targetUser = store.users.find((u) => u.id === userId.trim());
    if (!targetUser) {
      res.status(404).json({ error: 'المستخدم المحدد غير موجود في قاعدة البيانات.' });
      return;
    }

    let resolvedSlot = slotNumber !== undefined ? Number(slotNumber) : 0;
    if (resolvedSlot !== 0) {
      if (!Number.isInteger(resolvedSlot) || resolvedSlot < 1 || resolvedSlot > MAX_SUPPORT_TEAM_SIZE) {
        res.status(400).json({
          error: `رقم المقعد يجب أن يكون بين 1 و ${MAX_SUPPORT_TEAM_SIZE}.`,
        });
        return;
      }
    } else {
      const existingForUser = store.supportTeam.find((m) => m.userId === targetUser.id);
      if (existingForUser) {
        resolvedSlot = existingForUser.slotNumber;
      } else {
        const usedSlots = new Set(store.supportTeam.map((m) => m.slotNumber));
        for (let i = 1; i <= MAX_SUPPORT_TEAM_SIZE; i++) {
          if (!usedSlots.has(i)) {
            resolvedSlot = i;
            break;
          }
        }
        if (resolvedSlot === 0) {
          res.status(400).json({
            error: `فريق الدعم الفني مكتمل (${MAX_SUPPORT_TEAM_SIZE} أعضاء كحد أقصى). حدد رقم مقعد لاستبداله أو أزل أحد الأعضاء أولاً.`,
          });
          return;
        }
      }
    }

    const now = new Date().toISOString();
    const cleanName = (displayName?.trim() || targetUser.name).slice(0, 80);
    const cleanSpecialty = specialty?.trim().slice(0, 120) || undefined;
    const cleanWhatsapp = hasRawWhatsapp ? normalizeWhatsappNumber(whatsappNumber!) : '';

    // Ensure the same user does not occupy two different slots and handle slot replacement cleanly
    store.supportTeam = store.supportTeam.filter(
      (m) => m.slotNumber !== resolvedSlot && m.userId !== targetUser.id
    );

    const savedMember: SupportTeamMember = {
      id: `support-${crypto.randomUUID()}`,
      slotNumber: resolvedSlot,
      userId: targetUser.id,
      displayName: cleanName,
      specialty: cleanSpecialty,
      whatsappNumber: cleanWhatsapp,
      isActive: typeof isActive === 'boolean' ? isActive : true,
      assignedBy: req.currentUser!.id,
      createdAt: now,
      updatedAt: now,
    };

    store.supportTeam.push(savedMember);
    store.supportTeam.sort((a, b) => a.slotNumber - b.slotNumber);
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'support_team.assign',
      targetUserId: targetUser.id,
      targetUserName: cleanName,
      details: `Assigned to Support Team Slot #${resolvedSlot}`,
      ip: getClientIp(req),
    });

    res.status(201).json({ member: savedMember });
  }
);

router.patch(
  '/admin/support-team/:id',
  requireAuth,
  requireAnyPermission('manage_officials', 'manage_support'),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { slotNumber, displayName, specialty, whatsappNumber, isActive } = req.body as {
      slotNumber?: number;
      displayName?: string;
      specialty?: string;
      whatsappNumber?: string;
      isActive?: boolean;
    };

    const store = db.get();
    if (!Array.isArray(store.supportTeam)) {
      store.supportTeam = [];
    }

    const member = store.supportTeam.find((m) => m.id === id);
    if (!member) {
      res.status(404).json({ error: 'عضو الدعم الفني غير موجود.' });
      return;
    }

    if (slotNumber !== undefined) {
      const nextSlot = Number(slotNumber);
      if (!Number.isInteger(nextSlot) || nextSlot < 1 || nextSlot > MAX_SUPPORT_TEAM_SIZE) {
        res.status(400).json({ error: `رقم المقعد يجب أن يكون بين 1 و ${MAX_SUPPORT_TEAM_SIZE}.` });
        return;
      }
      if (nextSlot !== member.slotNumber) {
        const occupant = store.supportTeam.find(
          (m) => m.id !== member.id && m.slotNumber === nextSlot
        );
        if (occupant) {
          occupant.slotNumber = member.slotNumber;
          occupant.updatedAt = new Date().toISOString();
        }
        member.slotNumber = nextSlot;
      }
    }

    if (typeof displayName === 'string' && displayName.trim().length >= 2) {
      member.displayName = displayName.trim().slice(0, 80);
    }

    if (typeof specialty === 'string') {
      member.specialty = specialty.trim().slice(0, 120) || undefined;
    }

    if (typeof whatsappNumber === 'string' && whatsappNumber.trim()) {
      if (!isValidWhatsappNumber(whatsappNumber)) {
        res.status(400).json({ error: 'رقم الواتساب غير صالح.' });
        return;
      }
      member.whatsappNumber = normalizeWhatsappNumber(whatsappNumber);
    }

    if (typeof isActive === 'boolean') {
      member.isActive = isActive;
    }

    member.updatedAt = new Date().toISOString();
    store.supportTeam.sort((a, b) => a.slotNumber - b.slotNumber);
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'support_team.update',
      targetUserId: member.userId,
      targetUserName: member.displayName,
      details: `Updated Support Team Slot #${member.slotNumber} (active=${member.isActive})`,
      ip: getClientIp(req),
    });

    res.json({ member });
  }
);

router.delete(
  '/admin/support-team/:id',
  requireAuth,
  requireAnyPermission('manage_officials', 'manage_support'),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const store = db.get();
    const member = (store.supportTeam || []).find((m) => m.id === id);
    if (!member) {
      res.status(404).json({ error: 'عضو الدعم الفني غير موجود.' });
      return;
    }

    store.supportTeam = (store.supportTeam || []).filter((m) => m.id !== id);
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'support_team.remove',
      targetUserId: member.userId,
      targetUserName: member.displayName,
      details: `Removed from Support Team Slot #${member.slotNumber}`,
      ip: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

/**
 * Admin: Add or update Platform Leader WhatsApp number directly
 */
router.patch(
  '/admin/support/leader-whatsapp',
  requireAuth,
  requireAnyPermission('manage_officials', 'manage_support'),
  (req: AuthenticatedRequest, res) => {
    const { whatsappNumber } = req.body as { whatsappNumber?: string };
    if (!whatsappNumber?.trim() || !isValidWhatsappNumber(whatsappNumber)) {
      res.status(400).json({
        error: 'رقم الواتساب غير صالح (يجب أن يكون من 8 إلى 16 رقماً).',
      });
      return;
    }

    const cleanWhatsapp = normalizeWhatsappNumber(whatsappNumber);
    const store = db.get();
    if (!store.platformConfig) {
      store.platformConfig = {
        whatsappNumber: cleanWhatsapp,
        telegramUrl: 'https://t.me/+201159637247',
      };
    } else {
      store.platformConfig.whatsappNumber = cleanWhatsapp;
    }

    const leaderOfficial = (store.adminOfficials || []).find(
      (o) => o.rankId === 'rank-super-admin' && o.isActive
    );
    if (leaderOfficial) {
      leaderOfficial.whatsappNumber = cleanWhatsapp;
      leaderOfficial.updatedAt = new Date().toISOString();
    }

    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'official.update',
      targetUserId: leaderOfficial?.userId,
      targetUserName: leaderOfficial?.displayName || 'ليدر المنصة',
      details: 'Updated Platform Leader WhatsApp number',
      ip: getClientIp(req),
    });

    res.json({
      ok: true,
      hasWhatsapp: true,
      whatsappUrl: formatWhatsappLink(cleanWhatsapp),
    });
  }
);

/**
 * Super Admin ONLY: Get configuration status of the custom Admin Activation Password (never exposes secret/hash)
 */
router.get(
  '/admin/activation-password',
  requireAuth,
  requireSuperAdmin,
  (_req: AuthenticatedRequest, res) => {
    const store = db.get();
    const cfg = store.platformConfig;
    res.json({
      configured: Boolean(cfg?.adminActivationPasswordHash),
      updatedAt: cfg?.adminActivationPasswordUpdatedAt || null,
      defaultRankId: cfg?.adminActivationDefaultRankId || 'rank-deputy-director',
    });
  }
);

/**
 * Super Admin ONLY: Write, update, or clear the custom Admin Activation Password and choose its target rank
 */
router.put(
  '/admin/activation-password',
  requireAuth,
  requireSuperAdmin,
  (req: AuthenticatedRequest, res) => {
    const { password, defaultRankId, clear } = req.body as {
      password?: string;
      defaultRankId?: string;
      clear?: boolean;
    };

    const store = db.get();
    if (!store.platformConfig) {
      store.platformConfig = {
        whatsappNumber: '01159637247',
        telegramUrl: 'https://t.me/+201159637247',
      };
    }

    if (typeof defaultRankId === 'string' && defaultRankId.trim()) {
      const targetRank = (store.adminRanks || []).find((r) => r.id === defaultRankId.trim());
      if (!targetRank || targetRank.isSuperAdminRank || targetRank.id === 'rank-super-admin') {
        res.status(400).json({
          error: 'يرجى اختيار رتبة إدارية صالحة للتفعيل (بخلاف رتبة المدير العام المؤسس).',
        });
        return;
      }
      store.platformConfig.adminActivationDefaultRankId = targetRank.id;
    } else if (!store.platformConfig.adminActivationDefaultRankId) {
      store.platformConfig.adminActivationDefaultRankId = 'rank-deputy-director';
    }

    if (clear === true) {
      delete store.platformConfig.adminActivationPasswordHash;
      store.platformConfig.adminActivationPasswordUpdatedAt = new Date().toISOString();
    } else {
      const cleanPass = typeof password === 'string' ? password.trim() : '';
      if (!cleanPass && !store.platformConfig.adminActivationPasswordHash) {
        res.status(400).json({
          error: 'يرجى كتابة كلمة سر تفعيل الأدمن (4 أحرف على الأقل).',
        });
        return;
      }
      if (cleanPass) {
        if (cleanPass.length < 4 || cleanPass.length > 120) {
          res.status(400).json({
            error: 'كلمة سر تفعيل الأدمن يجب أن تكون بين 4 و120 حرفاً.',
          });
          return;
        }
        store.platformConfig.adminActivationPasswordHash = hashPassword(cleanPass);
        store.platformConfig.adminActivationPasswordUpdatedAt = new Date().toISOString();
      }
    }

    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'admin.activation_password_update',
      details: clear
        ? 'Cleared custom admin activation password'
        : `Updated custom admin activation password / rank (${store.platformConfig.adminActivationDefaultRankId})`,
      ip: getClientIp(req),
    });

    res.json({
      configured: Boolean(store.platformConfig.adminActivationPasswordHash),
      updatedAt: store.platformConfig.adminActivationPasswordUpdatedAt || null,
      defaultRankId: store.platformConfig.adminActivationDefaultRankId || 'rank-deputy-director',
    });
  }
);

export default router;
