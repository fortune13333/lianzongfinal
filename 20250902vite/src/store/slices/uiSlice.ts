// slices/uiSlice.ts - App settings, modal open/close flags, backend AI settings.

import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import { hasPermission, ATOMIC_PERMISSIONS } from '../../utils/permissions';
import type { FullStore, UiSlice } from '../storeTypes';
import type { AppSettings } from '../../types';

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    analysis: { apiUrl: '' },
    commandGeneration: { enabled: true, apiUrl: '' },
    configCheck: { enabled: true, apiUrl: '' },
  },
  agentApiUrl: '',
  theme: 'cyan',
  bgTheme: 'zinc',
  agentUrlHistory: [],
  dashboardViewMode: 'grid',
};

export const createUiSlice: StateCreator<FullStore, [], [], UiSlice> = (set, get) => ({
  settings: DEFAULT_SETTINGS,
  isSettingsModalOpen: false,
  isDeviceModalOpen: false,
  deviceToEdit: null,
  isApiKeyModalOpen: false,

  openSettingsModal: () => set({ isSettingsModalOpen: true }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
  openDeviceModalForAdd: () => set({ isDeviceModalOpen: true, deviceToEdit: null }),
  openDeviceModalForEdit: (device) => set({ isDeviceModalOpen: true, deviceToEdit: device }),
  closeDeviceModal: () => set({ isDeviceModalOpen: false, deviceToEdit: null }),
  openApiKeyModal: () => set({ isApiKeyModalOpen: true }),
  closeApiKeyModal: () => set({ isApiKeyModalOpen: false }),

  updateSettings: (newSettings) => set(state => ({
    settings: { ...state.settings, ...newSettings },
  })),

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
        const errorData = await response.json().catch(() => ({ detail: '代理返回了未知错误。' }));
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
      return { settings: { ...state.settings, agentUrlHistory: Array.from(history).slice(0, 5) } };
    });
  },
});
