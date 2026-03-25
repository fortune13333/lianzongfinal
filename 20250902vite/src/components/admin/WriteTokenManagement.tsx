import React, { useState } from 'react';
import { WriteToken } from '../../types';
import { toast } from 'react-hot-toast';
import { useStore } from '../../store/useStore';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import { PlusIcon, ClipboardIcon } from '../AIIcons';
import Loader from '../Loader';

interface WriteTokenManagementProps {
    tokens: WriteToken[];
}

const WriteTokenManagement: React.FC<WriteTokenManagementProps> = ({ tokens }) => {
    const { currentUser, agentApiUrl, fetchData } = useStore(state => ({
        currentUser: state.currentUser!,
        agentApiUrl: state.settings.agentApiUrl,
        fetchData: state.fetchData
    }));
    const [isLoading, setIsLoading] = useState(false);

    const handleGenerateToken = async () => {
        setIsLoading(true);
        const toastId = toast.loading('正在生成令牌...');
        try {
            const url = createApiUrl(agentApiUrl!, '/api/write-tokens');
            const response = await apiFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: '代理返回错误。' }));
                throw new Error(errorData.detail);
            }
            const newToken = await response.json();
            toast.success(
                (t) => (
                    <div className="flex flex-col gap-2">
                        <span>新令牌已生成！</span>
                        <div className="flex items-center gap-2 p-1 bg-bg-700 rounded-md">
                            <code className="text-primary-300 font-mono text-sm">{newToken.token_value}</code>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(newToken.token_value);
                                    toast.success('已复制到剪贴板！', { id: t.id });
                                }}
                            >
                                <ClipboardIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                ), 
                { id: toastId, duration: 10000 }
            );
            fetchData(true);
        } catch (error) {
            const msg = error instanceof Error ? error.message : "未知错误。";
            toast.error(`生成失败: ${msg}`, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="bg-bg-950/50 rounded-md">
            <div className="p-4 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-text-200">启动配置写入令牌</h3>
                    <p className="text-sm text-text-400 mt-1">管理员可在此生成一次性的、有效期为15分钟的令牌，用于授权写入启动配置操作。</p>
                </div>
                <button 
                    onClick={handleGenerateToken} 
                    disabled={isLoading}
                    className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-3 rounded-md w-36 justify-center"
                >
                    {isLoading ? <Loader /> : <><PlusIcon /> 生成新令牌</>}
                </button>
            </div>
            <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-sm text-left text-text-300">
                    <thead className="text-xs text-text-400 uppercase bg-bg-800/50 sticky top-0">
                        <tr>
                            <th className="px-6 py-3">令牌值</th>
                            <th className="px-6 py-3">状态</th>
                            <th className="px-6 py-3">创建者</th>
                            <th className="px-6 py-3">创建时间</th>
                            <th className="px-6 py-3">过期时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tokens.map(token => (
                            <tr key={token.id} className="border-b border-bg-800 hover:bg-bg-800/50">
                                <td className="px-6 py-4 font-mono text-primary-400">{token.token_value}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${token.is_used ? 'bg-bg-700 text-text-400' : 'bg-emerald-900 text-emerald-300'}`}>
                                        {token.is_used ? '已使用' : '未使用'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-medium">{token.created_by_admin}</td>
                                <td className="px-6 py-4 text-xs text-text-400">{new Date(token.created_at).toLocaleString()}</td>
                                <td className="px-6 py-4 text-xs text-text-400">{new Date(token.expires_at).toLocaleString()}</td>
                            </tr>
                        ))}
                         {tokens.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-text-500">没有令牌记录。</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WriteTokenManagement;
