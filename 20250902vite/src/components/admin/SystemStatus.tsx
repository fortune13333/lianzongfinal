import React, { useState, useEffect } from 'react';
import { AppSettings, SessionUser } from '../../types';
import { createApiUrl } from '../../utils/apiUtils';
import Loader from '../Loader';

interface SystemStatusProps {
    settings: AppSettings;
}

interface AgentHealth {
    status: string;
    version: string;
    mode: 'live' | 'simulation';
}

const SystemStatus: React.FC<SystemStatusProps> = ({ settings }) => {
    const [agentHealth, setAgentHealth] = useState<AgentHealth | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<SessionUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!settings.agentApiUrl) {
            setIsLoading(false);
            return;
        }

        const fetchStatus = async () => {
            try {
                // Fetch health and online users in parallel
                const [healthResponse, usersResponse] = await Promise.all([
                    fetch(createApiUrl(settings.agentApiUrl!, '/api/health')),
                    fetch(createApiUrl(settings.agentApiUrl!, '/api/sessions'))
                ]);

                if (healthResponse.ok) {
                    const healthData = await healthResponse.json();
                    setAgentHealth(healthData);
                }

                if (usersResponse.ok) {
                    const usersData = await usersResponse.json();
                    setOnlineUsers(usersData);
                }
            } catch (error) {
                console.error("Failed to fetch system status:", error);
                setAgentHealth(null); // Clear data on error
                setOnlineUsers([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStatus();
        const intervalId = setInterval(fetchStatus, 5000); // Refresh every 5 seconds

        return () => clearInterval(intervalId);
    }, [settings.agentApiUrl]);

    const renderInfoCard = (title: string, value: React.ReactNode, valueClass: string = 'text-white') => (
        <div className="bg-zinc-950/50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-zinc-400 mb-1">{title}</h4>
            <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
        </div>
    );
    
    if (isLoading) {
        return <div className="flex justify-center items-center p-8"><Loader /></div>;
    }
    
    if (!settings.agentApiUrl) {
        return <div className="text-center text-zinc-500">请先在主设置中配置代理API地址。</div>
    }

    return (
        <div className="space-y-6">
            <div>
                <h4 className="text-lg font-semibold text-zinc-300 mb-3">代理信息</h4>
                {agentHealth ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {renderInfoCard('状态', agentHealth.status === 'ok' ? '运行中' : '离线', agentHealth.status === 'ok' ? 'text-emerald-400' : 'text-red-400')}
                        {renderInfoCard('版本', agentHealth.version)}
                        {renderInfoCard('模式', agentHealth.mode === 'live' ? '真实模式' : '模拟模式', agentHealth.mode === 'live' ? 'text-cyan-400' : 'text-yellow-400')}
                        {renderInfoCard('在线用户', onlineUsers.length, 'text-white')}
                    </div>
                ) : (
                     <div className="text-center text-red-400 bg-red-900/50 p-4 rounded-md">无法连接到代理服务。</div>
                )}
            </div>

             <div>
                <h4 className="text-lg font-semibold text-zinc-300 mb-3">当前在线用户</h4>
                <div className="bg-zinc-950/50 p-4 rounded-lg max-h-60 overflow-y-auto">
                    {onlineUsers.length > 0 ? (
                        <ul className="divide-y divide-zinc-800">
                            {onlineUsers.map(user => (
                                <li key={user.sessionId} className="py-2 flex justify-between items-center">
                                    <span className="font-semibold text-zinc-200">{user.username}</span>
                                    <span className="text-xs text-zinc-500 font-mono">会话ID: ...{user.sessionId.slice(-8)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-zinc-500 py-4">当前没有用户在线。</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SystemStatus;