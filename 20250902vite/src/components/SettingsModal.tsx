import React, { useState, useEffect } from 'react';
import { AppSettings, AIServiceSettings, BackendSettings } from '../types';
import Loader from './Loader';
import { CheckCircleSolid, XCircleSolid } from './AIIcons';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';
import { useStore } from '../store/useStore';
import { hasPermission, ATOMIC_PERMISSIONS } from '../utils/permissions';


interface SettingsModalProps {
  // All props removed and replaced by useStore hook
}

type ActiveTab = 'agent' | 'appearance' | 'ai' | 'ldap';

// ── Preset themes (combined bg + accent) ──────────────────────────────────
type PresetTheme = { name: string; label: string; swatches: [string, string, string] };

const DARK_PRESETS: PresetTheme[] = [
    { name: 'proton-purple', label: 'Proton Purple',  swatches: ['#0d0b1a', '#8b5cf6', '#2dd4bf'] },
    { name: 'ocean-deep',    label: 'Ocean Deep',     swatches: ['#060d1a', '#22d3ee', '#06b6d4'] },
    { name: 'volcanic',      label: 'Volcanic',       swatches: ['#0f0902', '#fb923c', '#f59e0b'] },
    { name: 'starry-indigo', label: 'Starry Indigo',  swatches: ['#080c22', '#818cf8', '#6366f1'] },
    { name: 'aurora-green',  label: 'Aurora Green',   swatches: ['#051410', '#2dd4bf', '#22c55e'] },
    { name: 'oled-black',    label: 'OLED Black',     swatches: ['#000000', '#22d3ee', '#22c55e'] },
    { name: 'cyberpunk',     label: 'Cyberpunk',      swatches: ['#0f0520', '#ec4899', '#22d3ee'] },
    { name: 'forest-night',  label: 'Forest Night',   swatches: ['#0a1209', '#22c55e', '#4ade80'] },
    { name: 'midnight-gold', label: 'Midnight Gold',  swatches: ['#0f0d08', '#f59e0b', '#fbbf24'] },
    { name: 'rose-gold',     label: 'Rose Gold',      swatches: ['#1a0810', '#fb7185', '#fbbf24'] },
    { name: 'night-violet',  label: 'Night Violet',   swatches: ['#08091e', '#a78bfa', '#818cf8'] },
];

const LIGHT_PRESETS: PresetTheme[] = [
    { name: 'pure-white',    label: 'Pure White',     swatches: ['#f5f5f5', '#8b5cf6', '#22c55e'] },
    { name: 'warm-orange',   label: 'Warm Orange',    swatches: ['#fffbf5', '#fb923c', '#f59e0b'] },
    { name: 'sakura-pink',   label: 'Sakura Pink',    swatches: ['#fff0f5', '#ec4899', '#f472b6'] },
    { name: 'mint-fresh',    label: 'Mint Fresh',     swatches: ['#f0fdf5', '#10b981', '#06b6d4'] },
    { name: 'sky-blue',      label: 'Sky Blue',       swatches: ['#f0f9ff', '#38bdf8', '#0ea5e9'] },
    { name: 'lavender-mist', label: 'Lavender',       swatches: ['#f5f3ff', '#a78bfa', '#818cf8'] },
];

// Classic manual themes (bg + accent chosen independently)
const ACCENT_THEMES = [
    { name: 'cyan',    color: '#06b6d4', label: '默认青色' },
    { name: 'emerald', color: '#059669', label: '翡翠绿' },
    { name: 'amber',   color: '#d97706', label: '琥珀黄' },
    { name: 'violet',  color: '#7c3aed', label: '紫罗兰' },
    { name: 'rose',    color: '#f43f5e', label: '玫瑰红' },
];
const CLASSIC_BG_THEMES = [
    { name: 'zinc',       label: '深空锌',       dark: true },
    { name: 'slate',      label: '午夜石板',     dark: true },
    { name: 'stone',      label: '暖调岩石',     dark: true },
    { name: 'deep-space', label: '🌌 深空/星云', dark: true },
    { name: 'polaris',    label: 'GitHub Light', dark: false },
    { name: 'sky',        label: 'Catppuccin',   dark: false },
    { name: 'mint',       label: 'One Light',    dark: false },
    { name: 'lavender',   label: 'Solarized',    dark: false },
];

const ALL_PRESET_NAMES = new Set([...DARK_PRESETS, ...LIGHT_PRESETS].map(t => t.name));

// ── Swatch dot component ───────────────────────────────────────────────────
const Swatch: React.FC<{ color: string }> = ({ color }) => (
    <span className="w-4 h-4 rounded-sm flex-shrink-0 border border-black/10" style={{ backgroundColor: color }} />
);

