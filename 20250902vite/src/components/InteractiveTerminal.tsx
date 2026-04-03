import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { toast } from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { createApiUrl } from '../utils/apiUtils';
import { apiFetch } from '../utils/apiFetch';
import { geminiService } from '../services/geminiService';
import { getAIFailureMessage } from '../utils/errorUtils';
import Loader from './Loader';
import ConfigCheckReportModal from './ConfigCheckReportModal';
import { PlusIcon, MinusIcon, BrainIcon, SparklesIcon, ClipboardIcon } from './AIIcons';
import { Device } from '../types';

interface AICommandAssistantProps {
  onInsert: (text: string) => void;
  device: Device;
}

const AICommandAssistant: React.FC<AICommandAssistantProps> = ({ onInsert, device }) => {
    const { settings } = useStore(state => ({
        settings: state.settings,
    }));
    const [prompt, setPrompt] = useState('');
    const [generatedCommands, setGeneratedCommands] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            toast.error('请输入您的指令。');
            return;
        }
        setIsLoading(true);
        // Do not clear previous commands here, keep them visible while loading
        const toastId = toast.loading('AI 正在生成命令...');
        try {
            // First, fetch the current config for context
            const configUrl = createApiUrl(settings.agentApiUrl!, `/api/device/${device.id}/running-config`);
            const configResponse = await apiFetch(configUrl);
            if (!configResponse.ok) throw new Error('获取设备当前配置失败。');
            const { config: currentConfig } = await configResponse.json();

            // Then, call the generation service
            const commands = await geminiService.generateConfigFromPrompt(prompt, device, currentConfig);
            
            if (commands && commands.trim()) {
                setGeneratedCommands(commands);
                toast.success('AI 命令已生成！', { id: toastId });
            } else {
                setGeneratedCommands(''); // Clear any previous commands
                toast.error('AI 未能生成有效命令，请尝试调整您的问题或指令。', { id: toastId });
            }
        } catch (error) {
            toast.error(`生成失败: ${getAIFailureMessage(error)}`, { id: toastId });
            // Do not clear commands on failure, so user can see what was there before
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCopy = () => {
        navigator.clipboard.writeText(generatedCommands);
        toast.success('已复制到剪贴板！');
    };

    const handleInsert = () => {
        if(generatedCommands) {
            onInsert(generatedCommands);
        }
    };

    return (
        <div className="bg-bg-900/50 p-3 border-t border-bg-800">
            <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-primary-400 flex-shrink-0" />
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="用自然语言描述您的配置需求..."
                    className="flex-grow bg-bg-950 border border-bg-700 rounded-md p-2 text-sm text-text-200 focus:ring-2 focus:ring-primary-500"
                    disabled={isLoading}
                />
                <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md transition-colors disabled:opacity-50 w-28 flex justify-center"
                >
                    {isLoading ? <Loader /> : '生成命令'}
                </button>
            </div>
            {generatedCommands && (
                <div className="mt-2">
                    <textarea
                        readOnly
                        value={generatedCommands}
                        className="w-full h-24 bg-bg-950 border border-bg-700 rounded-md p-2 font-mono text-xs text-text-400"
                    />
                    <div className="flex justify-end gap-2 mt-1">
                        <button onClick={handleCopy} className="flex items-center gap-1 text-xs bg-bg-700 hover:bg-bg-600 px-2 py-1 rounded-md"><ClipboardIcon className="h-4 w-4" /> 复制</button>
                        <button onClick={handleInsert} className="text-xs bg-bg-700 hover:bg-bg-600 px-2 py-1 rounded-md">插入到终端</button>
                    </div>
                </div>
            )}
        </div>
    );
};


interface InteractiveTerminalProps {
  device: Device;
  sessionId: string;
}

