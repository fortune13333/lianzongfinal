import React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Device, Block, AppSettings, User, AuditLogEntry, ConfigTemplate, Policy, BackendSettings, DeploymentRecord, WriteToken, DeviceStatus } from '../types';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';
import { AppError } from '../utils/errors';
import { geminiService } from '../services/geminiService';
import ProgressToast, { ProgressStep } from '../components/ProgressToast';
import { hasPermission, ATOMIC_PERMISSIONS } from '../utils/permissions';


// --- State and Actions Interfaces ---
interface AppState {
    devices: Device[];
    allUsers: User[];
    auditLog: AuditLogEntry[];
    templates: ConfigTemplate[];
    policies: Policy[];
    deploymentHistory: DeploymentRecord[];
    writeTokens: WriteToken[];
    blockchains: Record<string, Block[]>;
    openDeviceIds: string[];
    activeDeviceId: string | null;
    isLoading: boolean;
    settings: AppSettings;
    backendSettings: BackendSettings;
    currentUser: User | null;
    agentMode: 'live' | 'simulation';
    aiStatus: { isOk: boolean; message: string; code: string };
    isSettingsModalOpen: boolean;
    isDeviceModalOpen: boolean;
    deviceToEdit: Device | null;
    isApiKeyModalOpen: boolean;
    rollbackTarget: Block | null;
    isWriteStartupModalOpen: boolean;
    writeStartupDeviceId: string | null;
    deviceStatuses: Record<string, DeviceStatus>;
    _pollingIntervalId: ReturnType<typeof setInterval> | null;
}

interface AppActions {
    init: () => void;
    login: (user: User, agentUrl: string) => void;
    logout: () => void;
    fetchData: (isSilent?: boolean) => Promise<void>;
    openSettingsModal: () => void;
    closeSettingsModal: () => void;
    openDeviceModalForAdd: () => void;
    openDeviceModalForEdit: (device: Device) => void;
    closeDeviceModal: () => void;
    openApiKeyModal: () => void;
    closeApiKeyModal: () => void;
    updateSettings: (newSettings: Partial<AppSettings>) => void;
    updateBackendAISettings: (newSettings: BackendSettings) => Promise<void>;
    addAgentUrlToHistory: (url: string) => void;
    openDeviceTab: (deviceId: string) => void;
    closeDeviceTab: (deviceId: string) => void;
    setActiveDeviceTab: (deviceId: string) => void;
    resetData: () => Promise<void>;
    addNewDevice: (deviceData: Omit<Device, 'ipAddress'> & { ipAddress: string; policyIds?: string[] }) => Promise<void>;
    updateDevice: (deviceId: string, deviceData: Omit<Device, 'ipAddress'> & { ipAddress: string; policyIds?: string[] }) => Promise<void>;
    deleteDevice: (deviceId: string) => Promise<void>;
    promptRollback: (targetBlock: Block) => void;
    cancelRollback: () => void;
    executeRollback: () => Promise<void>;
    saveSessionAndAudit: (deviceId: string, sessionId: string) => Promise<void>;
    openWriteStartupModal: (deviceId: string) => void;
    closeWriteStartupModal: () => void;
    executeWriteStartup: (deviceId: string, token: string) => Promise<void>;
    pollDeviceStatuses: () => Promise<void>;
    startStatusPolling: () => void;
    stopStatusPolling: () => void;
}

// --- Default State Definitions ---
const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    analysis: { apiUrl: '' },
    commandGeneration: { enabled: true, apiUrl: '' },
    configCheck: { enabled: true, apiUrl: '' },
  },
  agentApiUrl: '',
  theme: 'cyan',
  bgTheme: 'zinc',
  agentUrlHistory: [],
  dashboardViewMode: 'grid', // Default view mode
};

const DEFAULT_BACKEND_SETTINGS: BackendSettings = {
    is_ai_analysis_enabled: true,
};

const INITIAL_STATE: AppState = {
    devices: [],
    allUsers: [],
    auditLog: [],
    templates: [],
    policies: [],
    deploymentHistory: [],
    writeTokens: [],
    blockchains: {},
    openDeviceIds: [],
    activeDeviceId: null,
    isLoading: true,
    settings: DEFAULT_SETTINGS,
    backendSettings: DEFAULT_BACKEND_SETTINGS,
    currentUser: null,
    agentMode: 'live',
    aiStatus: { isOk: true, message: '', code: '' },
    isSettingsModalOpen: false,
    isDeviceModalOpen: false,
    deviceToEdit: null,
    isApiKeyModalOpen: false,
    rollbackTarget: null,
    isWriteStartupModalOpen: false,
    writeStartupDeviceId: null,
    deviceStatuses: {},
    _pollingIntervalId: null,
};

