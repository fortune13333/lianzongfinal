// slices/dataSlice.ts - All server data arrays, loading state, fetchData, resetData.

import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import { hasPermission, ATOMIC_PERMISSIONS } from '../../utils/permissions';
import type { FullStore, DataSlice } from '../storeTypes';
import type { User, BackendSettings } from '../../types';

const DEFAULT_BACKEND_SETTINGS: BackendSettings = { is_ai_analysis_enabled: true };

export const createDataSlice: StateCreator<FullStore, [], [], DataSlice> = (set, get) => ({
  devices: [],
  allUsers: [],
  auditLog: [],
  templates: [],
  policies: [],
  deploymentHistory: [],
  writeTokens: [],
  scripts: [],
  scheduledTasks: [],
  notificationRules: [],
  blockchains: {},
  isLoading: true,
  backendSettings: DEFAULT_BACKEND_SETTINGS,
  isResetConfirmOpen: false,

  promptResetData: () => set({ isResetConfirmOpen: true }),
  cancelResetData: () => set({ isResetConfirmOpen: false }),

  fetchData: async (isSilent = false) => {
    const { agentApiUrl } = get().settings;
    if (!agentApiUrl) {
      set({
        isLoading: false, agentMode: 'simulation',
        devices: [], blockchains: {}, allUsers: [], auditLog: [],
        templates: [], policies: [], deploymentHistory: [],
        writeTokens: [], scripts: [], scheduledTasks: [], notificationRules: [],
      });
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
          const { password: _pw, ...userToStore } = freshUserData;
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
        scripts: data.scripts || [],
        scheduledTasks: data.scheduled_tasks || [],
        notificationRules: data.notification_rules || [],
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

  resetData: async () => {
    const { settings, currentUser, fetchData } = get();
    if (!settings.agentApiUrl || !currentUser || !hasPermission(currentUser, ATOMIC_PERMISSIONS.SYSTEM_RESET)) {
      toast.error("无权操作或未配置代理。");
      return;
    }
    set({ isResetConfirmOpen: false });
    const toastId = toast.loading('正在重置数据...');
    try {
      const url = createApiUrl(settings.agentApiUrl, '/api/reset');
      const response = await apiFetch(url, { method: 'POST' });
      if (!response.ok) throw new Error('重置失败。');
      toast.success('数据已重置。', { id: toastId });
      fetchData();
      set({ openDeviceIds: [], activeDeviceId: null });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "未知错误。";
      toast.error(`重置失败: ${msg}`, { id: toastId });
    }
  },
});
