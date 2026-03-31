// slices/deviceSlice.ts - Device tabs, CRUD actions, and status polling.

import { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import { hasPermission, ATOMIC_PERMISSIONS } from '../../utils/permissions';
import type { FullStore, DeviceSlice } from '../storeTypes';

export const createDeviceSlice: StateCreator<FullStore, [], [], DeviceSlice> = (set, get) => ({
  openDeviceIds: [],
  activeDeviceId: null,
  deviceStatuses: {},
  _pollingIntervalId: null,

  openDeviceTab: (deviceId) => set(state => ({
    openDeviceIds: state.openDeviceIds.includes(deviceId)
      ? state.openDeviceIds
      : [...state.openDeviceIds, deviceId],
    activeDeviceId: deviceId,
  })),

  closeDeviceTab: (deviceId) => set(state => {
    const newOpenDeviceIds = state.openDeviceIds.filter(id => id !== deviceId);
    const newActiveDeviceId = state.activeDeviceId === deviceId
      ? (newOpenDeviceIds.length > 0 ? newOpenDeviceIds[newOpenDeviceIds.length - 1] : null)
      : state.activeDeviceId;
    return { openDeviceIds: newOpenDeviceIds, activeDeviceId: newActiveDeviceId };
  }),

  setActiveDeviceTab: (deviceId) => set({ activeDeviceId: deviceId }),

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
    } catch (error) {
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
    } catch (error) {
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
      const response = await apiFetch(url, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除设备失败。');
      toast.success('设备已删除。', { id: toastId });
      closeDeviceTab(deviceId);
      fetchData(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "未知错误。";
      toast.error(`删除失败: ${msg}`, { id: toastId });
    }
  },

  pollDeviceStatuses: async () => {
    const { agentApiUrl } = get().settings;
    if (!agentApiUrl) return;
    try {
      const res = await apiFetch(createApiUrl(agentApiUrl, '/api/devices/poll-status'), { cache: 'no-cache' });
      if (res.ok) set({ deviceStatuses: await res.json() });
    } catch (_e) { /* silent failure — status polling is non-critical */ }
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
});
