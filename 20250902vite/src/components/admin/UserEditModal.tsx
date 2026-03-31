import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';

interface UserEditModalProps {
  userToEdit: User | null;
  allUsers: User[];
  currentUser: User;
  agentApiUrl?: string;
  onClose: () => void;
  onSave: () => void;
}

// 与 src/utils/permissions.ts 中的 ATOMIC_PERMISSIONS 保持一致
// 分组展示，便于管理员理解每项权限的作用
const PERMISSION_LIST: { id: string; label: string; group: string }[] = [
  { id: 'device:view',      label: '查看设备 / 发现拓扑', group: '设备' },
  { id: 'device:create',    label: '创建设备',             group: '设备' },
  { id: 'device:update',    label: '更新设备',             group: '设备' },
  { id: 'device:delete',    label: '删除设备',             group: '设备' },
  { id: 'rollback:execute', label: '执行配置回滚',         group: '配置' },
  { id: 'startup:write',    label: '写入启动配置',         group: '配置' },
  { id: 'template:manage',  label: '管理配置模板',         group: '配置' },
  { id: 'script:manage',    label: '管理脚本库',           group: '脚本' },
  { id: 'script:execute',   label: '执行脚本',             group: '脚本' },
  { id: 'task:manage',      label: '管理定时任务',         group: '脚本' },
  { id: 'policy:manage',    label: '管理合规策略',         group: '管理' },
  { id: 'user:manage',      label: '管理用户',             group: '管理' },
  { id: 'system:settings',  label: '修改系统设置',         group: '管理' },
  { id: 'system:reset',     label: '重置 / 清除数据',      group: '管理' },
];

const PERMISSION_GROUPS = ['设备', '配置', '脚本', '管理'] as const;


const UserEditModal: React.FC<UserEditModalProps> = ({ userToEdit, allUsers, currentUser, agentApiUrl, onClose, onSave }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('operator');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const isEditing = !!userToEdit;

  useEffect(() => {
    if (isEditing) {
      setUsername(userToEdit.username);
      setRole(userToEdit.role);
      setPermissions(new Set((userToEdit.extra_permissions || '').split(',').filter(p => p)));
    } else {
      setUsername('');
      setRole('operator');
      setPermissions(new Set());
    }
    setPassword('');
    setConfirmPassword('');
  }, [userToEdit, isEditing]);

  const handlePermissionToggle = (permissionId: string) => {
    setPermissions(prev => {
        const newSet = new Set(prev);
        if (newSet.has(permissionId)) {
            newSet.delete(permissionId);
        } else {
            newSet.add(permissionId);
        }
        return newSet;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('用户名不能为空。');
      return;
    }

    if (isEditing) {
        const otherUsers = allUsers.filter(u => u.id !== userToEdit.id);
        if (otherUsers.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
            toast.error('该用户名已被其他用户使用。');
            return;
        }
    } else {
        if (allUsers.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
            toast.error('该用户名已存在。');
            return;
        }
    }

    if (!isEditing && !password) {
        toast.error('新增用户时必须设置密码。');
        return;
    }
    
    if (password && password !== confirmPassword) {
      toast.error('两次输入的密码不匹配。');
      return;
    }

    const toastId = toast.loading(isEditing ? '正在更新用户...' : '正在创建用户...');
    
    const payload = {
        username: username.trim(),
        role,
        ...(password && { password }),
        extra_permissions: role === 'operator' ? Array.from(permissions).join(',') : '',
    };
    
    try {
        const url = isEditing
            ? createApiUrl(agentApiUrl!, `/api/users/${userToEdit.id}`)
            : createApiUrl(agentApiUrl!, '/api/users');
        
        const response = await apiFetch(url, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '代理返回了未知错误。' }));
            throw new Error(errorData.detail);
        }

        toast.success(isEditing ? '用户更新成功！' : '用户创建成功！', { id: toastId });
        onSave();

    } catch (error) {
        const msg = error instanceof Error ? error.message : '未知错误。';
        toast.error(`操作失败: ${msg}`, { id: toastId });
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-text-100">{isEditing ? '编辑用户' : '添加新用户'}</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-text-300 mb-2">用户名</label>
              <input 
                type="text" 
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
             <div>
              <label htmlFor="role" className="block text-sm font-medium text-text-300 mb-2">角色</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'operator')}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="operator">操作员 (Operator)</option>
                <option value="admin">管理员 (Admin)</option>
              </select>
            </div>
             {role === 'operator' && (
                <div>
                    <label className="block text-sm font-medium text-text-300 mb-2">额外权限</label>
                    <div className="max-h-64 overflow-y-auto bg-bg-950 border border-bg-700 rounded-md p-3 space-y-3">
                        {PERMISSION_GROUPS.map(group => (
                            <div key={group}>
                                <div className="text-xs font-semibold text-text-500 uppercase tracking-wider mb-1.5 pb-1 border-b border-bg-800">{group}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {PERMISSION_LIST.filter(p => p.group === group).map(p => (
                                        <div key={p.id} className="flex items-center">
                                            <input
                                                type="checkbox"
                                                id={`perm-${p.id}`}
                                                checked={permissions.has(p.id)}
                                                onChange={() => handlePermissionToggle(p.id)}
                                                className="h-4 w-4 rounded bg-bg-800 border-bg-600 text-primary-600 focus:ring-primary-500"
                                            />
                                            <label htmlFor={`perm-${p.id}`} className="ml-2 text-sm text-text-200 cursor-pointer select-none">{p.label}</label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-300 mb-2">
                新密码 {isEditing && '(留空则不修改)'}
                </label>
              <input 
                type="password" 
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="设置一个新密码"
              />
            </div>
             <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-300 mb-2">确认新密码</label>
              <input 
                type="password" 
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="再次输入新密码"
              />
            </div>
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end items-center gap-4">
              <button 
                  type="button"
                  onClick={onClose} 
                  className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors"
              >
                  取消
              </button>
              <button 
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
              >
                  {isEditing ? '保存更改' : '创建用户'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserEditModal;