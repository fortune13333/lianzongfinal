// slices/sessionSlice.ts - Rollback, write-startup, and save-session operations.
// ProgressToast fix: only show initialSteps before the HTTP request;
// do NOT show a "step1 done" intermediate state that misleads the user.

import React from 'react';
import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import { hasPermission, ATOMIC_PERMISSIONS } from '../../utils/permissions';
import ProgressToast, { ProgressStep } from '../../components/ProgressToast';
import type { FullStore, SessionSlice } from '../storeTypes';

export const createSessionSlice: StateCreator<FullStore, [], [], SessionSlice> = (set, get) => ({
  rollbackTarget: null,
  isWriteStartupModalOpen: false,
  writeStartupDeviceId: null,

  promptRollback: (targetBlock) => set({ rollbackTarget: targetBlock }),
  cancelRollback: () => set({ rollbackTarget: null }),

  openWriteStartupModal: (deviceId) => set({ isWriteStartupModalOpen: true, writeStartupDeviceId: deviceId }),
  closeWriteStartupModal: () => set({ isWriteStartupModalOpen: false, writeStartupDeviceId: null }),

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
    } catch (error) {
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

    // Show initial progress — step1 "loading" until the server responds.
    const initialSteps: ProgressStep[] = [
      { text: '从设备获取最新配置', status: 'loading' },
      { text: 'AI 智能审计分析', status: 'pending' },
      { text: '写入区块链', status: 'pending' },
    ];
    toast.custom(
      (t) => React.createElement(ProgressToast, { t, title: "正在保存会话...", steps: initialSteps, onCancel: cancel }),
      { id: toastId, duration: Infinity },
    );

    const timeoutId = setTimeout(() => controller.abort('Save operation timed out'), 90000);

    try {
      const url = createApiUrl(settings.agentApiUrl!, `/api/sessions/${deviceId}/save`);
      const response = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: '代理返回了未知错误。' }));
        throw new Error(errorData.detail);
      }

      await fetchData(true);

      const finalSteps: ProgressStep[] = [
        { text: '从设备获取最新配置', status: 'done' },
        { text: 'AI 智能审计分析', status: 'done' },
        { text: '写入区块链', status: 'done' },
      ];
      toast.custom(
        (t) => React.createElement(ProgressToast, { t, title: "保存成功！", steps: finalSteps }),
        { id: toastId, duration: 4000 },
      );

      if (hasPermission(currentUser, ATOMIC_PERMISSIONS.STARTUP_WRITE)) {
        const writeToastId = `write-startup-prompt-${deviceId}-${Date.now()}`;
        toast(
          (t) => React.createElement(
            'div', { className: "flex items-center justify-between w-full max-w-md" },
            React.createElement('span', { className: "text-sm pr-4" },
              '配置已成功记录。是否要将其保存到设备的',
              React.createElement('b', { className: "text-yellow-300 mx-1" }, '启动配置'),
              '中？',
            ),
            React.createElement('div', { className: 'flex-shrink-0 flex gap-2' },
              React.createElement('button', {
                onClick: () => { openWriteStartupModal(deviceId); toast.dismiss(t.id); },
                className: "font-bold bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-2 rounded-md text-sm",
              }, '是'),
              React.createElement('button', {
                onClick: () => toast.dismiss(t.id),
                className: "font-bold bg-bg-700 hover:bg-bg-600 text-text-100 py-1 px-2 rounded-md text-sm",
              }, '否'),
            ),
          ),
          { duration: Infinity, id: writeToastId },
        );
      }
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const msg = isAbort ? '操作已取消或超时 (超过 90 秒)。' : error instanceof Error ? error.message : '未知错误。';
      // AbortError: operation was cancelled before any step ran → all pending
      // Other errors: single HTTP request failed, mark first step as error
      const errorSteps: ProgressStep[] = isAbort
        ? [
            { text: '从设备获取最新配置', status: 'pending' },
            { text: 'AI 智能审计分析', status: 'pending' },
            { text: '写入区块链', status: 'pending' },
          ]
        : [
            { text: '从设备获取最新配置', status: 'error' },
            { text: 'AI 智能审计分析', status: 'pending' },
            { text: '写入区块链', status: 'pending' },
          ];
      toast.custom(
        (t) => React.createElement(ProgressToast, { t, title: `保存失败: ${msg}`, steps: errorSteps }),
        { id: toastId, duration: 8000 },
      );
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
      fetchData(true);
      get().closeWriteStartupModal();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "未知错误。";
      toast.error(`写入失败: ${msg}`, { id: toastId });
    }
  },
});
