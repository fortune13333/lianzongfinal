import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ConfigTemplate } from '../types';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import Loader from './Loader';
import { useStore } from '../store/useStore';

interface BulkDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDeviceIds: string[];
  onDeploymentComplete: () => void;
}

const BulkDeployModal: React.FC<BulkDeployModalProps> = ({ isOpen, onClose, selectedDeviceIds, onDeploymentComplete }) => {
  const { devices, templates, currentUser, agentApiUrl } = useStore(state => ({
    devices: state.devices,
    templates: state.templates,
    currentUser: state.currentUser!,
    agentApiUrl: state.settings.agentApiUrl,
  }));

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  // FIX: Initialize useRef with null and update the type to allow null.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup effect to abort fetch on unmount (when the modal closes)
  useEffect(() => {
    return () => {
      // FIX: Provide a reason for aborting the fetch call to satisfy the method's signature and prevent a type error.
      abortControllerRef.current?.abort('Modal closed');
    };
  }, []);
  
  const selectedDevices = useMemo(() => {
    return devices.filter(d => selectedDeviceIds.includes(d.id));
  }, [devices, selectedDeviceIds]);

  const selectedTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId);
  }, [templates, selectedTemplateId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) {
        toast.error('请选择一个要部署的模板。');
        return;
    }
    
    setIsLoading(true);
    const toastId = toast.loading(`正在向 ${selectedDeviceIds.length} 台设备部署模板...`);
    
    abortControllerRef.current = new AbortController();
    const timeout = 90000; // 90 seconds, as AI analysis can be slow.

    const timeoutId = setTimeout(() => {
      abortControllerRef.current?.abort('Request timed out');
    }, timeout);

    try {
        const url = createApiUrl(agentApiUrl!, '/api/bulk-deploy');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Actor-Username': currentUser.username
            },
            body: JSON.stringify({
                template_id: selectedTemplateId,
                device_ids: selectedDeviceIds,
            }),
            signal: abortControllerRef.current.signal,
        });

        clearTimeout(timeoutId);

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || '部署失败，代理返回错误。');
        }

        if (result.failures && result.failures.length > 0) {
            toast.error(
                () => (
                    <div className="text-sm">
                        <p className="font-bold mb-2">{result.message}</p>
                        <ul className="list-disc list-inside">
                            {result.failures.map((f: string, i: number) => <li key={i}>{f}</li>)}
                        </ul>
                    </div>
                ),
                { id: toastId, duration: 10000 }
            );
        } else {
            toast.success(result.message, { id: toastId });
        }
        onDeploymentComplete();

    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('Fetch aborted, likely due to timeout or component unmount.');
          toast(`部署操作已取消或超时 (超过 ${timeout / 1000} 秒)。`, {
              id: toastId,
              icon: 'ℹ️',
          });
        } else {
          const msg = error instanceof Error ? error.message : '未知错误';
          toast.error(`部署失败: ${msg}`, { id: toastId });
        }
    } finally {
        setIsLoading(false);
        // FIX: Assign null to match the updated ref type.
        abortControllerRef.current = null;
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-text-100">批量部署配置模板</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none" disabled={isLoading}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
                <label htmlFor="template-select" className="block text-sm font-medium text-text-300 mb-2">第一步：选择一个模板</label>
                <select
                    id="template-select"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                    <option value="" disabled>-- 请选择 --</option>
                    {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </div>
            {selectedTemplate && (
                <div>
                    <label className="block text-sm font-medium text-text-300 mb-2">模板内容预览</label>
                    <textarea
                        value={selectedTemplate.content}
                        readOnly
                        className="w-full h-32 bg-bg-950 border border-bg-700 rounded-md p-2 font-mono text-xs text-text-400"
                    />
                     <p className="text-xs text-text-400 mt-1">
                        提示: 模板中的 <code className="bg-bg-800 px-1 rounded">{`{{...}}`}</code> 动态变量将在部署时自动替换。
                    </p>
                </div>
            )}
            <div>
                 <p className="text-sm font-medium text-text-300 mb-2">第二步：确认目标设备 ({selectedDevices.length})</p>
                 <div className="max-h-32 overflow-y-auto bg-bg-950 rounded-md border border-bg-700 p-2 space-y-1">
                    {selectedDevices.map(d => (
                        <p key={d.id} className="text-xs text-text-400 font-mono">{d.name} ({d.ipAddress})</p>
                    ))}
                 </div>
            </div>
            <div className="text-xs text-yellow-400 bg-yellow-900/50 p-2 rounded-md">
                <strong>警告:</strong> 此操作将在每台选定设备的链上创建一个新的配置区块，并将模板内容作为其最新配置。这是一个不可逆的操作。
            </div>
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end items-center gap-4">
              <button 
                  type="button"
                  onClick={onClose} 
                  className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors"
                  disabled={isLoading}
              >
                  取消
              </button>
              <button 
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-bg-600 w-32 flex justify-center"
                  disabled={!selectedTemplateId || isLoading}
              >
                  {isLoading ? <Loader /> : '确认部署'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkDeployModal;
