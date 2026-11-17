import type { AdminPermissionKey, User } from '../types';

export function isSuperAdminUser(user: User | null | undefined): boolean {
  if (!user || user.role !== 'admin') return false;
  if (user.isSuperAdmin) return true;
  if (user.adminRankId === 'rank-super-admin') return true;
  if (user.isProtected && !user.adminRankId) return true;
  return false;
}

export function hasAdminPermission(
  user: User | null | undefined,
  permission: AdminPermissionKey
): boolean {
  if (!user || user.role !== 'admin') return false;
  if (isSuperAdminUser(user)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function hasAnyAdminPermission(
  user: User | null | undefined,
  permissions: AdminPermissionKey[]
): boolean {
  return permissions.some((p) => hasAdminPermission(user, p));
}
