// DeviceCard.tsx - Grid-view card for a single device in the Dashboard.

import React from 'react';
import { Device, Block, DeviceStatus, User } from '../types';
import { TrashIcon, EditIcon } from './AIIcons';
import DeviceIcon from './DeviceIcon';
import { hasPermission, ATOMIC_PERMISSIONS } from '../utils/permissions';

interface DeviceCardProps {
  device: Device;
  lastBlock: Block | undefined;
  isSelected: boolean;
  canManageTemplates: boolean;
  currentUser: User;
  deviceStatus: DeviceStatus | undefined;
  onDeviceClick: (deviceId: string) => void;
  onToggleSelection: (deviceId: string) => void;
  onEdit: (e: React.MouseEvent, device: Device) => void;
  onDelete: (e: React.MouseEvent, deviceId: string) => void;
  onExport: (e: React.MouseEvent, deviceId: string) => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device, lastBlock, isSelected, canManageTemplates, currentUser, deviceStatus,
  onDeviceClick, onToggleSelection, onEdit, onDelete, onExport,
}) => {
  const st = deviceStatus;
  return (
    <div
      onClick={() => onDeviceClick(device.id)}
      className={`relative bg-bg-900 p-4 rounded-lg shadow-md cursor-pointer hover:bg-bg-800 transition-all duration-200 group flex flex-col justify-between border ${
        isSelected ? 'border-primary-500 shadow-lg shadow-primary-500/10' : 'border-bg-800 hover:border-primary-500/50'
      }`}
    >
      {/* Action buttons */}
      <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
        <button
          onClick={(e) => onExport(e, device.id)}
          className="p-1.5 rounded-full bg-bg-800/50 text-text-400 opacity-0 group-hover:opacity-100 hover:bg-bg-700 hover:text-text-200 transition-all duration-200"
          title="导出配置历史"
          aria-label={`导出设备 ${device.name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        {hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_UPDATE) && (
          <button
            onClick={(e) => onEdit(e, device)}
            className="p-1.5 rounded-full bg-bg-800/50 text-text-400 opacity-0 group-hover:opacity-100 hover:bg-primary-500/50 hover:text-primary-300 transition-all duration-200"
            title={`编辑设备 ${device.name}`}
            aria-label={`编辑设备 ${device.name}`}
          >
            <EditIcon className="h-4 w-4" />
          </button>
        )}
        {hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_DELETE) && (
          <button
            onClick={(e) => onDelete(e, device.id)}
            className="p-1.5 rounded-full bg-bg-800/50 text-text-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/50 hover:text-red-300 transition-all duration-200"
            title={`删除设备 ${device.name}`}
            aria-label={`删除设备 ${device.name}`}
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Checkbox for bulk selection */}
      {canManageTemplates && (
        <div className="absolute top-4 left-4 z-10 h-5 w-5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(device.id)}
            className="h-5 w-5 rounded bg-bg-800 border-bg-600 text-primary-600 focus:ring-primary-500"
            aria-label={`选择设备 ${device.name}`}
          />
        </div>
      )}

      {/* Device header */}
      <div className={canManageTemplates ? 'pl-8' : ''}>
        <div className="flex items-center gap-4">
          <div className="bg-bg-950 p-2 rounded-md relative">
            <DeviceIcon type={device.type} />
            <span
              className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-bg-900 ${
                !st ? 'bg-bg-600' : st.is_online ? 'bg-emerald-400' : 'bg-red-500'
              }`}
              title={!st ? '未检测' : st.is_online ? `在线 (${st.latency_ms}ms)` : '离线'}
            />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-100 group-hover:text-primary-400 transition-colors">
              {device.name}
            </h3>
            <p className="text-sm text-text-400 font-mono">{device.ipAddress}</p>
          </div>
        </div>
      </div>

      {/* Block info and tags */}
      <div className={`mt-4 text-sm text-text-300 border-t border-bg-800 pt-3 space-y-2 ${canManageTemplates ? 'pl-8' : ''}`}>
        {lastBlock ? (
          <>
            <p className="truncate text-text-300" title={lastBlock.data.summary}>
              <span className="font-semibold text-text-400">最新摘要: </span>{lastBlock.data.summary}
            </p>
            <p className="text-xs">
              <span className="font-semibold text-text-400">版本:</span> {lastBlock.data.version} |{' '}
              <span className="font-semibold text-text-400">操作员:</span>{' '}
              <span className="font-mono">{lastBlock.data.operator}</span>
            </p>
            <p className="text-xs text-text-500">{new Date(lastBlock.timestamp).toLocaleString()}</p>
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
};

export default DeviceCard;
