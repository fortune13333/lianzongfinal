// slices/alertSlice.ts - Notification rule CRUD actions (state lives in DataSlice).

import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import type { FullStore, AlertSlice } from '../storeTypes';

export const createAlertSlice: StateCreator<FullStore, [], [], AlertSlice> = (_set, get) => ({
  createNotificationRule: async (rule) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在创建告警规则...');
    try {
      const url = createApiUrl(settings.agentApiUrl, '/api/notification-rules');
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '创建告警规则失败。');
      toast.success('告警规则已创建。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`创建失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },

  updateNotificationRule: async (ruleId, rule) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在更新告警规则...');
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/notification-rules/${ruleId}`);
      const res = await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '更新告警规则失败。');
      toast.success('告警规则已更新。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`更新失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },

  deleteNotificationRule: async (ruleId) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在删除告警规则...');
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/notification-rules/${ruleId}`);
      const res = await apiFetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || '删除告警规则失败。');
      }
      toast.success('告警规则已删除。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },

  testNotificationRule: async (ruleId) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在发送测试通知...');
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/notification-rules/${ruleId}/test`);
      const res = await apiFetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '测试通知发送失败。');
      toast.success(data.message || '测试通知发送成功。', { id: toastId });
    } catch (e) {
      toast.error(`测试失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },
});