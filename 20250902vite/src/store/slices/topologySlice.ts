// topologySlice.ts - Zustand slice for network topology state.

import type { StateCreator } from 'zustand';
import { toast } from 'react-hot-toast';
import type { FullStore, TopologySlice } from '../storeTypes';
import { apiFetch } from '../../utils/apiFetch';
import { createApiUrl } from '../../utils/apiUtils';

export const createTopologySlice: StateCreator<FullStore, [], [], TopologySlice> = (set, get) => ({
  topologyNodes: [],
  topologyEdges: [],
  topologyLastDiscoveredAt: null,
  isTopologyLoading: false,

  fetchTopology: async () => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    set({ isTopologyLoading: true });
    try {
      const res = await apiFetch(createApiUrl(settings.agentApiUrl, '/api/topology'));
      if (res.ok) {
        const data = await res.json();
        set({
          topologyNodes: data.nodes ?? [],
          topologyEdges: data.edges ?? [],
          topologyLastDiscoveredAt: data.last_discovered_at ?? null,
        });
      }
    } finally {
      set({ isTopologyLoading: false });
    }
  },

  discoverTopology: async (deviceIds?: string[], simulation = false) => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading(simulation ? '加载模拟拓扑数据...' : '正在执行拓扑发现...');
    set({ isTopologyLoading: true });
    try {
      const body: Record<string, unknown> = { simulation };
      if (deviceIds && deviceIds.length > 0) body.device_ids = deviceIds;
      const res = await apiFetch(createApiUrl(settings.agentApiUrl, '/api/topology/discover'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        set({
          topologyNodes: data.nodes ?? [],
          topologyEdges: data.edges ?? [],
          topologyLastDiscoveredAt: data.last_discovered_at ?? null,
        });
        const errs: unknown[] = data.errors ?? [];
        if (errs.length > 0) {
          toast.error(`发现完成，${errs.length} 台设备失败`, { id: toastId });
        } else {
          toast.success(`拓扑发现完成，共 ${data.nodes?.length ?? 0} 个节点`, { id: toastId });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`拓扑发现失败: ${err.detail ?? res.status}`, { id: toastId });
      }
    } catch (e) {
      toast.error('拓扑发现请求失败', { id: toastId });
    } finally {
      set({ isTopologyLoading: false });
    }
  },

  clearTopology: async () => {
    const { settings } = get();
    if (!settings.agentApiUrl) return;
    const res = await apiFetch(createApiUrl(settings.agentApiUrl, '/api/topology'), { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      set({ topologyNodes: [], topologyEdges: [], topologyLastDiscoveredAt: null });
      toast.success('拓扑数据已清除');
    } else {
      toast.error('清除失败');
    }
  },
});
