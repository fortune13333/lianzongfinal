import React, { useState, useEffect } from 'react';
import { User, ConfigTemplate } from '../types';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';

interface TemplateEditModalProps {
  templateToEdit: ConfigTemplate | null;
  currentUser: User;
  agentApiUrl?: string;
  onClose: () => void;
  onSave: () => void;
}

const TemplateEditModal: React.FC<TemplateEditModalProps> = ({ templateToEdit, currentUser, agentApiUrl, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const isEditing = !!templateToEdit;

  useEffect(() => {
    if (isEditing) {
      setName(templateToEdit.name);
      setContent(templateToEdit.content);
    }
  }, [templateToEdit, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      toast.error('模板名称和内容均不能为空。');
      return;
    }

    const toastId = toast.loading(isEditing ? '正在更新模板...' : '正在创建模板...');
    
    const payload = {
        id: isEditing ? templateToEdit.id : crypto.randomUUID(),
        name: name.trim(),
        content: content.trim(),
    };
    
    try {
        const url = isEditing
            ? createApiUrl(agentApiUrl!, `/api/templates/${templateToEdit.id}`)
            : createApiUrl(agentApiUrl!, '/api/templates');
        
        const response = await apiFetch(url, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: '代理返回了未知错误。' }));
            throw new Error(errorData.detail);
        }

        toast.success(isEditing ? '模板更新成功！' : '模板创建成功！', { id: toastId });
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
          <h2 className="text-xl font-bold text-text-100">{isEditing ? '编辑配置模板' : '创建新配置模板'}</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label htmlFor="templateName" className="block text-sm font-medium text-text-300 mb-2">模板名称</label>
              <input 
                type="text" 
                id="templateName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="例如 '标准交换机端口安全配置'"
                required
              />
            </div>
             <div>
              <label htmlFor="templateContent" className="block text-sm font-medium text-text-300 mb-2">配置内容</label>
              <textarea
                id="templateContent"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-64 bg-bg-950 border border-bg-700 rounded-md p-2 font-mono text-sm text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="在此处输入模板配置..."
                required
              />
              <div className="mt-2 p-3 bg-bg-800 rounded-md border border-bg-700">
                <p className="text-xs font-semibold text-text-300 mb-2">Jinja2 模板语法支持：</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-400">
                  <div><code className="text-primary-400">{`{{ device.name }}`}</code> — 设备名称</div>
                  <div><code className="text-primary-400">{`{{ device.id }}`}</code> — 设备 ID</div>
                  <div><code className="text-primary-400">{`{{ device.ipAddress }}`}</code> — 设备 IP</div>
                  <div><code className="text-primary-400">{`{{ device.type }}`}</code> — 设备类型</div>
                </div>
                <div className="mt-2 space-y-1 text-xs text-text-500">
                  <div>条件：<code className="text-yellow-400">{`{% if device.type == 'Router' %}...{% endif %}`}</code></div>
                  <div>循环：<code className="text-yellow-400">{`{% for item in list %}...{% endfor %}`}</code></div>
                  <div>注释：<code className="text-yellow-400">{`{# 这是注释 #}`}</code></div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-bg-700 flex justify-end items-center gap-4">
              <button 
                  type="button"
                  onClick={onClose} 
                  className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors"
              >
                  取消
              </button>
              <button 
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
              >
                  {isEditing ? '保存更改' : '创建模板'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TemplateEditModal;