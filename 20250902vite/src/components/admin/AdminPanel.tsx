import React, { useState, useMemo, useEffect } from 'react';
import { User, ConfigTemplate, Policy, Script, ScheduledTask } from '../../types';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import { toast } from 'react-hot-toast';
import { PlusIcon, DocumentDuplicateIcon } from '../AIIcons';
import UserEditModal from './UserEditModal';
import TemplateEditModal from '../TemplateEditModal';
import PolicyEditModal from '../PolicyEditModal';
import UserManagement from './UserManagement';
import ConfirmationModal from '../ConfirmationModal';
import DeploymentHistory from './DeploymentHistory';
import WriteTokenManagement from './WriteTokenManagement';
import ScriptEditModal from '../ScriptEditModal';
import ScriptExecuteModal from '../ScriptExecuteModal';
import ScheduledTaskModal from './ScheduledTaskModal';
import { useStore } from '../../store/useStore';
import { hasPermission, ATOMIC_PERMISSIONS } from '../../utils/permissions';


type DeletionTarget = 
    | { type: 'user'; item: User }
    | { type: 'template'; item: ConfigTemplate }
    | { type: 'policy'; item: Policy };

type AdminTab = 'audit' | 'users' | 'templates' | 'policies' | 'deployments' | 'tokens' | 'scripts' | 'scheduledTasks';

