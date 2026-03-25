import React, { useState, useEffect } from 'react';
import { Device, Policy } from '../types';
import { toast } from 'react-hot-toast';
import { useStore } from '../store/useStore';

const DeviceEditModal: React.FC = () => {
  const { isOpen, deviceToEdit, allPolicies, addNewDevice, updateDevice, closeDeviceModal } = useStore(state => ({
    isOpen: state.isDeviceModalOpen,
    deviceToEdit: state.deviceToEdit,
    allPolicies: state.policies,
    addNewDevice: state.addNewDevice,
    updateDevice: state.updateDevice,
    closeDeviceModal: state.closeDeviceModal,
  }));

  const isEditing = !!deviceToEdit;
  
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [type, setType] = useState<'Router' | 'Switch' | 'Firewall'>('Router');
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (isOpen) {
        if (isEditing) {
            setId(deviceToEdit.id);
            setName(deviceToEdit.name);
            setIpAddress(deviceToEdit.ipAddress);
            setType(deviceToEdit.type);
            setSelectedPolicyIds(new Set(deviceToEdit.policyIds || []));
            setTags(deviceToEdit.tags || []);
        } else {
            setId('');
            setName('');
            setIpAddress('');
            setType('Router');
            setSelectedPolicyIds(new Set());
            setTags([]);
        }
        setTagInput('');
    }
  }, [isOpen, isEditing, deviceToEdit]);

  const handlePolicyToggle = (policyId: string) => {
      setSelectedPolicyIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(policyId)) {
              newSet.delete(policyId);
          } else {
              newSet.add(policyId);
          }
          return newSet;
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim() || !ipAddress.trim()) {
      toast.error('所有字段均为必填项。');
      return;
    }
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      toast.error('请输入有效的 IP 地址。');
      return;
    }

    const deviceData: Omit<Device, 'netmiko_device_type'> = {
        id,
        name,
        ipAddress,
        type,
        policyIds: Array.from(selectedPolicyIds),
        tags,
    };
    
    if (isEditing) {
        await updateDevice(deviceToEdit.id, deviceData);
    } else {
        await addNewDevice(deviceData);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={closeDeviceModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-dialog-title"
    >
      <div 
        className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 id="device-dialog-title" className="text-xl font-bold text-text-100">{isEditing ? '编辑设备' : '添加新设备'}</h2>
          <button onClick={closeDeviceModal} className="text-text-400 hover:text-text-100 text-3xl leading-none" aria-label="关闭">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label htmlFor="deviceId" className="block text-sm font-medium text-text-300 mb-2">设备 ID</label>
              <input 
                type="text" 
                id="deviceId"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="例如 RTR02-NYC"
                required
                disabled={isEditing}
              />
            </div>
             <div>
              <label htmlFor="deviceName" className="block text-sm font-medium text-text-300 mb-2">设备名称</label>
              <input 
                type="text" 
                id="deviceName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="例如 Core Router 2 NYC"
                required
              />
            </div>
             <div>
              <label htmlFor="deviceIp" className="block text-sm font-medium text-text-300 mb-2">IP 地址</label>
              <input 
                type="text" 
                id="deviceIp"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                 placeholder="例如 192.168.1.2"
                required
              />
            </div>
            <div>
              <label htmlFor="deviceType" className="block text-sm font-medium text-text-300 mb-2">设备类型</label>
              <select
                id="deviceType"
                value={type}
                onChange={(e) => setType(e.target.value as Device['type'])}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="Router">路由器 (Router)</option>
                <option value="Switch">交换机 (Switch)</option>
                <option value="Firewall">防火墙 (Firewall)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-300 mb-2">标签</label>
              <div className="flex flex-wrap gap-1 p-2 bg-bg-950 border border-bg-700 rounded-md min-h-[2.5rem] items-center">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 bg-primary-900/60 text-primary-300 text-xs px-2 py-0.5 rounded-full">
                    {tag}
                    <button type="button" onClick={() => setTags(p => p.filter(t => t !== tag))} className="hover:text-white leading-none">&times;</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                      e.preventDefault();
                      const t = tagInput.trim().toLowerCase();
                      if (!tags.includes(t)) setTags(p => [...p, t]);
                      setTagInput('');
                    }
                  }}
                  placeholder={tags.length === 0 ? '输入后按 Enter 添加标签...' : ''}
                  className="flex-1 min-w-[140px] bg-transparent outline-none text-text-200 text-sm placeholder-text-600"
                />
              </div>
              <p className="text-xs text-text-500 mt-1">按 Enter 或逗号键确认添加标签</p>
            </div>
             <div>
                <label className="block text-sm font-medium text-text-300 mb-2">合规策略</label>
                <div className="max-h-32 overflow-y-auto bg-bg-950 border border-bg-700 rounded-md p-3 space-y-2">
                    {allPolicies.length > 0 ? allPolicies.map(policy => (
                        <div key={policy.id} className="flex items-center">
                            <input 
                                type="checkbox"
                                id={`policy-${policy.id}`}
                                checked={selectedPolicyIds.has(policy.id)}
                                onChange={() => handlePolicyToggle(policy.id)}
                                className="h-4 w-4 rounded bg-bg-800 border-bg-600 text-primary-600 focus:ring-primary-500"
                            />
                            <label htmlFor={`policy-${policy.id}`} className="ml-3 block text-sm text-text-200">{policy.name}</label>
                        </div>
                    )) : <p className="text-sm text-text-500">没有可用的合规策略。</p>}
                </div>
             </div>
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end items-center gap-4">
              <button 
                  type="button"
                  onClick={closeDeviceModal} 
                  className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors"
              >
                  取消
              </button>
              <button 
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
              >
                  {isEditing ? '保存更改' : '添加设备'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeviceEditModal;