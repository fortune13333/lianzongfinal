import React, { useState, useMemo } from 'react';
import { Device } from '../types';
import { TrashIcon, PlusIcon, EditIcon, ListIcon, GridIcon, SearchIcon, SortIcon } from './AIIcons';
import AdminPanel from './admin/AdminPanel';
import BulkDeployModal from './admin/BulkDeployModal';
import ConfigSearchModal from './ConfigSearchModal';
import { useStore } from '../store/useStore';
import { hasPermission, canViewAdminPanel, ATOMIC_PERMISSIONS } from '../utils/permissions';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';

interface DashboardProps {
  isInTerminalContext?: boolean;
}

const DeviceIcon: React.FC<{ type: Device['type'] }> = ({ type }) => {
  const iconPath = {
    Router: "M13 10V3L4 14h7v7l9-11h-7z",
    Switch: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
    Firewall: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={iconPath[type]} />
    </svg>
  );
};

const SkeletonCard: React.FC = () => (
  <div className="bg-bg-900 p-4 rounded-lg shadow-md animate-pulse">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-bg-800 rounded-md"></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-bg-800 rounded w-3/4"></div>
        <div className="h-3 bg-bg-800 rounded w-1/2"></div>
      </div>
    </div>
    <div className="mt-4 border-t border-bg-800 pt-3 space-y-2">
      <div className="h-3 bg-bg-800 rounded w-full"></div>
      <div className="h-3 bg-bg-800 rounded w-1/2"></div>
      <div className="h-3 bg-bg-800 rounded w-1/3"></div>
    </div>
  </div>
);

const BulkActionsToolbar: React.FC<{
    selectedCount: number;
    onClear: () => void;
    onDeploy: () => void;
}> = ({ selectedCount, onClear, onDeploy }) => {
    return (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-xl p-4 z-40">
            <div className="bg-bg-800 rounded-lg shadow-2xl flex items-center justify-between p-3 border border-bg-700">
                <span className="text-text-100 font-semibold">{selectedCount} 台设备已选择</span>
                <div className="flex items-center gap-2">
                    <button onClick={onDeploy} className="text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md transition-colors">
                        部署模板
                    </button>
                    <button onClick={onClear} className="text-sm bg-bg-700 hover:bg-bg-600 text-text-100 font-medium py-2 px-3 rounded-md transition-colors">
                        清空选择
                    </button>
                </div>
            </div>
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ isInTerminalContext = false }) => {
  const {
    devices, blockchains, isLoading, resetData,
    deleteDevice, openDeviceModalForAdd, openDeviceModalForEdit, currentUser, fetchData,
    openDeviceTab, settings, updateSettings, deviceStatuses
  } = useStore(state => ({
    devices: state.devices,
    blockchains: state.blockchains,
    isLoading: state.isLoading,
    resetData: state.resetData,
    deleteDevice: state.deleteDevice,
    openDeviceModalForAdd: state.openDeviceModalForAdd,
    openDeviceModalForEdit: state.openDeviceModalForEdit,
    currentUser: state.currentUser!,
    fetchData: state.fetchData,
    openDeviceTab: state.openDeviceTab,
    settings: state.settings,
    updateSettings: state.updateSettings,
    deviceStatuses: state.deviceStatuses,
  }));
  
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isConfigSearchOpen, setIsConfigSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'name' | 'ipAddress' | 'type'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    devices.forEach(d => (d.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [devices]);

  const triggerJsonDownload = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
  };

  const handleExportDevice = async (e: React.MouseEvent, deviceId: string) => {
    e.stopPropagation();
    if (!settings.agentApiUrl) return;
    const res = await apiFetch(createApiUrl(settings.agentApiUrl, `/api/devices/${deviceId}/export`));
    if (res.ok) {
      triggerJsonDownload(await res.json(), `chaintrace_${deviceId}_${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('设备历史已导出');
    } else {
      toast.error('导出失败');
    }
  };

  const handleFullBackup = async () => {
    if (!settings.agentApiUrl) return;
    const toastId = toast.loading('正在生成全量备份...');
    const res = await apiFetch(createApiUrl(settings.agentApiUrl, '/api/backup'));
    if (res.ok) {
      triggerJsonDownload(await res.json(), `chaintrace_backup_${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('全量备份已导出', { id: toastId });
    } else {
      toast.error('备份失败', { id: toastId });
    }
  };

  const viewMode = settings.dashboardViewMode || 'grid';
  
  const canCreateDevice = hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_CREATE);
  const canResetData = hasPermission(currentUser, ATOMIC_PERMISSIONS.SYSTEM_RESET);
  const canManageTemplates = hasPermission(currentUser, ATOMIC_PERMISSIONS.TEMPLATE_MANAGE);
  const showAdminButtons = canCreateDevice || canResetData;

  const handleToggleSelection = (deviceId: string) => {
      setSelectedDeviceIds(prev => {
          const newSelection = new Set(prev);
          if (newSelection.has(deviceId)) {
              newSelection.delete(deviceId);
          } else {
              newSelection.add(deviceId);
          }
          return newSelection;
      });
  };

  const clearSelection = () => {
      setSelectedDeviceIds(new Set());
  };

  const handleDeploymentComplete = () => {
    setIsDeployModalOpen(false);
    clearSelection();
    fetchData(true);
  };
  
  const handleDeviceClick = (deviceId: string) => {
    openDeviceTab(deviceId);
    if (isInTerminalContext) {
        toast.success("所选设备已添加到标签栏，请点击返回终端视图查看");
    }
  };

  const handleDelete = (e: React.MouseEvent, deviceId: string) => {
    e.stopPropagation();
    deleteDevice(deviceId);
  };

  const handleEdit = (e: React.MouseEvent, device: Device) => {
    e.stopPropagation();
    openDeviceModalForEdit(device);
  };

  const handleSortChange = (field: 'name' | 'ipAddress' | 'type') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedDevices = useMemo(() => {
    let result = [...devices];

    // 1. Filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.ipAddress.includes(query) ||
        d.type.toLowerCase().includes(query)
      );
    }

    // 1b. Tag filter
    if (selectedTag) {
      result = result.filter(d => (d.tags || []).includes(selectedTag));
    }

    // 2. Sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'ipAddress':
          // Numeric sort for IP addresses
          comparison = a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true });
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [devices, searchQuery, sortField, sortDirection, selectedTag]);


  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 border-b border-bg-800 pb-4">
        <div className="flex justify-between items-center">
            <h2 className="text-3xl font-bold text-text-100">受管设备</h2>
            {showAdminButtons && (
            <div className="flex items-center gap-2">
                {canCreateDevice && (
                    <button
                    onClick={openDeviceModalForAdd}
                    className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md transition-colors duration-200"
                    >
                    <PlusIcon />
                    <span>添加新设备</span>
                    </button>
                )}
                <button
                    onClick={() => setIsConfigSearchOpen(true)}
                    className="text-sm bg-bg-800 hover:bg-bg-700 text-text-300 hover:text-primary-300 font-medium py-2 px-3 rounded-md transition-colors duration-200"
                    title="搜索历史配置"
                >
                    配置搜索
                </button>
                {canResetData && (
                    <>
                    <button
                        onClick={handleFullBackup}
                        className="text-sm bg-bg-800 hover:bg-bg-700 text-text-300 hover:text-primary-300 font-medium py-2 px-3 rounded-md transition-colors duration-200"
                        title="导出系统全量备份"
                    >
                        全量备份
                    </button>
                    <button
                    onClick={resetData}
                    className="text-sm bg-bg-800 hover:bg-red-600/50 text-text-300 hover:text-red-300 font-medium py-2 px-3 rounded-md transition-colors duration-200"
                    >
                    重置数据
                    </button>
                    </>
                )}
            </div>
            )}
        </div>

        {/* Control Bar: Search, Sort, View Toggle */}
        <div className="flex flex-col md:flex-row justify-between gap-4 bg-bg-900 p-3 rounded-lg shadow-sm">
            <div className="relative flex-1 max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <SearchIcon className="h-5 w-5 text-text-500" />
                </div>
                <input
                    type="text"
                    placeholder="搜索设备名称、IP 或类型..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-bg-950 border border-bg-700 rounded-md text-sm text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder-text-500"
                />
            </div>

            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-text-400 hidden sm:inline">排序:</span>
                    <select
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value as any)}
                        className="bg-bg-950 border border-bg-700 rounded-md text-sm text-text-200 py-2 pl-2 pr-8 focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="name">名称</option>
                        <option value="ipAddress">IP 地址</option>
                        <option value="type">类型</option>
                    </select>
                    <button
                        onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="p-2 bg-bg-950 border border-bg-700 rounded-md text-text-400 hover:text-primary-400 transition-colors"
                        title={sortDirection === 'asc' ? "升序" : "降序"}
                    >
                        <SortIcon className={`h-5 w-5 transform transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                <div className="h-6 w-px bg-bg-700 mx-1"></div>

                <div className="flex bg-bg-950 rounded-md p-1 border border-bg-700">
                    <button
                        onClick={() => updateSettings({ dashboardViewMode: 'grid' })}
                        className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-bg-700 text-text-100 shadow-sm' : 'text-text-400 hover:text-text-200'}`}
                        title="网格视图"
                    >
                        <GridIcon />
                    </button>
                    <button
                        onClick={() => updateSettings({ dashboardViewMode: 'list' })}
                        className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-bg-700 text-text-100 shadow-sm' : 'text-text-400 hover:text-text-200'}`}
                        title="列表视图"
                    >
                        <ListIcon />
                    </button>
                </div>
            </div>
        </div>

        {/* Tag Filter Bar */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <span className="text-xs text-text-500">按标签筛选:</span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                  selectedTag === tag
                    ? 'bg-primary-600 border-primary-500 text-white'
                    : 'border-bg-700 text-text-400 hover:border-primary-500 hover:text-primary-300'
                }`}
              >
                {tag}
              </button>
            ))}
            {selectedTag && (
              <button onClick={() => setSelectedTag(null)} className="text-xs text-text-500 hover:text-text-300 underline">清除</button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : devices.length === 0 ? (
          <div className="text-center py-20 bg-bg-900 rounded-lg">
              <h3 className="text-xl font-semibold text-text-100">未找到任何设备</h3>
              <p className="text-text-400 mt-2 mb-6">请尝试添加新设备或检查后端连接。</p>
              {canCreateDevice && (
                <button
                  onClick={openDeviceModalForAdd}
                  className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 mx-auto"
                >
                  <PlusIcon />
                  <span>添加第一个设备</span>
                </button>
              )}
          </div>
      ) : filteredAndSortedDevices.length === 0 ? (
        <div className="text-center py-20 bg-bg-900 rounded-lg">
            <h3 className="text-lg font-medium text-text-300">未找到匹配 "{searchQuery}" 的设备</h3>
            <button onClick={() => setSearchQuery('')} className="mt-4 text-primary-400 hover:underline text-sm">清除搜索</button>
        </div>
      ) : viewMode === 'grid' ? (
        // --- GRID VIEW ---
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedDevices.map(device => {
            const lastBlock = blockchains[device.id]?.[blockchains[device.id].length - 1];
            const isSelected = selectedDeviceIds.has(device.id);

            return (
              <div 
                key={device.id}
                onClick={() => handleDeviceClick(device.id)}
                className={`relative bg-bg-900 p-4 rounded-lg shadow-md cursor-pointer hover:bg-bg-800 transition-all duration-200 group flex flex-col justify-between border ${isSelected ? 'border-primary-500 shadow-lg shadow-primary-500/10' : 'border-bg-800 hover:border-primary-500/50'}`}
              >
                 <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
                    <button
                      onClick={(e) => handleExportDevice(e, device.id)}
                      className="p-1.5 rounded-full bg-bg-800/50 text-text-400 opacity-0 group-hover:opacity-100 hover:bg-bg-700 hover:text-text-200 transition-all duration-200"
                      aria-label={`导出设备 ${device.name}`}
                      title="导出配置历史"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                    {hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_UPDATE) && (
                        <button
                          onClick={(e) => handleEdit(e, device)}
                          className="p-1.5 rounded-full bg-bg-800/50 text-text-400 opacity-0 group-hover:opacity-100 hover:bg-primary-500/50 hover:text-primary-300 transition-all duration-200"
                          aria-label={`编辑设备 ${device.name}`}
                          title={`编辑设备 ${device.name}`}
                        >
                            <EditIcon className="h-4 w-4" />
                        </button>
                    )}
                    {hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_DELETE) && (
                        <button
                          onClick={(e) => handleDelete(e, device.id)}
                          className="p-1.5 rounded-full bg-bg-800/50 text-text-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/50 hover:text-red-300 transition-all duration-200"
                          aria-label={`删除设备 ${device.name}`}
                          title={`删除设备 ${device.name}`}
                        >
                            <TrashIcon className="h-5 w-5" />
                        </button>
                    )}
                 </div>
                 {canManageTemplates && (
                    <div 
                      className="absolute top-4 left-4 z-10 h-5 w-5"
                      onClick={(e) => e.stopPropagation()}
                   >
                       <input 
                           type="checkbox"
                           checked={isSelected}
                           onChange={() => handleToggleSelection(device.id)}
                           className="h-5 w-5 rounded bg-bg-800 border-bg-600 text-primary-600 focus:ring-primary-500"
                           aria-label={`选择设备 ${device.name}`}
                       />
                   </div>
                 )}
                <div className={canManageTemplates ? 'pl-8' : ''}>
                  <div className="flex items-center gap-4">
                    <div className="bg-bg-950 p-2 rounded-md relative">
                      <DeviceIcon type={device.type} />
                      {(() => {
                        const st = deviceStatuses[device.id];
                        return (
                          <span
                            className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-bg-900 ${!st ? 'bg-bg-600' : st.is_online ? 'bg-emerald-400' : 'bg-red-500'}`}
                            title={!st ? '未检测' : st.is_online ? `在线 (${st.latency_ms}ms)` : '离线'}
                          />
                        );
                      })()}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-text-100 group-hover:text-primary-400 transition-colors">{device.name}</h3>
                      <p className="text-sm text-text-400 font-mono">{device.ipAddress}</p>
                    </div>
                  </div>
                </div>
                <div className={`mt-4 text-sm text-text-300 border-t border-bg-800 pt-3 space-y-2 ${canManageTemplates ? 'pl-8' : ''}`}>
                  {lastBlock ? (
                    <>
                      <p className="truncate text-text-300" title={lastBlock.data.summary}>
                        <span className="font-semibold text-text-400">最新摘要: </span>{lastBlock.data.summary}
                      </p>
                      <p className="text-xs">
                        <span className="font-semibold text-text-400">版本:</span> {lastBlock.data.version} | <span className="font-semibold text-text-400">操作员:</span> <span className="font-mono">{lastBlock.data.operator}</span>
                      </p>
                      <p className="text-xs text-text-500">
                        {new Date(lastBlock.timestamp).toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p className="text-text-500 italic">未找到配置历史。</p>
                  )}
                  {(device.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(device.tags || []).slice(0, 4).map(tag => (
                        <span key={tag} className="text-xs bg-bg-800 text-text-400 px-1.5 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // --- LIST VIEW ---
        <div className="bg-bg-900 rounded-lg shadow-md overflow-hidden border border-bg-800">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-text-300">
                    <thead className="text-xs text-text-400 uppercase bg-bg-950 border-b border-bg-800">
                        <tr>
                            {canManageTemplates && <th className="px-4 py-3 w-10 text-center">#</th>}
                            <th 
                                className="px-4 py-3 cursor-pointer hover:text-text-200 hover:bg-bg-800 transition-colors"
                                onClick={() => handleSortChange('name')}
                            >
                                设备名称 {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                                className="px-4 py-3 cursor-pointer hover:text-text-200 hover:bg-bg-800 transition-colors"
                                onClick={() => handleSortChange('ipAddress')}
                            >
                                IP 地址 {sortField === 'ipAddress' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                                className="px-4 py-3 cursor-pointer hover:text-text-200 hover:bg-bg-800 transition-colors"
                                onClick={() => handleSortChange('type')}
                            >
                                类型 {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-4 py-3">最新版本</th>
                            <th className="px-4 py-3">最后更新</th>
                            <th className="px-4 py-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-bg-800">
                        {filteredAndSortedDevices.map(device => {
                            const lastBlock = blockchains[device.id]?.[blockchains[device.id].length - 1];
                            const isSelected = selectedDeviceIds.has(device.id);
                            
                            return (
                                <tr 
                                    key={device.id} 
                                    className={`hover:bg-bg-800 transition-colors cursor-pointer group ${isSelected ? 'bg-bg-800/50' : ''}`}
                                    onClick={() => handleDeviceClick(device.id)}
                                >
                                    {canManageTemplates && (
                                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleSelection(device.id)}
                                                className="h-4 w-4 rounded bg-bg-700 border-bg-600 text-primary-600 focus:ring-primary-500"
                                            />
                                        </td>
                                    )}
                                    <td className="px-4 py-3 font-medium text-text-100">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 p-0.5 bg-bg-950 rounded flex-shrink-0">
                                                <DeviceIcon type={device.type} />
                                            </div>
                                            {device.name}
                                            {(() => {
                                                const st = deviceStatuses[device.id];
                                                return (
                                                  <span
                                                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${!st ? 'bg-bg-600' : st.is_online ? 'bg-emerald-400' : 'bg-red-500'}`}
                                                    title={!st ? '未检测' : st.is_online ? `在线 (${st.latency_ms}ms)` : '离线'}
                                                  />
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-text-400">{device.ipAddress}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 rounded-full text-xs bg-bg-950 text-text-400 border border-bg-700">
                                            {device.type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {lastBlock ? (
                                            <div className="flex flex-col">
                                                <span className="text-text-200">v{lastBlock.data.version}</span>
                                                <span className="text-xs text-text-500">{lastBlock.data.operator}</span>
                                            </div>
                                        ) : (
                                            <span className="text-text-500 italic">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-text-400 text-xs">
                                        {lastBlock ? new Date(lastBlock.timestamp).toLocaleString() : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                                        {hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_UPDATE) && (
                                            <button
                                                onClick={(e) => handleEdit(e, device)}
                                                className="p-1.5 rounded hover:bg-bg-700 text-text-400 hover:text-primary-300 transition-colors"
                                                title="编辑"
                                            >
                                                <EditIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                        {hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_DELETE) && (
                                            <button
                                                onClick={(e) => handleDelete(e, device.id)}
                                                className="p-1.5 rounded hover:bg-bg-700 text-text-400 hover:text-red-300 transition-colors"
                                                title="删除"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {canManageTemplates && selectedDeviceIds.size > 0 && (
          <BulkActionsToolbar 
              selectedCount={selectedDeviceIds.size}
              onClear={clearSelection}
              onDeploy={() => setIsDeployModalOpen(true)}
          />
      )}
      {canViewAdminPanel(currentUser) && (
        <AdminPanel />
      )}
      {isDeployModalOpen && (
          <BulkDeployModal
              isOpen={isDeployModalOpen}
              onClose={() => setIsDeployModalOpen(false)}
              selectedDeviceIds={Array.from(selectedDeviceIds)}
              onDeploymentComplete={handleDeploymentComplete}
          />
      )}
      {isConfigSearchOpen && (
          <ConfigSearchModal
              devices={devices}
              onClose={() => setIsConfigSearchOpen(false)}
          />
      )}
    </div>
  );
};

export default Dashboard;
