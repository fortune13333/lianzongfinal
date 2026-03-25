import React, { useState, useEffect } from 'react';
import { AppSettings, AIServiceSettings, BackendSettings } from '../types';
import Loader from './Loader';
import { CheckCircleSolid, XCircleSolid } from './AIIcons';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import { useStore } from '../store/useStore';
import { hasPermission, ATOMIC_PERMISSIONS } from '../utils/permissions';


interface SettingsModalProps {
  // All props removed and replaced by useStore hook
}

type ActiveTab = 'agent' | 'appearance' | 'ai';

const ACCENT_THEMES = [
    { name: 'cyan', color: '#06b6d4', label: '默认青色' },
    { name: 'emerald', color: '#059669', label: '翡翠绿' },
    { name: 'amber', color: '#d97706', label: '琥珀黄' },
    { name: 'violet', color: '#7c3aed', label: '紫罗兰' },
    { name: 'rose', color: '#f43f5e', label: '玫瑰红' },
];

const DARK_BG_THEMES = [
    { name: 'zinc', label: '深空锌' },
    { name: 'slate', label: '午夜石板' },
    { name: 'stone', label: '暖调岩石' },
];

const LIGHT_BG_THEMES = [
    { name: 'polaris', label: 'GitHub Light' },
    { name: 'sky', label: 'Catppuccin Latte' },
    { name: 'mint', label: 'One Light' },
    { name: 'lavender', label: 'Solarized Light' },
];

// New Special Theme
const SPECIAL_BG_THEMES = [
    { name: 'deep-space', label: '🌌 深空/星云' },
];


