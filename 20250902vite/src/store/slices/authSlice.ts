// slices/authSlice.ts - Authentication state: currentUser, agentMode, aiStatus.

import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { geminiService } from '../../services/geminiService';
import { AppError } from '../../utils/errors';
import type { FullStore, AuthSlice } from '../storeTypes';

export const createAuthSlice: StateCreator<FullStore, [], [], AuthSlice> = (set, get) => ({
  currentUser: null,
  agentMode: 'live',
  aiStatus: { isOk: true, message: '', code: '' },

  init: () => {
    const storedUser = sessionStorage.getItem('chaintrace_user');
    const storedToken = sessionStorage.getItem('chaintrace_token');
    if (storedUser && storedToken) {
      set({ currentUser: JSON.parse(storedUser) });
    } else {
      sessionStorage.removeItem('chaintrace_user');
      sessionStorage.removeItem('chaintrace_token');
    }
    try {
      geminiService.checkKeyAvailability();
    } catch (error) {
      if (error instanceof AppError) {
        set({ aiStatus: { isOk: false, message: 'Google Gemini API 密钥未配置。', code: error.code } });
      } else if (error instanceof Error) {
        set({ aiStatus: { isOk: false, message: error.message, code: 'UNKNOWN_RUNTIME_ERROR' } });
      }
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
});
