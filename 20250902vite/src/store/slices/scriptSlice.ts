// slices/scriptSlice.ts - Script CRUD actions (state lives in DataSlice).

import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import type { FullStore, ScriptSlice } from '../storeTypes';

export const createScriptSlice: StateCreator<FullStore, [], [], ScriptSlice> = (_set, get) => ({
  createScript: async (script) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在创建脚本...');
    try {
      const url = createApiUrl(settings.agentApiUrl, '/api/scripts');
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(script),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '创建脚本失败。');
      toast.success('脚本已创建。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`创建失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },

  updateScript: async (scriptId, script) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在更新脚本...');
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/scripts/${scriptId}`);
      const res = await apiFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(script),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '更新脚本失败。');
      toast.success('脚本已更新。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`更新失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },

  deleteScript: async (scriptId) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在删除脚本...');
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/scripts/${scriptId}`);
      const res = await apiFetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || '删除脚本失败。');
      }
      toast.success('脚本已删除。', { id: toastId });
      await get().fetchData(true);
    } catch (e) {
      toast.error(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
    }
  },
});
