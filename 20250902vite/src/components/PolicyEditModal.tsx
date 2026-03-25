import React, { useState, useEffect } from 'react';
import { User, Policy } from '../types';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';

interface PolicyEditModalProps {
  policyToEdit: Policy | null;
  currentUser: User;
  agentApiUrl?: string;
  onClose: () => void;
  onSave: () => void;
}

const PolicyEditModal: React.FC<PolicyEditModalProps> = ({ policyToEdit, currentUser, agentApiUrl, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<Policy['severity']>('medium');
  const [description, setDescription] = useState('');
  const [rule, setRule] = useState('');
  const isEditing = !!policyToEdit;

  useEffect(() => {
    if (isEditing) {
      setName(policyToEdit.name);
      setSeverity(policyToEdit.severity);
      setDescription(policyToEdit.description);
      setRule(policyToEdit.rule);
    }
  }, [policyToEdit, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !rule.trim()) {
      toast.error('策略名称、描述和规则均不能为空。');
      return;
    }

    const toastId = toast.loading(isEditing ? '正在更新策略...' : '正在创建策略...');
    
    const payload: Policy = {
        id: isEditing ? policyToEdit.id : crypto.randomUUID(),
        name: name.trim(),
        severity,
        description: description.trim(),
        rule: rule.trim(),
        enabled: isEditing ? policyToEdit.enabled : true, // Default to enabled for new policies
    };
    
    try {
        const url = isEditing
            ? createApiUrl(agentApiUrl!, `/api/policies/${policyToEdit.id}`)
            : createApiUrl(agentApiUrl!, '/api/policies');
        
        const response = await apiFetch(url, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '代理返回了未知错误。' }));
            throw new Error(errorData.detail);
        }

        toast.success(isEditing ? '策略更新成功！' : '策略创建成功！', { id: toastId });
        onSave();

    } catch (error) {
        const msg = error instanceof Error ? error.message : '未知错误。';
        toast.error(`操作失败: ${msg}`, { id: toastId });
    }
  };

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
          <h2 className="text-xl font-bold text-text-100">{isEditing ? '编辑合规策略' : '创建新合规策略'}</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="policyName" className="block text-sm font-medium text-text-300 mb-2">策略名称</label>
                    <input type="text" id="policyName" value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500"
                        placeholder="例如 '禁止使用 Telnet'" required />
                </div>
                <div>
                    <label htmlFor="policySeverity" className="block text-sm font-medium text-text-300 mb-2">严重性</label>
                    <select id="policySeverity" value={severity} onChange={(e) => setSeverity(e.target.value as Policy['severity'])}
                        className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500">
                        <option value="critical">严重 (Critical)</option>
                        <option value="high">高 (High)</option>
                        <option value="medium">中 (Medium)</option>
                        <option value="low">低 (Low)</option>
                    </select>
                </div>
            </div>
             <div>
              <label htmlFor="policyDescription" className="block text-sm font-medium text-text-300 mb-2">描述</label>
              <textarea id="policyDescription" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500"
                placeholder="简要说明此策略的目的和重要性。" required />
            </div>
             <div>
              <label htmlFor="policyRule" className="block text-sm font-medium text-text-300 mb-2">规则 (AI 可解释)</label>
              <textarea id="policyRule" value={rule} onChange={(e) => setRule(e.target.value)}  rows={3}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 font-mono text-sm text-text-200 focus:ring-2 focus:ring-primary-500"
                placeholder="例如: global.not_contains('line vty.*transport input telnet')" required />
               <p className="text-xs text-text-400 mt-2">
                输入一个AI可以理解的规则描述。AI将根据此规则文本来审计配置。
              </p>
            </div>
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end items-center gap-4">
              <button type="button" onClick={onClose} className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors">取消</button>
              <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors">{isEditing ? '保存更改' : '创建策略'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PolicyEditModal;