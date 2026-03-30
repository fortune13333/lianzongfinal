import { User } from '../types';

// The list of all possible atomic permissions
export const ATOMIC_PERMISSIONS = {
    DEVICE_CREATE: 'device:create',
    DEVICE_UPDATE: 'device:update',
    DEVICE_DELETE: 'device:delete',
    ROLLBACK_EXECUTE: 'rollback:execute',
    USER_MANAGE: 'user:manage',
    TEMPLATE_MANAGE: 'template:manage',
    POLICY_MANAGE: 'policy:manage',
    SYSTEM_RESET: 'system:reset',
    SYSTEM_SETTINGS: 'system:settings',
    STARTUP_WRITE: 'startup:write',
    SCRIPT_MANAGE: 'script:manage',
    SCRIPT_EXECUTE: 'script:execute',
    TASK_MANAGE: 'task:manage',
} as const;

// A type for the permission strings
export type AtomicPermission = typeof ATOMIC_PERMISSIONS[keyof typeof ATOMIC_PERMISSIONS];

// Permissions that grant access to parts of the Admin Panel
export const ADMIN_PANEL_PERMISSIONS: AtomicPermission[] = [
    ATOMIC_PERMISSIONS.USER_MANAGE,
    ATOMIC_PERMISSIONS.TEMPLATE_MANAGE,
    ATOMIC_PERMISSIONS.POLICY_MANAGE,
    ATOMIC_PERMISSIONS.SCRIPT_MANAGE,
    ATOMIC_PERMISSIONS.TASK_MANAGE,
];

/**
 * Checks if a user has a specific permission.
 * Admins always have all permissions.
 * Operators are checked against their `extra_permissions`.
 * @param user The user object to check.
 * @param permission The permission string to check for.
 * @returns `true` if the user has the permission, `false` otherwise.
 */
export const hasPermission = (user: User | null, permission: AtomicPermission): boolean => {
    if (!user) {
        return false;
    }
    if (user.role === 'admin') {
        return true;
    }
    if (user.role === 'operator' && user.extra_permissions) {
        const userPermissions = new Set(user.extra_permissions.split(','));
        return userPermissions.has(permission);
    }
    return false;
};

/**
 * Checks if a user should be able to see the Admin Panel link/button.
 * @param user The user object.
 * @returns `true` if the user is an admin or has any of the permissions that appear in the admin panel.
 */
export const canViewAdminPanel = (user: User | null): boolean => {
    if (!user) {
        return false;
    }
    if (user.role === 'admin') {
        return true;
    }
    // Operator can view if they have at least one of the relevant permissions
    return ADMIN_PANEL_PERMISSIONS.some(p => hasPermission(user, p));
};