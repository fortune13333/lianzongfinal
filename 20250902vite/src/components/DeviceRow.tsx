// DeviceRow.tsx - Table row for a single device in the Dashboard list view.

import React from 'react';
import { Device, Block, DeviceStatus, User } from '../types';
import { TrashIcon, EditIcon } from './AIIcons';
import DeviceIcon from './DeviceIcon';
import { hasPermission, ATOMIC_PERMISSIONS } from '../utils/permissions';

interface DeviceRowProps {
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
}

const DeviceRow: React.FC<DeviceRowProps> = ({
  device, lastBlock, isSelected, canManageTemplates, currentUser, deviceStatus,
  onDeviceClick, onToggleSelection, onEdit, onDelete,
}) => {
  const st = deviceStatus;
  return (
    <tr
      className={`hover:bg-bg-800 transition-colors cursor-pointer group ${isSelected ? 'bg-bg-800/50' : ''}`}
      onClick={() => onDeviceClick(device.id)}
    >
      {canManageTemplates && (
        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(device.id)}
            className="h-4 w-4 rounded bg-bg-700 border-bg-600 text-primary-600 focus:ring-primary-500"
          />
        </td>
      )}
      <td className="px-4 py-3 font-medium text-text-100">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 p-0.5 bg-bg-950 rounded flex-shrink-0">
            <DeviceIcon type={device.type} className="h-5 w-5" />
          </div>
          {device.name}
          <span
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
              !st ? 'bg-bg-600' : st.is_online ? 'bg-emerald-400' : 'bg-red-500'
            }`}
            title={!st ? '未检测' : st.is_online ? `在线 (${st.latency_ms}ms)` : '离线'}
          />
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
            onClick={(e) => onEdit(e, device)}
            className="p-1.5 rounded hover:bg-bg-700 text-text-400 hover:text-primary-300 transition-colors"
            title="编辑"
          >
            <EditIcon className="h-4 w-4" />
          </button>
        )}
        {hasPermission(currentUser, ATOMIC_PERMISSIONS.DEVICE_DELETE) && (
          <button
            onClick={(e) => onDelete(e, device.id)}
            className="p-1.5 rounded hover:bg-bg-700 text-text-400 hover:text-red-300 transition-colors"
            title="删除"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
};

export default DeviceRow;
