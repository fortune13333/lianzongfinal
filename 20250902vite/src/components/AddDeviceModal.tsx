import React, { useState } from 'react';
import { Device } from '../types';
import { toast } from 'react-hot-toast';
import { useStore } from '../store/useStore';

interface AddDeviceModalProps {
  // All props removed and replaced by useStore hook
}

const AddDeviceModal: React.FC<AddDeviceModalProps> = () => {
  // FIX: Use correct state property names `isDeviceModalOpen` and `closeDeviceModal` from the store.
  const { isOpen, close, addNewDevice } = useStore(state => ({
    isOpen: state.isDeviceModalOpen,
    close: state.closeDeviceModal,
    addNewDevice: state.addNewDevice,
  }));

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [type, setType] = useState<'Router' | 'Switch' | 'Firewall'>('Router');

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim() || !ipAddress.trim()) {
      toast.error('所有字段均为必填项。');
      return;
    }
    // Simple IP validation
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      toast.error('请输入有效的 IP 地址。');
      return;
    }

    await addNewDevice({ id, name, ipAddress, type });
    // The modal is now closed by the parent component (App.tsx) after a successful add.
    // We can reset the form fields here for the next time it opens.
    setId('');
    setName('');
    setIpAddress('');
    setType('Router');
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-device-dialog-title"
    >
      <div 
        className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 id="add-device-dialog-title" className="text-xl font-bold text-text-100">添加新设备</h2>
          <button onClick={close} className="text-text-400 hover:text-text-100 text-3xl leading-none" aria-label="关闭">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
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
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end items-center gap-4">
              <button 
                  type="button"
                  onClick={close} 
                  className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors"
              >
                  取消
              </button>
              <button 
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
              >
                  添加设备
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDeviceModal;