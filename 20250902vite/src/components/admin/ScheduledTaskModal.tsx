import React, { useState, useEffect } from 'react';
import { ScheduledTask, Device } from '../../types';
import { useStore } from '../../store/useStore';

interface Props {
  taskToEdit: ScheduledTask | null;
  devices: Device[];
  onClose: () => void;
}

const CRON_PRESETS = [
  { label: '每天凌晨 2 点', value: '0 2 * * *' },
  { label: '每 6 小时', value: '0 */6 * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天中午 12 点', value: '0 12 * * *' },
  { label: '每周一凌晨 3 点', value: '0 3 * * 1' },
  { label: '自定义...', value: '' },
];

const ScheduledTaskModal: React.FC<Props> = ({ taskToEdit, devices, onClose }) => {
  const { createScheduledTask, updateScheduledTask } = useStore();
  const isEditing = !!taskToEdit;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cronExpr, setCronExpr] = useState('0 2 * * *');
  const [taskType] = useState<'backup'>('backup');
  const [useAllDevices, setUseAllDevices] = useState(true);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [isEnabled, setIsEnabled] = useState(true);
  const [customCron, setCustomCron] = useState(false);

  useEffect(() => {
    if (taskToEdit) {
      setName(taskToEdit.name);
      setDescription(taskToEdit.description ?? '');
      setCronExpr(taskToEdit.cron_expr);
      setIsEnabled(taskToEdit.is_enabled);
      const isAll = taskToEdit.device_ids.includes('all') || taskToEdit.device_ids.length === 0;
      setUseAllDevices(isAll);
      if (!isAll) setSelectedDeviceIds(new Set(taskToEdit.device_ids));
      // Check if cron matches a preset
      const preset = CRON_PRESETS.find(p => p.value === taskToEdit.cron_expr && p.value !== '');
      setCustomCron(!preset);
    }
  }, [taskToEdit]);

  const handlePresetChange = (value: string) => {
    if (value === '') {
      setCustomCron(true);
    } else {
      setCustomCron(false);
      setCronExpr(value);
    }
  };

  const toggleDevice = (id: string) => {
    setSelectedDeviceIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cronExpr.trim()) return;

    const deviceIds = useAllDevices ? ['all'] : Array.from(selectedDeviceIds);
    if (!useAllDevices && deviceIds.length === 0) {
      alert('请至少选择一台设备，或选择"所有设备"。');
      return;
    }

    const payload: ScheduledTask = {
      id: isEditing ? taskToEdit!.id : crypto.randomUUID(),
      name: name.trim(),
      description: description.trim() || undefined,
      cron_expr: cronExpr.trim(),
      task_type: taskType,
      device_ids: deviceIds,
      is_enabled: isEnabled,
    };

    if (isEditing) {
      await updateScheduledTask(taskToEdit!.id, payload);
    } else {
      await createScheduledTask(payload);
    }
    onClose();
  };

  const selectedPreset = customCron ? '' : CRON_PRESETS.find(p => p.value === cronExpr)?.value ?? '';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-text-100">{isEditing ? '编辑定时任务' : '创建定时任务'}</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-text-300 mb-1">任务名称 *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="例如：每日夜间配置备份"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-300 mb-1">描述</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="可选说明"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-300 mb-1">执行频率</label>
              <select
                value={selectedPreset}
                onChange={e => handlePresetChange(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 mb-2"
              >
                {CRON_PRESETS.map(p => (
                  <option key={p.label} value={p.value}>{p.label}</option>
                ))}
              </select>
              {customCron && (
                <div>
                  <input
                    type="text"
                    value={cronExpr}
                    onChange={e => setCronExpr(e.target.value)}
                    className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 font-mono text-text-200 focus:ring-2 focus:ring-primary-500"
                    placeholder="Cron 表达式，例如：0 2 * * *"
                    required
                  />
                  <p className="text-xs text-text-500 mt-1">格式：分 时 日 月 星期（UTC 时区）</p>
                </div>
              )}
              {!customCron && <p className="text-xs text-text-500 font-mono">cron: {cronExpr}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-300 mb-2">目标设备</label>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="deviceScope" checked={useAllDevices} onChange={() => setUseAllDevices(true)} className="accent-primary-500" />
                  <span className="text-sm text-text-200">所有设备</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="deviceScope" checked={!useAllDevices} onChange={() => setUseAllDevices(false)} className="accent-primary-500" />
                  <span className="text-sm text-text-200">指定设备</span>
                </label>
              </div>
              {!useAllDevices && (
                <div className="space-y-1 max-h-36 overflow-y-auto border border-bg-700 rounded-md p-2">
                  {devices.map(device => (
                    <label key={device.id} className="flex items-center gap-2 p-1 rounded hover:bg-bg-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDeviceIds.has(device.id)}
                        onChange={() => toggleDevice(device.id)}
                        className="w-4 h-4 accent-primary-500"
                      />
                      <span className="text-sm text-text-200">{device.name}</span>
                      <span className="text-xs text-text-500 ml-auto">{device.ipAddress}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="taskEnabled"
                checked={isEnabled}
                onChange={e => setIsEnabled(e.target.checked)}
                className="w-4 h-4 accent-primary-500"
              />
              <label htmlFor="taskEnabled" className="text-sm text-text-200 cursor-pointer">启用此任务</label>
            </div>
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors">取消</button>
            <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
              {isEditing ? '保存更改' : '创建任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduledTaskModal;
