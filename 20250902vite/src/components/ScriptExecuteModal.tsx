import React, { useState } from 'react';
import { Script, Device, ScriptExecutionResult } from '../types';
import { useStore } from '../store/useStore';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';
import { toast } from 'react-hot-toast';

interface Props {
  script: Script;
  devices: Device[];
  onClose: () => void;
}

const ScriptExecuteModal: React.FC<Props> = ({ script, devices, onClose }) => {
  const { settings } = useStore();
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ScriptExecutionResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const toggleDevice = (id: string) => {
    setSelectedDeviceIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedDeviceIds.size === devices.length) {
      setSelectedDeviceIds(new Set());
    } else {
      setSelectedDeviceIds(new Set(devices.map(d => d.id)));
    }
  };

  const handleExecute = async () => {
    if (selectedDeviceIds.size === 0) {
      toast.error('请至少选择一台设备。');
      return;
    }
    setIsRunning(true);
    setResults([]);
    try {
      const url = createApiUrl(settings.agentApiUrl, `/api/scripts/${script.id}/execute`);
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: Array.from(selectedDeviceIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '执行失败。');
      setResults(data.results || []);
      const successCount = (data.results || []).filter((r: ScriptExecutionResult) => r.status === 'success').length;
      toast.success(`脚本执行完成：${successCount}/${data.results.length} 台成功。`);
    } catch (e) {
      toast.error(`执行失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-text-100">执行脚本：{script.name}</h2>
            {script.description && <p className="text-sm text-text-400 mt-0.5">{script.description}</p>}
          </div>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
          {/* Left: device selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text-300">选择目标设备</label>
              <button onClick={toggleAll} className="text-xs text-primary-400 hover:text-primary-300">
                {selectedDeviceIds.size === devices.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {devices.map(device => (
                <label key={device.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-bg-800 cursor-pointer">
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
          </div>

          {/* Right: script preview */}
          <div>
            <label className="block text-sm font-medium text-text-300 mb-2">脚本预览</label>
            <pre className="bg-bg-950 rounded-md p-3 text-xs font-mono text-text-300 overflow-auto max-h-64 whitespace-pre-wrap">
              {script.content}
            </pre>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="px-6 pb-4">
            <h3 className="text-sm font-semibold text-text-300 mb-2">执行结果</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className={`rounded-md p-3 border ${r.status === 'success' ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold ${r.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                      {r.status === 'success' ? '✓' : '✗'}
                    </span>
                    <span className="text-sm font-medium text-text-200">{r.device_name || r.device_id}</span>
                  </div>
                  <pre className="text-xs font-mono text-text-400 whitespace-pre-wrap max-h-24 overflow-auto">{r.output}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 border-t border-bg-700 flex justify-between items-center">
          <span className="text-sm text-text-400">已选 {selectedDeviceIds.size} 台设备</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors">关闭</button>
            <button
              onClick={handleExecute}
              disabled={isRunning || selectedDeviceIds.size === 0}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              {isRunning ? '执行中...' : '执行脚本'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScriptExecuteModal;
