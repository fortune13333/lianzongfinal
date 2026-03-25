import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { toast } from 'react-hot-toast';
import Loader from './Loader';

const WriteStartupModal: React.FC = () => {
    const { 
        isWriteStartupModalOpen, 
        writeStartupDeviceId, 
        closeWriteStartupModal, 
        executeWriteStartup 
    } = useStore(state => ({
        isWriteStartupModalOpen: state.isWriteStartupModalOpen,
        writeStartupDeviceId: state.writeStartupDeviceId,
        closeWriteStartupModal: state.closeWriteStartupModal,
        executeWriteStartup: state.executeWriteStartup,
    }));
    
    const [token, setToken] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token.trim()) {
            toast.error('令牌不能为空。');
            return;
        }
        setIsLoading(true);
        await executeWriteStartup(writeStartupDeviceId!, token.trim());
        setIsLoading(false);
        // The modal will be closed by the store action on success/failure
    };

    if (!isWriteStartupModalOpen || !writeStartupDeviceId) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
            onClick={closeWriteStartupModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="write-startup-dialog-title"
        >
            <div 
                className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-md"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-bg-700 flex justify-between items-center">
                    <h2 id="write-startup-dialog-title" className="text-xl font-bold text-text-100">写入启动配置</h2>
                    <button onClick={closeWriteStartupModal} className="text-text-400 hover:text-text-100 text-3xl leading-none" aria-label="关闭">&times;</button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-text-300">
                            这是一个高危操作。为确保安全，请输入一个由管理员生成的一次性审批令牌以继续。
                        </p>
                        <div>
                            <label htmlFor="write-token" className="block text-sm font-medium text-text-300 mb-2">一次性审批令牌</label>
                            <input 
                                type="text" 
                                id="write-token"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                className="w-full bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                placeholder="在此输入令牌"
                                required
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div className="p-4 border-t border-bg-700 flex justify-end items-center gap-4">
                        <button 
                            type="button"
                            onClick={closeWriteStartupModal} 
                            className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors"
                            disabled={isLoading}
                        >
                            取消
                        </button>
                        <button 
                            type="submit"
                            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-md transition-colors w-36 flex justify-center"
                            disabled={isLoading}
                        >
                            {isLoading ? <Loader /> : '确认并写入'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default WriteStartupModal;