interface AdminPanelProps {
    // All props removed and replaced by useStore hook
}

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${active ? 'bg-primary-600 text-white' : 'text-text-300 hover:bg-bg-800'}`}
    >
        {children}
    </button>
);

const AdminPanel: React.FC<AdminPanelProps> = () => {
    const {
        currentUser, allUsers, auditLog, templates, policies,
        deploymentHistory, agentApiUrl, fetchData, writeTokens, scripts, scheduledTasks, devices,
        deleteScript, deleteScheduledTask,
    } = useStore(state => ({
        currentUser: state.currentUser!,
        allUsers: state.allUsers,
        auditLog: state.auditLog,
        templates: state.templates,
        policies: state.policies,
        deploymentHistory: state.deploymentHistory,
        agentApiUrl: state.settings.agentApiUrl,
        fetchData: state.fetchData,
        writeTokens: state.writeTokens,
        scripts: state.scripts,
        scheduledTasks: state.scheduledTasks,
        devices: state.devices,
        deleteScript: state.deleteScript,
        deleteScheduledTask: state.deleteScheduledTask,
    }));

    const canManageUsers = hasPermission(currentUser, ATOMIC_PERMISSIONS.USER_MANAGE);
    const canManageTemplates = hasPermission(currentUser, ATOMIC_PERMISSIONS.TEMPLATE_MANAGE);
    const canManagePolicies = hasPermission(currentUser, ATOMIC_PERMISSIONS.POLICY_MANAGE);
    const canManageScripts = hasPermission(currentUser, ATOMIC_PERMISSIONS.SCRIPT_MANAGE);
    const canManageTasks = hasPermission(currentUser, ATOMIC_PERMISSIONS.TASK_MANAGE);

    const availableTabs = useMemo(() => {
        const tabs: AdminTab[] = [];
        tabs.push('audit');
        if (canManageUsers) tabs.push('users');
        if (canManageTemplates) tabs.push('templates');
        if (canManagePolicies) tabs.push('policies');
        tabs.push('deployments');
        if (canManageUsers) tabs.push('tokens');
        if (canManageScripts) tabs.push('scripts');
        if (canManageTasks) tabs.push('scheduledTasks');
        return tabs;
    }, [canManageUsers, canManageTemplates, canManagePolicies, canManageScripts, canManageTasks]);

    const [activeTab, setActiveTab] = useState<AdminTab>(availableTabs[0]);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [templateToEdit, setTemplateToEdit] = useState<ConfigTemplate | null>(null);
    const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
    const [policyToEdit, setPolicyToEdit] = useState<Policy | null>(null);
    const [logFilter, setLogFilter] = useState('');
    const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(null);
    // Script management state
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    const [scriptToEdit, setScriptToEdit] = useState<Script | null>(null);
    const [executeScript, setExecuteScript] = useState<Script | null>(null);
    // Scheduled task state
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<ScheduledTask | null>(null);
    
    useEffect(() => {
        if (!availableTabs.includes(activeTab)) {
            setActiveTab(availableTabs[0] || 'audit');
        }
    }, [availableTabs, activeTab]);

    const handleDelete = async (endpoint: string, successMsg: string, errorMsg: string) => {
        const toastId = toast.loading('正在删除...');
        try {
            const url = createApiUrl(agentApiUrl!, endpoint);
            const response = await apiFetch(url, { method: 'DELETE' });
            if (!response.ok) throw new Error('代理返回错误。');
            toast.success(successMsg, { id: toastId });
            fetchData(true);
        } catch (error) {
            const msg = error instanceof Error ? error.message : '未知错误。';
            toast.error(`${errorMsg}: ${msg}`, { id: toastId });
        }
    };

    const handleDeleteUser = (user: User) => {
        if (user.id === currentUser.id) { toast.error("不能删除自己的账户。"); return; }
        setDeletionTarget({ type: 'user', item: user });
    };
    
    const handleDeleteTemplate = (template: ConfigTemplate) => {
        setDeletionTarget({ type: 'template', item: template });
    };

    const handleDeletePolicy = (policy: Policy) => {
        setDeletionTarget({ type: 'policy', item: policy });
    };

    const executeDelete = () => {
        if (!deletionTarget) return;

        const { type, item } = deletionTarget;
        switch (type) {
            case 'user':
                handleDelete(`/api/users/${item.id}`, '用户已删除。', '删除用户失败');
                break;
            case 'template':
                handleDelete(`/api/templates/${item.id}`, '模板已删除。', '删除模板失败');
                break;
            case 'policy':
                handleDelete(`/api/policies/${item.id}`, '策略已删除。', '删除策略失败');
                break;
        }
        setDeletionTarget(null);
    };

    const handleTogglePolicy = async (policy: Policy) => {
        const updatedPolicy = { ...policy, enabled: !policy.enabled };
        const toastId = toast.loading('正在更新策略状态...');
        try {
            const url = createApiUrl(agentApiUrl!, `/api/policies/${policy.id}`);
            const response = await apiFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedPolicy) });
            if (!response.ok) throw new Error('代理返回错误。');
            toast.success('策略状态已更新。', { id: toastId });
            fetchData(true);
        } catch(error) {
             const msg = error instanceof Error ? error.message : '未知错误。';
            toast.error(`更新失败: ${msg}`, { id: toastId });
        }
    };

    const filteredLogs = useMemo(() => {
        if (!logFilter) return auditLog;
        const lowercasedFilter = logFilter.toLowerCase();
        return auditLog.filter(log => log.action.toLowerCase().includes(lowercasedFilter) || log.username.toLowerCase().includes(lowercasedFilter));
    }, [auditLog, logFilter]);
    
    const getDeletionModalContent = () => {
        if (!deletionTarget) return { title: '', content: <></> };
        const { type, item } = deletionTarget;
        const name = 'username' in item ? item.username : item.name;
        const typeName = { user: '用户', template: '模板', policy: '策略' }[type];
        
        return {
            title: `确认删除${typeName}`,
            content: <p>您确定要永久删除{typeName} <strong>"{name}"</strong> 吗？此操作不可撤销。</p>
        };
    };

    return (
        <div className="mt-12">
            <div className="flex justify-between items-center mb-6 border-b-2 border-bg-800 pb-2">
                <h2 className="text-3xl font-bold text-text-100">管理中心</h2>
            </div>
            <div className="bg-bg-900 p-6 rounded-lg shadow-xl">
                <div className="flex border-b border-bg-700 mb-4 space-x-2">
                    {availableTabs.includes('audit') && <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')}>审计日志</TabButton>}
                    {availableTabs.includes('users') && <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')}>用户管理</TabButton>}
                    {availableTabs.includes('templates') && <TabButton active={activeTab === 'templates'} onClick={() => setActiveTab('templates')}>配置模板</TabButton>}
                    {availableTabs.includes('policies') && <TabButton active={activeTab === 'policies'} onClick={() => setActiveTab('policies')}>合规策略</TabButton>}
                    {availableTabs.includes('deployments') && <TabButton active={activeTab === 'deployments'} onClick={() => setActiveTab('deployments')}>部署历史</TabButton>}
                    {availableTabs.includes('tokens') && <TabButton active={activeTab === 'tokens'} onClick={() => setActiveTab('tokens')}>写入令牌</TabButton>}
                    {availableTabs.includes('scripts') && <TabButton active={activeTab === 'scripts'} onClick={() => setActiveTab('scripts')}>脚本库</TabButton>}
                    {availableTabs.includes('scheduledTasks') && <TabButton active={activeTab === 'scheduledTasks'} onClick={() => setActiveTab('scheduledTasks')}>定时任务</TabButton>}
                </div>

                {activeTab === 'policies' && canManagePolicies && (
                    <div className="bg-bg-950/50 rounded-md">
                        <div className="p-4 flex justify-end">
                             <button onClick={() => { setPolicyToEdit(null); setIsPolicyModalOpen(true); }} className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md">
                                <PlusIcon /> 添加新策略
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-text-300">
                                <thead className="text-xs text-text-400 uppercase bg-bg-800/50">
                                    <tr>
                                        <th className="px-6 py-3">状态</th>
                                        <th className="px-6 py-3">策略名称</th>
                                        <th className="px-6 py-3">严重性</th>
                                        <th className="px-6 py-3 text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {policies.map(policy => (
                                        <tr key={policy.id} className="border-b border-bg-800 hover:bg-bg-800/50">
                                            <td className="px-6 py-4">
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" checked={policy.enabled} onChange={() => handleTogglePolicy(policy)} className="sr-only peer" />
                                                    <div className="w-11 h-6 bg-bg-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                                </label>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-text-100">{policy.name}</td>
                                            <td className="px-6 py-4 capitalize">{policy.severity}</td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => { setPolicyToEdit(policy); setIsPolicyModalOpen(true); }} className="font-medium text-primary-400 hover:underline">编辑</button>
                                                <button onClick={() => handleDeletePolicy(policy)} className="font-medium text-red-500 hover:underline">删除</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                
                {activeTab === 'templates' && canManageTemplates && (
                    <div className="bg-bg-950/50 rounded-md">
                         <div className="p-4 flex justify-end">
                            <button onClick={() => { setTemplateToEdit(null); setIsTemplateModalOpen(true); }} className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md">
                                <PlusIcon /> 添加新模板
                            </button>
                        </div>
                         <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-text-300">
                                <thead className="text-xs text-text-400 uppercase bg-bg-800/50"><tr><th className="px-6 py-3">模板名称</th><th className="px-6 py-3 text-right">操作</th></tr></thead>
                                <tbody>
                                    {templates.map(template => (
                                        <tr key={template.id} className="border-b border-bg-800 hover:bg-bg-800/50">
                                            <td className="px-6 py-4 font-medium text-text-100 flex items-center gap-2"><DocumentDuplicateIcon className="h-4 w-4 text-text-400" />{template.name}</td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => { setTemplateToEdit(template); setIsTemplateModalOpen(true); }} className="font-medium text-primary-400 hover:underline">编辑</button>
                                                <button onClick={() => handleDeleteTemplate(template)} className="font-medium text-red-500 hover:underline">删除</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && canManageUsers && (
                    <UserManagement
                        allUsers={allUsers}
                        currentUser={currentUser}
                        onAddUser={() => { setUserToEdit(null); setIsUserModalOpen(true); }}
                        onEditUser={(user) => { setUserToEdit(user); setIsUserModalOpen(true); }}
                        onDeleteUser={handleDeleteUser}
                    />
                )}

                {activeTab === 'audit' && (
                     <div className="bg-bg-950/50 rounded-md">
                        <div className="p-4"><input type="text" value={logFilter} onChange={(e) => setLogFilter(e.target.value)} placeholder="筛选日志..." className="w-full bg-bg-800 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 text-sm"/></div>
                        <div className="overflow-x-auto max-h-[60vh]">
                            <table className="w-full text-sm text-left text-text-300">
                                <thead className="text-xs text-text-400 uppercase bg-bg-800/50 sticky top-0"><tr><th className="px-6 py-3 w-1/4">时间戳</th><th className="px-6 py-3 w-1/6">操作者</th><th className="w-auto px-6 py-3">行为</th></tr></thead>
                                <tbody>
                                    {filteredLogs.length > 0 ? filteredLogs.map((log, index) => (
                                        <tr key={index} className="border-b border-bg-800 hover:bg-bg-800/50">
                                            <td className="px-6 py-4 text-text-400 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                                            <td className="px-6 py-4 font-medium text-text-100">{log.username}</td>
                                            <td className="px-6 py-4">{log.action}</td>
                                        </tr>
                                    )) : ( <tr><td colSpan={3} className="text-center py-8 text-text-500">{logFilter ? '未找到匹配的日志。' : '没有审计日志。'}</td></tr> )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'deployments' && (
                    <DeploymentHistory deploymentHistory={deploymentHistory} devices={useStore.getState().devices} />
                )}

                {activeTab === 'tokens' && canManageUsers && (
                    <WriteTokenManagement tokens={writeTokens} />
                )}

                {activeTab === 'scripts' && canManageScripts && (
                    <div className="bg-bg-950/50 rounded-md">
                        <div className="p-4 flex justify-end">
                            <button onClick={() => { setScriptToEdit(null); setIsScriptModalOpen(true); }} className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md">
                                <PlusIcon /> 创建新脚本
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-text-300">
                                <thead className="text-xs text-text-400 uppercase bg-bg-800/50">
                                    <tr>
                                        <th className="px-6 py-3">脚本名称</th>
                                        <th className="px-6 py-3">适用类型</th>
                                        <th className="px-6 py-3">描述</th>
                                        <th className="px-6 py-3">创建者</th>
                                        <th className="px-6 py-3 text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scripts.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-8 text-text-500">暂无脚本，点击右上角创建第一个脚本。</td></tr>
                                    ) : scripts.map(script => (
                                        <tr key={script.id} className="border-b border-bg-800 hover:bg-bg-800/50">
                                            <td className="px-6 py-4 font-medium text-text-100">{script.name}</td>
                                            <td className="px-6 py-4 text-text-400 text-xs">{script.device_type || '通用'}</td>
                                            <td className="px-6 py-4 text-text-400 truncate max-w-xs">{script.description || '—'}</td>
                                            <td className="px-6 py-4 text-text-400">{script.created_by}</td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => setExecuteScript(script)} className="font-medium text-green-400 hover:underline">执行</button>
                                                <button onClick={() => { setScriptToEdit(script); setIsScriptModalOpen(true); }} className="font-medium text-primary-400 hover:underline">编辑</button>
                                                <button onClick={() => { if (window.confirm(`确认删除脚本 "${script.name}"？`)) deleteScript(script.id); }} className="font-medium text-red-500 hover:underline">删除</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'scheduledTasks' && canManageTasks && (
                    <div className="bg-bg-950/50 rounded-md">
                        <div className="p-4 flex justify-end">
                            <button onClick={() => { setTaskToEdit(null); setIsTaskModalOpen(true); }} className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md">
                                <PlusIcon /> 创建定时任务
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-text-300">
                                <thead className="text-xs text-text-400 uppercase bg-bg-800/50">
                                    <tr>
                                        <th className="px-6 py-3">状态</th>
                                        <th className="px-6 py-3">任务名称</th>
                                        <th className="px-6 py-3">类型</th>
                                        <th className="px-6 py-3">Cron</th>
                                        <th className="px-6 py-3">最后执行</th>
                                        <th className="px-6 py-3 text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scheduledTasks.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-8 text-text-500">暂无定时任务，点击右上角创建。</td></tr>
                                    ) : scheduledTasks.map(task => (
                                        <tr key={task.id} className="border-b border-bg-800 hover:bg-bg-800/50">
                                            <td className="px-6 py-4">
                                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${task.is_enabled ? 'bg-green-900 text-green-300' : 'bg-bg-700 text-text-500'}`}>
                                                    {task.is_enabled ? '启用' : '停用'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-text-100">{task.name}</td>
                                            <td className="px-6 py-4 text-text-400">{task.task_type === 'backup' ? '自动备份' : '拉取配置'}</td>
                                            <td className="px-6 py-4 font-mono text-xs text-text-400">{task.cron_expr}</td>
                                            <td className="px-6 py-4 text-text-400 text-xs">
                                                {task.last_run ? (
                                                    <span>
                                                        {new Date(task.last_run).toLocaleString('zh-CN')}
                                                        <span className={`ml-1 ${task.last_status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                                            {task.last_status === 'success' ? '✓' : '✗'}
                                                        </span>
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => { setTaskToEdit(task); setIsTaskModalOpen(true); }} className="font-medium text-primary-400 hover:underline">编辑</button>
                                                <button onClick={() => { if (window.confirm(`确认删除定时任务 "${task.name}"？`)) deleteScheduledTask(task.id); }} className="font-medium text-red-500 hover:underline">删除</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {isUserModalOpen && <UserEditModal userToEdit={userToEdit} allUsers={allUsers} currentUser={currentUser} agentApiUrl={agentApiUrl} onClose={() => setIsUserModalOpen(false)} onSave={() => { setIsUserModalOpen(false); fetchData(true); }} />}
            {isTemplateModalOpen && <TemplateEditModal templateToEdit={templateToEdit} currentUser={currentUser} agentApiUrl={agentApiUrl} onClose={() => setIsTemplateModalOpen(false)} onSave={() => { setIsTemplateModalOpen(false); fetchData(true); }} />}
            {isPolicyModalOpen && <PolicyEditModal policyToEdit={policyToEdit} currentUser={currentUser} agentApiUrl={agentApiUrl} onClose={() => setIsPolicyModalOpen(false)} onSave={() => { setIsPolicyModalOpen(false); fetchData(true); }} />}
            {isScriptModalOpen && <ScriptEditModal scriptToEdit={scriptToEdit} onClose={() => { setIsScriptModalOpen(false); setScriptToEdit(null); }} />}
            {executeScript && <ScriptExecuteModal script={executeScript} devices={devices} onClose={() => setExecuteScript(null)} />}
            {isTaskModalOpen && <ScheduledTaskModal taskToEdit={taskToEdit} devices={devices} onClose={() => { setIsTaskModalOpen(false); setTaskToEdit(null); }} />}
        
            {deletionTarget && (
                <ConfirmationModal
                    isOpen={!!deletionTarget}
                    onClose={() => setDeletionTarget(null)}
                    onConfirm={executeDelete}
                    title={getDeletionModalContent().title}
                    confirmText="确认删除"
                    confirmButtonVariant="danger"
                >
                    {getDeletionModalContent().content}
                </ConfirmationModal>
            )}
        </div>
    );
};

export default AdminPanel;