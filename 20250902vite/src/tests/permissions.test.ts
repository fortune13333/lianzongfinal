/**
 * permissions.test.ts — 测试 hasPermission 和 canViewAdminPanel 工具函数
 */
import { describe, it, expect } from 'vitest';
import { hasPermission, canViewAdminPanel, ATOMIC_PERMISSIONS } from '../utils/permissions';
import type { User } from '../types';

// ---- 测试用用户 mock ----
const adminUser: User = { id: 1, username: 'admin', role: 'admin', extra_permissions: null };

const operatorFull: User = {
  id: 2,
  username: 'op_full',
  role: 'operator',
  extra_permissions: 'device:create,device:update,device:delete,rollback:execute,user:manage,template:manage,policy:manage,system:reset,system:settings,startup:write,script:manage,script:execute,task:manage',
};

const operatorLimited: User = {
  id: 3,
  username: 'op_limited',
  role: 'operator',
  extra_permissions: 'device:create',
};

const operatorNoPerms: User = {
  id: 4,
  username: 'op_none',
  role: 'operator',
  extra_permissions: null,
};

// ─────────────────────────────────────────────────────────
// hasPermission
// ─────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns false for null user', () => {
    expect(hasPermission(null, ATOMIC_PERMISSIONS.DEVICE_CREATE)).toBe(false);
  });

  it('admin always has every permission', () => {
    for (const perm of Object.values(ATOMIC_PERMISSIONS)) {
      expect(hasPermission(adminUser, perm)).toBe(true);
    }
  });

  it('operator with matching permission returns true', () => {
    expect(hasPermission(operatorLimited, ATOMIC_PERMISSIONS.DEVICE_CREATE)).toBe(true);
  });

  it('operator without matching permission returns false', () => {
    expect(hasPermission(operatorLimited, ATOMIC_PERMISSIONS.DEVICE_DELETE)).toBe(false);
    expect(hasPermission(operatorLimited, ATOMIC_PERMISSIONS.USER_MANAGE)).toBe(false);
  });

  it('operator with no extra_permissions returns false', () => {
    expect(hasPermission(operatorNoPerms, ATOMIC_PERMISSIONS.DEVICE_CREATE)).toBe(false);
  });

  it('operator with all permissions returns true for every perm', () => {
    for (const perm of Object.values(ATOMIC_PERMISSIONS)) {
      expect(hasPermission(operatorFull, perm)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────
// canViewAdminPanel
// ─────────────────────────────────────────────────────────

describe('canViewAdminPanel', () => {
  it('returns false for null user', () => {
    expect(canViewAdminPanel(null)).toBe(false);
  });

  it('admin can always view admin panel', () => {
    expect(canViewAdminPanel(adminUser)).toBe(true);
  });

  it('operator with user:manage can view admin panel', () => {
    const user: User = { ...operatorNoPerms, extra_permissions: 'user:manage' };
    expect(canViewAdminPanel(user)).toBe(true);
  });

  it('operator with template:manage can view admin panel', () => {
    const user: User = { ...operatorNoPerms, extra_permissions: 'template:manage' };
    expect(canViewAdminPanel(user)).toBe(true);
  });

  it('operator with only device:create cannot view admin panel', () => {
    expect(canViewAdminPanel(operatorLimited)).toBe(false);
  });

  it('operator with no permissions cannot view admin panel', () => {
    expect(canViewAdminPanel(operatorNoPerms)).toBe(false);
  });
});
