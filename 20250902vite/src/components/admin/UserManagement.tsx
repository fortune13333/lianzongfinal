import React from 'react';
import { User } from '../../types';
import { PlusIcon, EditIcon, TrashIcon } from '../AIIcons';

interface UserManagementProps {
    allUsers: User[];
    currentUser: User;
    onAddUser: () => void;
    onEditUser: (user: User) => void;
    onDeleteUser: (user: User) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ allUsers, currentUser, onAddUser, onEditUser, onDeleteUser }) => {
    return (
        <div className="bg-bg-950/50 rounded-md">
            <div className="p-4 flex justify-end">
                <button onClick={onAddUser} className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md">
                    <PlusIcon /> 添加新用户
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-text-300">
                    <thead className="text-xs text-text-400 uppercase bg-bg-800/50">
                        <tr>
                            <th className="px-6 py-3">用户名</th>
                            <th className="px-6 py-3">角色</th>
                            <th className="px-6 py-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allUsers.map(user => (
                            <tr key={user.id} className="border-b border-bg-800 hover:bg-bg-800/50">
                                <td className="px-6 py-4 font-medium text-text-100">{user.username}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${user.role === 'admin' ? 'bg-primary-600/20 text-primary-300' : 'bg-bg-700 text-text-300'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button 
                                        onClick={() => onEditUser(user)} 
                                        className="p-1 text-primary-400 hover:text-primary-200 transition-colors" 
                                        title="编辑用户"
                                        aria-label={`编辑用户 ${user.username}`}
                                    >
                                        <EditIcon className="h-4 w-4" />
                                    </button>
                                    <button 
                                        onClick={() => onDeleteUser(user)} 
                                        className="p-1 text-red-500 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                                        title={user.id === currentUser.id ? "无法删除自己的账户" : "删除用户"}
                                        aria-label={`删除用户 ${user.username}`}
                                        disabled={user.id === currentUser.id}
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserManagement;