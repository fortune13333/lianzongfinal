import React, { useState, useEffect } from 'react';
import { Script } from '../types';
import { useStore } from '../store/useStore';

interface Props {
  scriptToEdit: Script | null;
  onClose: () => void;
}

const DEVICE_TYPES = [
  { value: '', label: '所有设备类型' },
  { value: 'cisco_ios', label: 'Cisco IOS' },
  { value: 'cisco_xe', label: 'Cisco XE' },
  { value: 'cisco_xr', label: 'Cisco XR' },
  { value: 'cisco_nxos', label: 'Cisco NX-OS' },
  { value: 'huawei', label: 'Huawei VRP' },
  { value: 'huawei_vrpv8', label: 'Huawei VRPv8' },
  { value: 'hp_comware', label: 'H3C/HP Comware' },
  { value: 'juniper_junos', label: 'Juniper JunOS' },
];

const ScriptEditModal: React.FC<Props> = ({ scriptToEdit, onClose }) => {
  const { createScript, updateScript } = useStore();
  const isEditing = !!scriptToEdit;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [deviceType, setDeviceType] = useState('');

  useEffect(() => {
    if (scriptToEdit) {
      setName(scriptToEdit.name);
      setDescription(scriptToEdit.description ?? '');
      setContent(scriptToEdit.content);
      setDeviceType(scriptToEdit.device_type ?? '');
    }
  }, [scriptToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    const payload: Script = {
      id: isEditing ? scriptToEdit!.id : crypto.randomUUID(),
      name: name.trim(),
      description: description.trim() || undefined,
      content: content.trim(),
      device_type: deviceType || undefined,
    };
    if (isEditing) {
      await updateScript(scriptToEdit!.id, payload);
    } else {
      await createScript(payload);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-text-100">{isEditing ? '编辑脚本' : '创建新脚本'}</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-300 mb-1">脚本名称 *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="例如：关闭未使用端口"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-300 mb-1">适用设备类型</label>
                <select
                  value={deviceType}
                  onChange={e => setDeviceType(e.target.value)}
                  className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500"
                >
                  {DEVICE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-300 mb-1">描述</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="简要描述脚本功能"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-300 mb-1">脚本内容 *</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className="w-full h-64 bg-bg-950 border border-bg-700 rounded-md p-2 font-mono text-sm text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="输入要执行的配置命令，每行一条..."
                required
              />
              <p className="text-xs text-text-400 mt-2">
                支持 Jinja2 模板语法，可引用设备属性：
                <code className="bg-bg-800 px-1 rounded mx-1">{`{{ device.name }}`}</code>
                <code className="bg-bg-800 px-1 rounded mx-1">{`{{ device.ipAddress }}`}</code>
                <code className="bg-bg-800 px-1 rounded mx-1">{`{{ device.id }}`}</code>
                <code className="bg-bg-800 px-1 rounded mx-1">{`{{ device.type }}`}</code>
              </p>
            </div>
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors">取消</button>
            <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
              {isEditing ? '保存更改' : '创建脚本'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScriptEditModal;
