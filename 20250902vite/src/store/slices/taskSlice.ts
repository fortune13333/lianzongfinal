// slices/taskSlice.ts - Scheduled task CRUD actions (state lives in DataSlice).

import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import type { FullStore, TaskSlice } from '../storeTypes';

export const createTaskSlice: StateCreator<FullStore, [], [], TaskSlice> = (_set, get) => ({
  createScheduledTask: async (task) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在创建定时任务...');
    try {
      const url = createApiUrl(settings.agentApiUrl, '/api/scheduled-tasks');
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '创建定时任务失败。');
      toast.success('定时任务已创建。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`创建失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },

  updateScheduledTask: async (taskId, task) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在更新定时任务...');
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/scheduled-tasks/${taskId}`);
      const res = await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '更新定时任务失败。');
      toast.success('定时任务已更新。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`更新失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },

  deleteScheduledTask: async (taskId) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在删除定时任务...');
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/scheduled-tasks/${taskId}`);
      const res = await apiFetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || '删除定时任务失败。');
      }
      toast.success('定时任务已删除。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },
});