const InteractiveTerminal: React.FC<InteractiveTerminalProps> = ({ device, sessionId }) => {
    const { currentUser, settings, saveSessionAndAudit } = useStore(state => ({
        currentUser: state.currentUser!,
        settings: state.settings,
        saveSessionAndAudit: state.saveSessionAndAudit,
    }));

    const terminalRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef<number>(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intentionalDisconnectRef = useRef<boolean>(false);
    const MAX_RECONNECT_ATTEMPTS = 5;

    const [isDirty, setIsDirty] = useState(false);
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [fontSize, setFontSize] = useState(16);
    const [isAiChecking, setIsAiChecking] = useState(false);
    const [configCheckReport, setConfigCheckReport] = useState('');
    const [isConfigCheckModalOpen, setIsConfigCheckModalOpen] = useState(false);
    const [showAiAssistant, setShowAiAssistant] = useState(false);

    // --- Add beforeunload listener for dirty state ---
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (isDirty) {
                event.preventDefault();
                event.returnValue = ''; // Required for legacy browsers
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isDirty]);

    // Terminal Initialization
    useEffect(() => {
        if (terminalRef.current && !termRef.current) {
            const term = new Terminal({
                cursorBlink: true,
                convertEol: true,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: fontSize,
                theme: {
                    background: '#09090b', 
                    foreground: '#d4d4d8', 
                    cursor: 'rgb(var(--color-primary-400))',
                    selectionBackground: '#3f3f46',
                },
                allowProposedApi: true,
            });
            const fitAddon = new FitAddon();
            
            termRef.current = term;
            fitAddonRef.current = fitAddon;
            
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            fitAddon.fit();

            // The onKey handler for Enter is removed. All keys are now sent directly.
            term.onData((data) => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    // This is now the single point of truth for sending data.
                    // The backend is responsible for all interception logic.
                    wsRef.current.send(data);
                }
            });
        }
        
        const resizeObserver = new ResizeObserver(() => {
            fitAddonRef.current?.fit();
        });
        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current.parentElement!);
        }

        return () => {
            resizeObserver.disconnect();
            intentionalDisconnectRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            wsRef.current?.close();
        };
    }, []); 

    // Handle Font Size Changes
    useEffect(() => {
        if (termRef.current) {
            termRef.current.options.fontSize = fontSize;
            fitAddonRef.current?.fit();
        }
    }, [fontSize]);

    const connect = useCallback(() => {
        if (wsRef.current || !settings.agentApiUrl) return;
        
        setStatus('connecting');
        setIsDirty(false); // Reset dirty state on new connection
        termRef.current?.reset();
        termRef.current?.writeln('\x1b[1;33m正在连接到设备...\x1b[0m');

        const wsToken = sessionStorage.getItem('chaintrace_token') || '';
        const wsPathWithAuth = `/ws/${device.id}/${sessionId}?token=${encodeURIComponent(wsToken)}`;
        const wsUrl = createApiUrl(settings.agentApiUrl, wsPathWithAuth).replace(/^http/, 'ws');
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('connected');
            reconnectAttemptsRef.current = 0;
            intentionalDisconnectRef.current = false;
            termRef.current?.focus();
        };

        ws.onmessage = (event) => {
            const data = event.data;
            // Check for special "is_dirty" signal from backend
            if (data === '\x01IS_DIRTY\x02') {
                setIsDirty(true);
            } else {
                termRef.current?.write(data);
            }
        };

        ws.onerror = (event) => {
            console.error("WebSocket Error:", event);
            setStatus('error');
            termRef.current?.writeln('\r\n\x1b[1;31mWebSocket 连接错误。请检查代理服务和网络连接。\x1b[0m');
        };

        ws.onclose = (event) => {
            wsRef.current = null;
            // 认证失败 (1008) 或主动断开 → 不重连
            if (event.code === 1008 || intentionalDisconnectRef.current) {
                setStatus('disconnected');
                termRef.current?.writeln(event.code === 1008
                    ? '\r\n\x1b[1;31m认证失败，请重新登录。\x1b[0m'
                    : '\r\n\x1b[1;34m连接已关闭。\x1b[0m');
                return;
            }
            // 意外断开 → 指数退避自动重连
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current += 1;
                const delay = Math.min(Math.pow(2, reconnectAttemptsRef.current) * 1000, 30000);
                setStatus('connecting');
                termRef.current?.writeln(
                    `\r\n\x1b[1;33m连接意外断开，${Math.round(delay / 1000)} 秒后自动重试 ` +
                    `(第 ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS} 次)...\x1b[0m`
                );
                reconnectTimerRef.current = setTimeout(() => {
                    reconnectTimerRef.current = null;
                    connect();
                }, delay);
            } else {
                setStatus('disconnected');
                termRef.current?.writeln(
                    `\r\n\x1b[1;31m已达最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，请手动重连。\x1b[0m`
                );
                reconnectAttemptsRef.current = 0;
            }
        };
    }, [device.id, sessionId, settings.agentApiUrl, currentUser.username]);

    const disconnect = useCallback(() => {
        intentionalDisconnectRef.current = true;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        wsRef.current?.close();
    }, []);

    const handleSaveAndAudit = async () => {
        await saveSessionAndAudit(device.id, sessionId);
        setIsDirty(false); // Reset dirty state on successful save
    };

    const handleInsertCommand = (text: string) => {
        if (termRef.current && status === 'connected') {
            const command = text.endsWith('\n') ? text : text + '\n';
            // Use term.paste() to simulate a user paste. This will correctly
            // trigger the onData event and send the data through the standard
            // processing pipeline, making it compatible with the stateful backend.
            termRef.current.paste(command);
        } else {
            toast.error("无法插入命令：终端未连接。");
        }
    };
    
    const handleConfigCheck = async () => {
        setIsAiChecking(true);
        const toastId = toast.loading('正在从设备获取配置以进行分析...');
        try {
            const url = createApiUrl(settings.agentApiUrl!, `/api/device/${device.id}/running-config`);
            const response = await apiFetch(url);

            if (!response.ok) {
                const error = await response.json().catch(() => ({detail: '未知错误'}));
                throw new Error(error.detail);
            }
            const data = await response.json();
            
            toast.loading('AI 正在分析配置...', { id: toastId });
            
            const report = await geminiService.checkConfiguration(data.config, device);
            setConfigCheckReport(report);
            setIsConfigCheckModalOpen(true);
            toast.success('AI 配置体检完成！', { id: toastId });
        } catch(error) {
            toast.error(`操作失败: ${getAIFailureMessage(error)}`, { id: toastId });
        } finally {
            setIsAiChecking(false);
        }
    };

    const isConnected = status === 'connected';

    return (
        <div className="bg-bg-950 rounded-lg shadow-lg flex flex-col h-full border border-bg-800">
            <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-bg-800 bg-bg-900/70 rounded-t-lg flex-wrap gap-2">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                        <span className="text-xs font-semibold text-text-300">{isConnected ? '已连接' : '已断开'}</span>
                    </div>
                    {!isConnected ? (
                        <button onClick={connect} disabled={status === 'connecting'} className="text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-1 px-3 rounded-md transition-colors disabled:opacity-50">
                            {status === 'connecting' ? '连接中...' : '连接 SSH'}
                        </button>
                    ) : (
                        <button onClick={disconnect} className="text-sm bg-bg-700 hover:bg-bg-600 text-text-200 font-bold py-1 px-3 rounded-md transition-colors">
                            断开连接
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-text-400">字体:</span>
                        <button onClick={() => setFontSize(s => Math.max(10, s - 1))} className="p-1 rounded-md hover:bg-bg-700 disabled:opacity-50" aria-label="减小字体"><MinusIcon className="h-4 w-4" /></button>
                        <button onClick={() => setFontSize(s => Math.min(24, s + 1))} className="p-1 rounded-md hover:bg-bg-700 disabled:opacity-50" aria-label="增大字体"><PlusIcon className="h-4 w-4" /></button>
                    </div>
                     <button onClick={() => setShowAiAssistant(prev => !prev)} className={`text-sm ${showAiAssistant ? 'bg-primary-700' : 'bg-bg-700'} hover:bg-primary-700/80 text-white font-bold py-1 px-3 rounded-md transition-colors flex items-center gap-2`}>
                        <SparklesIcon className="h-4 w-4" /> AI 助手
                    </button>
                    <button onClick={handleConfigCheck} disabled={isAiChecking || !isConnected} className="text-sm bg-bg-700 hover:bg-bg-600 text-text-200 font-bold py-1 px-3 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2">
                        {isAiChecking ? <Loader /> : <><BrainIcon className="h-4 w-4" /> AI 配置体检</>}
                    </button>
                    <button 
                        onClick={handleSaveAndAudit}
                        disabled={!isConnected}
                        className="text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-1 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-36 flex justify-center"
                    >
                        保存会话并审计
                    </button>
                </div>
            </div>
            <div className="flex-grow relative overflow-hidden min-h-0">
                <div ref={terminalRef} className="absolute inset-0" />
            </div>
            {showAiAssistant && (
                <div className="flex-shrink-0">
                    <AICommandAssistant onInsert={handleInsertCommand} device={device} />
                </div>
            )}
            {isConfigCheckModalOpen && (
              <ConfigCheckReportModal 
                isOpen={isConfigCheckModalOpen}
                report={configCheckReport}
                onClose={() => setIsConfigCheckModalOpen(false)}
              />
          )}
        </div>
    );
};

export default InteractiveTerminal;