// --- Zustand Store Creation ---
export const useStore = create<AppState & AppActions>()(
    persist(
        (set, get) => ({
            ...INITIAL_STATE,

            // --- Initialization and Auth ---
            init: () => {
                const storedUser = sessionStorage.getItem('chaintrace_user');
                const storedToken = sessionStorage.getItem('chaintrace_token');
                // Only restore session if both user data and JWT token are present
                if (storedUser && storedToken) {
                    set({ currentUser: JSON.parse(storedUser) });
                } else {
                    sessionStorage.removeItem('chaintrace_user');
                    sessionStorage.removeItem('chaintrace_token');
                }
                try {
                    geminiService.checkKeyAvailability();
                } catch (error) {
                    if (error instanceof AppError) set({ aiStatus: { isOk: false, message: 'Google Gemini API 密钥未配置。', code: error.code } });
                    else if (error instanceof Error) set({ aiStatus: { isOk: false, message: error.message, code: 'UNKNOWN_RUNTIME_ERROR' } });
                }
            },
            login: (user, agentUrl) => {
                get().updateSettings({ agentApiUrl: agentUrl });
                get().addAgentUrlToHistory(agentUrl);
                set({ currentUser: user });
                sessionStorage.setItem('chaintrace_user', JSON.stringify(user));
                toast.success(`欢迎, ${user.username}!`);
                get().startStatusPolling();
            },
            logout: () => {
                get().stopStatusPolling();
                set({ currentUser: null, openDeviceIds: [], activeDeviceId: null, deviceStatuses: {} });
                sessionStorage.removeItem('chaintrace_user');
                sessionStorage.removeItem('chaintrace_token');
                toast.success('您已成功登出。');
            },

            // --- Data Fetching ---
            fetchData: async (isSilent = false) => {
                const { agentApiUrl } = get().settings;
                if (!agentApiUrl) {
                    set({ isLoading: false, agentMode: 'simulation', devices: [], blockchains: {}, allUsers: [], auditLog: [], templates: [], policies: [], deploymentHistory: [], writeTokens: [] });
                    toast.error("未配置代理 API 地址，无法获取数据。");
                    return;
                }
                if (!isSilent) set({ isLoading: true });
                try {
                    const url = createApiUrl(agentApiUrl, '/api/data');
                    const response = await apiFetch(url, { cache: 'no-cache' });
                    if (!response.ok) throw new Error(`无法连接到代理或代理返回错误 (${response.status})。`);
                    
                    const data = await response.json();
                    
                    const oldCurrentUser = get().currentUser;
                    let updatedCurrentUser = oldCurrentUser;

                    if (oldCurrentUser && data.users) {
                        const freshUserData = data.users.find((u: User) => u.id === oldCurrentUser.id);
                        if (freshUserData) {
                            const { password, ...userToStore } = freshUserData;
                            if (JSON.stringify(oldCurrentUser) !== JSON.stringify(userToStore)) {
                                updatedCurrentUser = userToStore;
                                sessionStorage.setItem('chaintrace_user', JSON.stringify(userToStore));
                            }
                        } else {
                            updatedCurrentUser = null;
                            sessionStorage.removeItem('chaintrace_user');
                            toast.error("您的账户已被修改或删除，请重新登录。");
                        }
                    }
                    
                    set({
                        devices: data.devices,
                        blockchains: data.blockchains,
                        allUsers: data.users,
                        auditLog: data.audit_log,
                        templates: data.templates,
                        policies: data.policies,
                        deploymentHistory: data.deployment_history || [],
                        writeTokens: data.write_tokens || [],
                        backendSettings: data.settings || DEFAULT_BACKEND_SETTINGS,
                        agentMode: 'live',
                        isLoading: false,
                        currentUser: updatedCurrentUser,
                    });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : '未知错误。';
                    toast.error(`数据加载失败: ${msg}`);
                    set({ isLoading: false, agentMode: 'simulation' });
                }
            },

            // --- Modals ---
            openSettingsModal: () => set({ isSettingsModalOpen: true }),
            closeSettingsModal: () => set({ isSettingsModalOpen: false }),
            openDeviceModalForAdd: () => set({ isDeviceModalOpen: true, deviceToEdit: null }),
            openDeviceModalForEdit: (device) => set({ isDeviceModalOpen: true, deviceToEdit: device }),
            closeDeviceModal: () => set({ isDeviceModalOpen: false, deviceToEdit: null }),
            openApiKeyModal: () => set({ isApiKeyModalOpen: true }),
            closeApiKeyModal: () => set({ isApiKeyModalOpen: false }),
            openWriteStartupModal: (deviceId) => set({ isWriteStartupModalOpen: true, writeStartupDeviceId: deviceId }),
            closeWriteStartupModal: () => set({ isWriteStartupModalOpen: false, writeStartupDeviceId: null }),
            
            // --- Settings ---
            updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
            updateBackendAISettings: async (newSettings) => {
                const { currentUser, settings } = get();
                if (!settings.agentApiUrl || !currentUser) {
                    toast.error("未配置代理或未登录。");
                    return;
                }
                if (!hasPermission(currentUser, ATOMIC_PERMISSIONS.SYSTEM_SETTINGS)) {
                    toast.error("您没有权限修改系统设置。");
                    return;
                }
                const toastId = toast.loading('正在更新后端设置...');
                try {
                    const url = createApiUrl(settings.agentApiUrl, '/api/settings/ai');
                    const response = await apiFetch(url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSettings),
                    });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({'detail': '代理返回了未知错误。'}));
                        throw new Error(errorData.detail);
                    }
                    toast.success('后端设置已更新。', { id: toastId });
                    set({ backendSettings: newSettings });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : "未知错误。";
                    toast.error(`更新失败: ${msg}`, { id: toastId });
                }
            },
            addAgentUrlToHistory: (url) => {
                if (!url || !url.trim()) return;
                set(state => {
                    const history = new Set([url, ...state.settings.agentUrlHistory]);
                    const newHistory = Array.from(history).slice(0, 5);
                    return { settings: { ...state.settings, agentUrlHistory: newHistory } };
                });
            },
            
            // --- Device and Blockchain Actions ---
            openDeviceTab: (deviceId) => set(state => ({ openDeviceIds: state.openDeviceIds.includes(deviceId) ? state.openDeviceIds : [...state.openDeviceIds, deviceId], activeDeviceId: deviceId })),
            closeDeviceTab: (deviceId) => set(state => {
                const newOpenDeviceIds = state.openDeviceIds.filter(id => id !== deviceId);
                let newActiveDeviceId = state.activeDeviceId;
                if (state.activeDeviceId === deviceId) {
                    newActiveDeviceId = newOpenDeviceIds.length > 0 ? newOpenDeviceIds[newOpenDeviceIds.length - 1] : null;
                }
                return {
                    openDeviceIds: newOpenDeviceIds,
                    activeDeviceId: newActiveDeviceId,
                };
            }),
            setActiveDeviceTab: (deviceId) => set({ activeDeviceId: deviceId }),
            resetData: async () => {
                const { settings, currentUser, fetchData } = get();
                if (!settings.agentApiUrl || !currentUser || !hasPermission(currentUser, ATOMIC_PERMISSIONS.SYSTEM_RESET)) {
                    toast.error("无权操作或未配置代理。");
                    return;
                }
                if (!window.confirm("您确定要重置所有设备和区块链数据吗？")) return;
                
                const toastId = toast.loading('正在重置数据...');
                try {
                    const url = createApiUrl(settings.agentApiUrl, '/api/reset');
                    const response = await apiFetch(url, {
                        method: 'POST',
                    });
                    if (!response.ok) throw new Error('重置失败。');
                    
                    toast.success('数据已重置。', { id: toastId });
                    fetchData();
                    set({ openDeviceIds: [], activeDeviceId: null });
                } catch(error) {
                    const msg = error instanceof Error ? error.message : "未知错误。";
                    toast.error(`重置失败: ${msg}`, { id: toastId });
                }
            },
            addNewDevice: async (deviceData) => {
                const { settings, currentUser, fetchData, closeDeviceModal } = get();
                if (!settings.agentApiUrl || !currentUser) return;

                const toastId = toast.loading('正在添加设备...');
                try {
                    const url = createApiUrl(settings.agentApiUrl, '/api/devices');
                    const response = await apiFetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(deviceData),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.detail || '添加设备失败。');
                    
                    toast.success('设备添加成功。', { id: toastId });
                    fetchData(true);
                    closeDeviceModal();
                } catch(error) {
                    const msg = error instanceof Error ? error.message : "未知错误。";
                    toast.error(`添加失败: ${msg}`, { id: toastId });
                }
            },
            updateDevice: async (deviceId, deviceData) => {
                const { settings, currentUser, fetchData, closeDeviceModal } = get();
                if (!settings.agentApiUrl || !currentUser) return;

                const toastId = toast.loading('正在更新设备...');
                try {
                    const url = createApiUrl(settings.agentApiUrl, `/api/devices/${deviceId}`);
                    const response = await apiFetch(url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(deviceData),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.detail || '更新设备失败。');
                    
                    toast.success('设备更新成功。', { id: toastId });
                    fetchData(true);
                    closeDeviceModal();
                } catch(error) {
                    const msg = error instanceof Error ? error.message : "未知错误。";
                    toast.error(`更新失败: ${msg}`, { id: toastId });
                }
            },
            deleteDevice: async (deviceId) => {
                const { settings, currentUser, fetchData, closeDeviceTab } = get();
                if (!settings.agentApiUrl || !currentUser || !hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_DELETE)) {
                    toast.error("无权操作或未配置代理。");
                    return;
                }
                if (!window.confirm("您确定要删除此设备及其所有历史记录吗？")) return;

                const toastId = toast.loading('正在删除设备...');
                try {
                    const url = createApiUrl(settings.agentApiUrl, `/api/devices/${deviceId}`);
                    const response = await apiFetch(url, {
                        method: 'DELETE',
                    });
                    if (!response.ok) throw new Error('删除设备失败。');
                    
                    toast.success('设备已删除。', { id: toastId });
                    closeDeviceTab(deviceId);
                    fetchData(true);
                } catch(error) {
                    const msg = error instanceof Error ? error.message : "未知错误。";
                    toast.error(`删除失败: ${msg}`, { id: toastId });
                }
            },
            promptRollback: (targetBlock) => set({ rollbackTarget: targetBlock }),
            cancelRollback: () => set({ rollbackTarget: null }),
            executeRollback: async () => {
                const { rollbackTarget, settings, currentUser, fetchData, cancelRollback } = get();
                if (!rollbackTarget || !settings.agentApiUrl || !currentUser) return;

                const toastId = toast.loading('正在执行回滚...');
                try {
                    const url = createApiUrl(settings.agentApiUrl, `/api/blockchains/${rollbackTarget.data.deviceId}/rollback`);
                    const response = await apiFetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_version: rollbackTarget.data.version }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.detail || '回滚失败。');
                    
                    toast.success(`已成功回滚到版本 ${rollbackTarget.data.version}。`, { id: toastId });
                    fetchData(true);
                } catch(error) {
                    const msg = error instanceof Error ? error.message : "未知错误。";
                    toast.error(`回滚失败: ${msg}`, { id: toastId });
                } finally {
                    cancelRollback();
                }
            },
            saveSessionAndAudit: async (deviceId, sessionId) => {
                const { currentUser, settings, fetchData, openWriteStartupModal } = get();
                if (!settings.agentApiUrl || !currentUser) return;
        
                const controller = new AbortController();
                const toastId = 'save-session-toast';
        
                const cancel = () => { controller.abort(); toast.error('操作已取消。', { id: toastId }); };
        
                const initialSteps: ProgressStep[] = [ { text: '从设备获取最新配置', status: 'loading' }, { text: 'AI 智能审计分析', status: 'pending' }, { text: '写入区块链', status: 'pending' } ];
                toast.custom((t) => React.createElement(ProgressToast, { t, title: "正在保存会话...", steps: initialSteps, onCancel: cancel }), { id: toastId, duration: Infinity });
        
                const updatedSteps: ProgressStep[] = [ { text: '从设备获取最新配置', status: 'done' }, { text: 'AI 智能审计分析', status: 'loading' }, { text: '写入区块链', status: 'pending' } ];
                toast.custom((t) => React.createElement(ProgressToast, { t, title: "正在保存会话...", steps: updatedSteps, onCancel: cancel }), { id: toastId, duration: Infinity });
        
                const timeoutId = setTimeout(() => controller.abort('Save operation timed out'), 90000);
        
                try {
                    const url = createApiUrl(settings.agentApiUrl!, `/api/sessions/${deviceId}/save`);
                    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId }), signal: controller.signal });
                    if (!response.ok) { const errorData = await response.json().catch(() => ({ 'detail': '代理返回了未知错误。' })); throw new Error(errorData.detail); }
        
                    await fetchData(true);
        
                    const finalSteps: ProgressStep[] = [ { text: '从设备获取最新配置', status: 'done' }, { text: 'AI 智能审计分析', status: 'done' }, { text: '写入区块链', status: 'done' } ];
                    toast.custom((t) => React.createElement(ProgressToast, { t, title: "保存成功！", steps: finalSteps }), { id: toastId, duration: 4000 });
                    
                    if (hasPermission(currentUser, ATOMIC_PERMISSIONS.STARTUP_WRITE)) {
                        const writeToastId = `write-startup-prompt-${deviceId}-${Date.now()}`;
                        toast((t) => (
                            React.createElement('div', { className: "flex items-center justify-between w-full max-w-md" },
                                React.createElement('span', { className: "text-sm pr-4" },
                                    '配置已成功记录。是否要将其保存到设备的',
                                    React.createElement('b', { className: "text-yellow-300 mx-1" }, '启动配置'),
                                    '中？'
                                ),
                                React.createElement('div', { className: 'flex-shrink-0 flex gap-2' },
                                    React.createElement('button',
                                        {
                                            onClick: () => { openWriteStartupModal(deviceId); toast.dismiss(t.id); },
                                            className: "font-bold bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-2 rounded-md text-sm"
                                        },
                                        '是'
                                    ),
                                    React.createElement('button',
                                        {
                                            onClick: () => toast.dismiss(t.id),
                                            className: "font-bold bg-bg-700 hover:bg-bg-600 text-text-100 py-1 px-2 rounded-md text-sm"
                                        },
                                        '否'
                                    )
                                )
                            )
                        ), { duration: Infinity, id: writeToastId });
                    }

                } catch (error) {
                    const isAbort = error instanceof Error && error.name === 'AbortError';
                    const msg = isAbort ? '操作已取消或超时 (超过 90 秒)。' : error instanceof Error ? error.message : '未知错误。';
                    const errorSteps: ProgressStep[] = [ { text: '从设备获取最新配置', status: 'done' }, { text: 'AI 智能审计分析', status: 'error' }, { text: '写入区块链', status: 'pending' } ];
                    toast.custom((t) => React.createElement(ProgressToast, { t, title: `保存失败: ${msg}`, steps: errorSteps }), { id: toastId, duration: 8000 });
                } finally {
                    clearTimeout(timeoutId);
                }
            },

            executeWriteStartup: async (deviceId, token) => {
                const { settings, currentUser, fetchData } = get();
                if (!settings.agentApiUrl || !currentUser) return;

                const toastId = toast.loading('正在写入启动配置...');
                try {
                    const url = createApiUrl(settings.agentApiUrl, `/api/devices/${deviceId}/write-startup`);
                    const response = await apiFetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.detail || '写入失败，代理返回错误。');
                    
                    toast.success(result.message, { id: toastId });
                    fetchData(true); // Refresh data to update tokens status
                    get().closeWriteStartupModal();

                } catch (error) {
                    const msg = error instanceof Error ? error.message : "未知错误。";
                    toast.error(`写入失败: ${msg}`, { id: toastId });
                }
            },

            // --- Feature: Device Status Polling ---
            pollDeviceStatuses: async () => {
                const { agentApiUrl } = get().settings;
                if (!agentApiUrl) return;
                try {
                    const res = await apiFetch(createApiUrl(agentApiUrl, '/api/devices/poll-status'), { cache: 'no-cache' });
                    if (res.ok) set({ deviceStatuses: await res.json() });
                } catch (e) { /* 静默失败，不影响主功能 */ }
            },
            startStatusPolling: () => {
                if (get()._pollingIntervalId) return;
                get().pollDeviceStatuses();
                const id = setInterval(() => get().pollDeviceStatuses(), 30000);
                set({ _pollingIntervalId: id });
            },
            stopStatusPolling: () => {
                const id = get()._pollingIntervalId;
                if (id) { clearInterval(id); set({ _pollingIntervalId: null }); }
            },
        }),
        {
            name: 'chaintrace-settings-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ settings: state.settings }),
        }
    )
);