const AppearanceSettings: React.FC<{
    settings: AppSettings;
    onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}> = ({ settings, onUpdateSettings }) => {
    return (
        <div className="space-y-6">
            <div className="bg-bg-950/50 p-4 rounded-md">
                <h4 className="font-semibold text-text-200 mb-2">强调色</h4>
                <p className="text-sm text-text-400 mb-4">
                    选择一个您喜欢的主题色，它将应用于应用内的按钮、高亮和重点元素。
                </p>
                <div className="flex flex-wrap gap-4">
                    {ACCENT_THEMES.map(theme => (
                        <div key={theme.name} className="flex flex-col items-center gap-2">
                            <button
                                onClick={() => onUpdateSettings({ theme: theme.name })}
                                className={`w-12 h-12 rounded-full transition-all duration-200 ${settings.theme === theme.name ? 'ring-2 ring-offset-2 ring-offset-bg-900 ring-text-100' : ''}`}
                                style={{ backgroundColor: theme.color }}
                                aria-label={`选择 ${theme.label} 主题`}
                            />
                            <span className={`text-xs ${settings.theme === theme.name ? 'text-text-100 font-semibold' : 'text-text-400'}`}>
                                {theme.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
             <div className="bg-bg-950/50 p-4 rounded-md">
                <h4 className="font-semibold text-text-200 mb-2">背景主题</h4>
                <p className="text-sm text-text-400 mb-4">
                    选择一个基础背景色调，以适应您的视觉偏好。
                </p>
                 <div className="space-y-6">
                    <div>
                        <h5 className="text-xs font-bold text-text-400 uppercase tracking-wider mb-2">深色主题</h5>
                        <div className="flex flex-wrap gap-3">
                            {DARK_BG_THEMES.map(theme => (
                                <button
                                    key={theme.name}
                                    onClick={() => onUpdateSettings({ bgTheme: theme.name })}
                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors border ${settings.bgTheme === theme.name ? 'bg-primary-600 text-white border-transparent' : 'bg-bg-800 border-bg-700 text-text-300 hover:bg-bg-700'}`}
                                    aria-label={`选择 ${theme.label} 背景`}
                                >
                                    {theme.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h5 className="text-xs font-bold text-text-400 uppercase tracking-wider mb-2">浅色主题</h5>
                        <div className="flex flex-wrap gap-3">
                            {LIGHT_BG_THEMES.map(theme => (
                                <button
                                    key={theme.name}
                                    onClick={() => onUpdateSettings({ bgTheme: theme.name })}
                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors border ${settings.bgTheme === theme.name ? 'bg-primary-600 text-white border-transparent' : 'bg-bg-800 border-bg-700 text-text-300 hover:bg-bg-700'}`}
                                    aria-label={`选择 ${theme.label} 背景`}
                                >
                                    {theme.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h5 className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2">限定主题 (Beta)</h5>
                        <div className="flex flex-wrap gap-3">
                            {SPECIAL_BG_THEMES.map(theme => (
                                <button
                                    key={theme.name}
                                    onClick={() => onUpdateSettings({ bgTheme: theme.name })}
                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all border relative overflow-hidden ${settings.bgTheme === theme.name ? 'bg-indigo-900 text-white border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-bg-800 border-bg-700 text-text-300 hover:bg-bg-700'}`}
                                    aria-label={`选择 ${theme.label} 背景`}
                                >
                                    <span className="relative z-10">{theme.label}</span>
                                    {settings.bgTheme === theme.name && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 animate-pulse"></div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


const AISettingSection: React.FC<{
  title: string;
  description: string;
  settings: AIServiceSettings;
  onUpdate: (newAISettings: AIServiceSettings) => void;
  isGloballyDisabled?: boolean;
}> = ({ title, description, settings, onUpdate, isGloballyDisabled = false }) => {
  const isDisabled = isGloballyDisabled;
  return (
    <div className={`space-y-4 transition-opacity ${isDisabled ? 'opacity-50' : ''}`}>
      <div className="bg-bg-950/50 p-4 rounded-md">
        <div className="flex items-center justify-between">
          <label htmlFor={`${title}-toggle`} className={`flex flex-col pr-4 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <span className="font-semibold text-text-200">{title}</span>
            <span className="text-sm text-text-400">{description}</span>
          </label>
          <div className="relative inline-flex items-center flex-shrink-0">
            <input
              type="checkbox"
              id={`${title}-toggle`}
              className="sr-only peer"
              checked={settings.enabled && !isDisabled}
              onChange={(e) => onUpdate({ ...settings, enabled: e.target.checked })}
              disabled={isDisabled}
            />
            <div className="w-11 h-6 bg-bg-700 rounded-full peer peer-focus:ring-4 peer-focus:ring-primary-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </div>
        </div>
      </div>
      {(settings.enabled && !isDisabled) && (
        <div className="bg-bg-950/50 p-4 rounded-md">
          <h4 className="font-semibold text-text-200 mb-2">自定义服务接口</h4>
          <p className="text-sm text-text-400 mb-3">
            （可选）输入一个自定义的API端点。如果留空，将默认使用 Google Gemini。
          </p>
          <input
            type="text"
            placeholder="https://your-api.com/endpoint"
            value={settings.apiUrl || ''}
            onChange={(e) => onUpdate({ ...settings, apiUrl: e.target.value })}
            className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          />
        </div>
      )}
    </div>
  );
};


const AgentSettingsSection: React.FC<{
    settings: AppSettings;
    onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
    onAddAgentUrlToHistory: (url: string) => void;
}> = ({ settings, onUpdateSettings, onAddAgentUrlToHistory }) => {
    const [localAgentUrl, setLocalAgentUrl] = useState(settings.agentApiUrl || '');
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failure'>('idle');

    useEffect(() => {
        setLocalAgentUrl(settings.agentApiUrl || '');
    }, [settings.agentApiUrl]);

    const handleTestConnection = async () => {
        if (!localAgentUrl) {
            toast.error('代理API地址不能为空。');
            setTestStatus('failure');
            return;
        }
        setTestStatus('testing');
        try {
            const url = createApiUrl(localAgentUrl, '/api/health');
            const response = await fetch(url, { method: 'GET' });
            if (!response.ok) {
                throw new Error(`网络响应错误: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            if (data && data.status === 'ok') {
                setTestStatus('success');
                toast.success('代理连接成功！');
                onUpdateSettings({ agentApiUrl: localAgentUrl });
                onAddAgentUrlToHistory(localAgentUrl);
            } else {
                throw new Error('来自代理的响应无效');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知网络错误';
            toast.error(`代理连接测试失败: ${errorMessage}。请检查代理程序是否正在运行且地址正确。`);
            setTestStatus('failure');
        }
    };

    return (
        <div className="bg-bg-950/50 p-4 rounded-md">
            <h4 className="font-semibold text-text-200 mb-2">本地代理接口</h4>
            <p className="text-sm text-text-400 mb-3">
                输入本地代理的API地址以连接真实设备，实现配置的获取与推送。
            </p>
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    placeholder="http://localhost:8000"
                    value={localAgentUrl}
                    onChange={(e) => {
                        setLocalAgentUrl(e.target.value);
                        setTestStatus('idle');
                    }}
                    onBlur={() => onUpdateSettings({ agentApiUrl: localAgentUrl })}
                    className="flex-grow bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    list="agent-history"
                />
                 <datalist id="agent-history">
                    {settings.agentUrlHistory.map((url) => (
                        <option key={url} value={url} />
                    ))}
                </datalist>
                <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testStatus === 'testing'}
                    className="flex-shrink-0 bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-3 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-wait"
                >
                    测试连接
                </button>
            </div>
            <div className="mt-2 h-5 flex items-center gap-2 text-xs">
                {testStatus === 'testing' && <><Loader /> <span className="text-text-400">正在测试...</span></>}
                {testStatus === 'success' && <><CheckCircleSolid className="h-4 w-4 text-emerald-500" /> <span className="text-emerald-400">连接成功！</span></>}
                {testStatus === 'failure' && <><XCircleSolid className="h-4 w-4 text-red-500" /> <span className="text-red-400">连接失败。</span></>}
            </div>
            <p className="text-xs text-text-500 mt-2">
                代理需提供 `GET /api/health`, `GET /api/device/:id/config` 和 `POST /api/device/:id/config` 接口。
            </p>
        </div>
    );
};

const SettingsModal: React.FC<SettingsModalProps> = () => {
  const { 
    isOpen, close, settings, backendSettings, 
    updateSettings, updateBackendAISettings, addAgentUrlToHistory, currentUser 
  } = useStore(state => ({
    isOpen: state.isSettingsModalOpen,
    close: state.closeSettingsModal,
    settings: state.settings,
    backendSettings: state.backendSettings,
    updateSettings: state.updateSettings,
    updateBackendAISettings: state.updateBackendAISettings,
    addAgentUrlToHistory: state.addAgentUrlToHistory,
    currentUser: state.currentUser!
  }));

  const [activeTab, setActiveTab] = useState<ActiveTab>('appearance');
  
  const canChangeSystemSettings = hasPermission(currentUser, ATOMIC_PERMISSIONS.SYSTEM_SETTINGS);

  if (!isOpen) return null;

  const handleAIUpdate = (key: keyof AppSettings['ai'], newAISettings: AIServiceSettings) => {
    updateSettings({
        ai: {
            ...settings.ai,
            [key]: newAISettings,
        }
    })
  };

  const TabButton: React.FC<{ tabId: ActiveTab; children: React.ReactNode }> = ({ tabId, children }) => (
    <button
      onClick={() => setActiveTab(tabId)}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tabId ? 'bg-primary-600 text-white' : 'text-text-300 hover:bg-bg-800'}`}
    >
      {children}
    </button>
  );

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div 
        className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-bg-700 flex justify-between items-center">
          <h2 id="settings-dialog-title" className="text-xl font-bold text-text-100">应用设置</h2>
          <button onClick={close} className="text-text-400 hover:text-text-100 text-3xl leading-none" aria-label="关闭">&times;</button>
        </div>
        
        <div className="flex flex-wrap border-b border-bg-700 bg-bg-950/30 p-2 gap-2">
            <TabButton tabId="appearance">外观</TabButton>
            <TabButton tabId="agent">本地代理</TabButton>
            <TabButton tabId="ai">AI 设置</TabButton>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
            {activeTab === 'appearance' && (
                <AppearanceSettings
                    settings={settings}
                    onUpdateSettings={updateSettings}
                />
            )}
            {activeTab === 'ai' && (
                <div className="space-y-6">
                    {canChangeSystemSettings && (
                        <div>
                            <h3 className="text-lg font-bold text-text-100 mb-2">后端 AI 服务 (全局)</h3>
                            <p className="text-sm text-text-400 mb-4">此设置为全局生效，将影响所有用户。更改将被记录到审计日志。</p>
                            <div className="bg-bg-950/50 p-4 rounded-md space-y-4">
                                <div className="flex items-center justify-between">
                                <label htmlFor="backend-ai-toggle" className="flex flex-col cursor-pointer pr-4">
                                    <span className="font-semibold text-text-200">启用后端 AI 智能分析</span>
                                    <span className="text-sm text-text-400">在提交配置时，由后端AI进行合规审计与智能分析。</span>
                                </label>
                                <div className="relative inline-flex items-center flex-shrink-0">
                                    <input
                                    type="checkbox"
                                    id="backend-ai-toggle"
                                    className="sr-only peer"
                                    checked={backendSettings.is_ai_analysis_enabled}
                                    onChange={(e) => updateBackendAISettings({ ...backendSettings, is_ai_analysis_enabled: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-bg-700 rounded-full peer peer-focus:ring-4 peer-focus:ring-primary-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                                </div>
                                </div>

                                <div className="border-t border-bg-700 pt-4">
                                     <label className="flex flex-col pr-4">
                                        <span className="font-semibold text-text-200">“断连自动审计”中的AI分析模式</span>
                                        <span className="text-sm text-text-400 mt-1">当用户意外断开连接时，系统如何处理AI分析。</span>
                                    </label>
                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-center">
                                            <input type="radio" id="auto-audit-best-effort" name="auto-audit-mode" value="best_effort"
                                                checked={backendSettings.auto_audit_ai_analysis_mode === 'best_effort' || !backendSettings.auto_audit_ai_analysis_mode}
                                                onChange={(e) => updateBackendAISettings({ ...backendSettings, auto_audit_ai_analysis_mode: e.target.value as any })}
                                                className="h-4 w-4 bg-bg-800 border-bg-600 text-primary-600 focus:ring-primary-500" />
                                            <label htmlFor="auto-audit-best-effort" className="ml-2 block text-sm text-text-200">尽力而为 (推荐)</label>
                                        </div>
                                         <p className="text-xs text-text-500 ml-6">尝试进行AI分析，若失败则跳过但依然保存快照。</p>

                                        <div className="flex items-center">
                                            <input type="radio" id="auto-audit-disabled" name="auto-audit-mode" value="disabled"
                                                checked={backendSettings.auto_audit_ai_analysis_mode === 'disabled'}
                                                onChange={(e) => updateBackendAISettings({ ...backendSettings, auto_audit_ai_analysis_mode: e.target.value as any })}
                                                className="h-4 w-4 bg-bg-800 border-bg-600 text-primary-600 focus:ring-primary-500" />
                                            <label htmlFor="auto-audit-disabled" className="ml-2 block text-sm text-text-200">完全禁用</label>
                                        </div>
                                        <p className="text-xs text-text-500 ml-6">始终跳过AI分析，只记录原始配置，以节约资源。</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <h3 className="text-lg font-bold text-text-100 mb-2">前端 AI 工具 (个人)</h3>
                        <p className="text-sm text-text-400 mb-4">这些是辅助您个人工作的客户端工具，不影响其他用户。</p>
                        <AISettingSection 
                            title="AI 命令生成"
                            description="在配置编辑区启用 AI 助手，通过自然语言生成配置命令。"
                            settings={settings.ai.commandGeneration}
                            onUpdate={(newAISettings) => handleAIUpdate('commandGeneration', newAISettings)}
                        />
                         <div className="mt-4">
                            <AISettingSection 
                                title="AI 配置体检"
                                description="启用 AI 对当前配置进行全面的健康和安全审计。"
                                settings={settings.ai.configCheck}
                                onUpdate={(newAISettings) => handleAIUpdate('configCheck', newAISettings)}
                            />
                        </div>
                    </div>
                </div>
            )}
            {activeTab === 'agent' && (
                <AgentSettingsSection 
                    settings={settings} 
                    onUpdateSettings={updateSettings}
                    onAddAgentUrlToHistory={addAgentUrlToHistory}
                />
            )}
        </div>

        <div className="p-4 border-t border-bg-700 text-right bg-bg-900/80 backdrop-blur-sm">
            <button 
                onClick={close} 
                className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
                完成
            </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;