const AppearanceSettings: React.FC<{
    settings: AppSettings;
    onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}> = ({ settings, onUpdateSettings }) => {
    const isPreset = ALL_PRESET_NAMES.has(settings.bgTheme);
    const [showClassic, setShowClassic] = React.useState(!isPreset);

    const selectPreset = (name: string) => {
        onUpdateSettings({ bgTheme: name, theme: '' });
        setShowClassic(false);
    };

    const PresetCard: React.FC<{ theme: PresetTheme }> = ({ theme }) => {
        const active = settings.bgTheme === theme.name;
        return (
            <button
                onClick={() => selectPreset(theme.name)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left
                    ${active
                        ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500'
                        : 'border-bg-700 bg-bg-800 hover:bg-bg-700 hover:border-bg-600'
                    }`}
            >
                <div className="flex gap-1 flex-shrink-0">
                    {theme.swatches.map((c, i) => <Swatch key={i} color={c} />)}
                </div>
                <span className={`text-xs font-medium truncate ${active ? 'text-primary-300' : 'text-text-300'}`}>
                    {theme.label}
                </span>
                {active && <span className="ml-auto text-primary-400 text-xs flex-shrink-0">✓</span>}
            </button>
        );
    };

    return (
        <div className="space-y-5">
            {/* Dark presets */}
            <div className="bg-bg-950/50 p-4 rounded-md">
                <h4 className="text-xs font-bold text-text-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    🌙 暗色主题
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    {DARK_PRESETS.map(t => <PresetCard key={t.name} theme={t} />)}
                </div>
            </div>

            {/* Light presets */}
            <div className="bg-bg-950/50 p-4 rounded-md">
                <h4 className="text-xs font-bold text-text-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    ☀️ 亮色主题
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    {LIGHT_PRESETS.map(t => <PresetCard key={t.name} theme={t} />)}
                </div>
            </div>

            {/* Classic custom section */}
            <div className="bg-bg-950/50 rounded-md overflow-hidden">
                <button
                    onClick={() => setShowClassic(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-800/50 transition-colors"
                >
                    <span className="text-xs font-bold text-text-400 uppercase tracking-wider">🎨 自定义配色</span>
                    <span className="text-text-500 text-sm">{showClassic ? '▲' : '▼'}</span>
                </button>
                {showClassic && (
                    <div className="px-4 pb-4 space-y-4 border-t border-bg-800">
                        <div className="pt-3">
                            <p className="text-xs text-text-500 mb-3">自由组合强调色与背景，不受预设限制。</p>
                            <div className="flex flex-wrap gap-3 mb-4">
                                {ACCENT_THEMES.map(t => (
                                    <div key={t.name} className="flex flex-col items-center gap-1">
                                        <button
                                            onClick={() => onUpdateSettings({ theme: t.name, bgTheme: ALL_PRESET_NAMES.has(settings.bgTheme) ? 'zinc' : settings.bgTheme })}
                                            className={`w-10 h-10 rounded-full transition-all ${!isPreset && settings.theme === t.name ? 'ring-2 ring-offset-2 ring-offset-bg-900 ring-text-100' : ''}`}
                                            style={{ backgroundColor: t.color }}
                                            aria-label={t.label}
                                        />
                                        <span className="text-xs text-text-500">{t.label}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {CLASSIC_BG_THEMES.map(t => (
                                    <button
                                        key={t.name}
                                        onClick={() => onUpdateSettings({ bgTheme: t.name })}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors
                                            ${!isPreset && settings.bgTheme === t.name
                                                ? 'bg-primary-600 text-white border-transparent'
                                                : 'bg-bg-800 border-bg-700 text-text-300 hover:bg-bg-700'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
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

interface LdapConfig {
    enabled: boolean;
    server: string;
    port: number;
    base_dn: string;
    bind_dn: string;
    bind_password: string;
    user_search_filter: string;
    use_ssl: boolean;
}

const DEFAULT_LDAP: LdapConfig = {
    enabled: false,
    server: '',
    port: 389,
    base_dn: '',
    bind_dn: '',
    bind_password: '',
    user_search_filter: '(sAMAccountName={username})',
    use_ssl: false,
};

const LdapSettings: React.FC = () => {
    const agentApiUrl = useStore(state => state.settings.agentApiUrl);
    const [config, setConfig] = useState<LdapConfig>(DEFAULT_LDAP);
    const [loading, setLoading] = useState(true);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failure'>('idle');
    const [testMessage, setTestMessage] = useState('');

    useEffect(() => {
        if (!agentApiUrl) { setLoading(false); return; }
        const fetchConfig = async () => {
            try {
                const res = await apiFetch(createApiUrl(agentApiUrl, '/api/settings/ldap'));
                if (res.ok) setConfig({ ...DEFAULT_LDAP, ...(await res.json()) });
            } catch { /* keep defaults */ } finally { setLoading(false); }
        };
        fetchConfig();
    }, [agentApiUrl]);

    const handleSave = async () => {
        const toastId = toast.loading('正在保存 LDAP 配置...');
        try {
            const res = await apiFetch(createApiUrl(agentApiUrl!, '/api/settings/ldap'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (!res.ok) throw new Error((await res.json()).detail || '保存失败');
            toast.success('LDAP 配置已保存。', { id: toastId });
        } catch (e) {
            toast.error(`保存失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
        }
    };

    const handleTest = async () => {
        setTestStatus('testing');
        setTestMessage('');
        try {
            const res = await apiFetch(createApiUrl(agentApiUrl!, '/api/settings/ldap/test'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            const data = await res.json();
            if (res.ok) { setTestStatus('success'); setTestMessage(data.message || '连接成功'); }
            else { setTestStatus('failure'); setTestMessage(data.detail || '连接失败'); }
        } catch (e) {
            setTestStatus('failure');
            setTestMessage(e instanceof Error ? e.message : '网络错误');
        }
    };

    const inputCls = 'w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm';

    if (loading) return <div className="flex justify-center py-8"><Loader /></div>;

    return (
        <div className="space-y-4">
            <div className="bg-bg-950/50 p-4 rounded-md">
                <div className="flex items-center justify-between">
                    <label htmlFor="ldap-enabled" className="flex flex-col cursor-pointer pr-4">
                        <span className="font-semibold text-text-200">启用 LDAP/AD 认证</span>
                        <span className="text-sm text-text-400">允许企业域账号通过 LDAP/Active Directory 登录系统。</span>
                    </label>
                    <div className="relative inline-flex items-center flex-shrink-0">
                        <input type="checkbox" id="ldap-enabled" className="sr-only peer"
                            checked={config.enabled}
                            onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} />
                        <div className="w-11 h-6 bg-bg-700 rounded-full peer peer-focus:ring-4 peer-focus:ring-primary-500/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </div>
                </div>
            </div>

            <div className="bg-bg-950/50 p-4 rounded-md space-y-3">
                <h4 className="font-semibold text-text-200 text-sm">服务器配置</h4>
                <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <label className="text-xs text-text-400 mb-1 block">LDAP 服务器地址</label>
                        <input type="text" placeholder="ldap://192.168.1.10" value={config.server}
                            onChange={e => setConfig(c => ({ ...c, server: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                        <label className="text-xs text-text-400 mb-1 block">端口</label>
                        <input type="number" placeholder="389" value={config.port}
                            onChange={e => setConfig(c => ({ ...c, port: parseInt(e.target.value) || 389 }))} className={inputCls} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input type="checkbox" id="ldap-ssl" className="w-4 h-4 bg-bg-800 border-bg-600 text-primary-600 rounded"
                        checked={config.use_ssl} onChange={e => setConfig(c => ({ ...c, use_ssl: e.target.checked }))} />
                    <label htmlFor="ldap-ssl" className="text-sm text-text-300 cursor-pointer">使用 SSL/TLS（LDAPS）</label>
                </div>
            </div>

            <div className="bg-bg-950/50 p-4 rounded-md space-y-3">
                <h4 className="font-semibold text-text-200 text-sm">绑定配置</h4>
                <div>
                    <label className="text-xs text-text-400 mb-1 block">Base DN</label>
                    <input type="text" placeholder="DC=company,DC=com" value={config.base_dn}
                        onChange={e => setConfig(c => ({ ...c, base_dn: e.target.value }))} className={`${inputCls} font-mono`} />
                </div>
                <div>
                    <label className="text-xs text-text-400 mb-1 block">Bind DN（查询账号）</label>
                    <input type="text" placeholder="CN=svc,OU=ServiceAccounts,DC=company,DC=com" value={config.bind_dn}
                        onChange={e => setConfig(c => ({ ...c, bind_dn: e.target.value }))} className={`${inputCls} font-mono`} />
                </div>
                <div>
                    <label className="text-xs text-text-400 mb-1 block">Bind 密码</label>
                    <input type="password" placeholder="••••••••" value={config.bind_password}
                        onChange={e => setConfig(c => ({ ...c, bind_password: e.target.value }))} className={inputCls} />
                </div>
                <div>
                    <label className="text-xs text-text-400 mb-1 block">用户搜索过滤器</label>
                    <input type="text" placeholder="(sAMAccountName={username})" value={config.user_search_filter}
                        onChange={e => setConfig(c => ({ ...c, user_search_filter: e.target.value }))} className={`${inputCls} font-mono`} />
                    <p className="text-xs text-text-500 mt-1">{'{username}'} 将被替换为登录时输入的用户名。</p>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={handleTest} disabled={testStatus === 'testing'}
                    className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors text-sm disabled:opacity-50">
                    {testStatus === 'testing' ? '测试中...' : '测试连接'}
                </button>
                <button onClick={handleSave}
                    className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm">
                    保存配置
                </button>
                {testStatus === 'success' && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircleSolid className="h-4 w-4" />{testMessage}</span>}
                {testStatus === 'failure' && <span className="flex items-center gap-1 text-xs text-red-400"><XCircleSolid className="h-4 w-4" />{testMessage}</span>}
            </div>
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
            {canChangeSystemSettings && <TabButton tabId="ldap">LDAP 认证</TabButton>}
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
            {activeTab === 'ldap' && canChangeSystemSettings && (
                <div>
                    <h3 className="text-lg font-bold text-text-100 mb-2">LDAP / Active Directory 认证</h3>
                    <p className="text-sm text-text-400 mb-4">配置企业 LDAP 目录服务，允许域账号直接登录。首次 LDAP 登录将自动创建操作员账号，管理员可在"用户管理"中调整其权限。</p>
                    <LdapSettings />
                </div>
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