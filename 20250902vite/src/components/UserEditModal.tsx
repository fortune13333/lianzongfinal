import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';

interface UserEditModalProps {
  userToEdit: User | null;
  allUsers: User[];
  currentUser: User;
  agentApiUrl?: string;
  onClose: () => void;
  onSave: () => void;
}

const UserEditModal: React.FC<UserEditModalProps> = ({ userToEdit, allUsers, currentUser, agentApiUrl, onClose, onSave }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('operator');
  const isEditing = !!userToEdit;

  useEffect(() => {
    if (isEditing) {
      setUsername(userToEdit.username);
      setRole(userToEdit.role);
    }
  }, [userToEdit, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('用户名不能为空。');
      return;
    }

    if (isEditing) {
        // In edit mode, if username is changed, check if it conflicts with others
        const otherUsers = allUsers.filter(u => u.id !== userToEdit.id);
        if (otherUsers.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
            toast.error('该用户名已被其他用户使用。');
            return;
        }
    } else {
        // In add mode, check if username conflicts with any existing user
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
        ...(password && { password }), // Only include password if it's set
    };
    
    try {
        const url = isEditing
            ? createApiUrl(agentApiUrl!, `/api/users/${userToEdit.id}`)
            : createApiUrl(agentApiUrl!, '/api/users');
        
        const response = await fetch(url, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Actor-Username': currentUser.username,
            },
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
        className="bg-zinc-900 rounded-lg shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">{isEditing ? '编辑用户' : '添加新用户'}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-2">用户名</label>
              <input 
                type="text" 
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-zinc-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                required
              />
            </div>
             <div>
              <label htmlFor="role" className="block text-sm font-medium text-zinc-300 mb-2">角色</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'operator')}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-zinc-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              >
                <option value="operator">操作员 (Operator)</option>
                <option value="admin">管理员 (Admin)</option>
              </select>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-2">
                新密码 {isEditing && '(留空则不修改)'}
                </label>
              <input 
                type="password" 
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-zinc-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                placeholder="设置一个新密码"
              />
            </div>
             <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300 mb-2">确认新密码</label>
              <input 
                type="password" 
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-2 text-zinc-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                placeholder="再次输入新密码"
              />
            </div>
          </div>

          <div className="p-4 border-t border-zinc-700 flex justify-end items-center gap-4">
              <button 
                  type="button"
                  onClick={onClose} 
                  className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded-md transition-colors"
              >
                  取消
              </button>
              <button 
                  type="submit"
                  className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
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