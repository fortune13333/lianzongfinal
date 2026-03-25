import React from 'react';
import { useStore } from '../store/useStore';

const ChainIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const SettingsIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const Header: React.FC = () => {
  const currentUser = useStore(state => state.currentUser);
  const logout = useStore(state => state.logout);
  const openSettingsModal = useStore(state => state.openSettingsModal);

  return (
    <header className="bg-bg-900/70 backdrop-blur-sm shadow-lg sticky top-0 z-50 border-b border-bg-800/50">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <ChainIcon />
            <div>
                <h1 className="text-2xl font-bold text-text-100 tracking-tight">链踪</h1>
                <p className="text-sm text-text-400">网络配置守护者</p>
            </div>
        </div>
        {currentUser && (
            <div className="flex items-center gap-4">
                 <div className="text-right">
                    <span className="text-sm text-text-300">已登录为</span>
                    <span className="font-bold text-text-100 ml-2">{currentUser.username}</span>
                    <span className="text-xs text-primary-400 bg-bg-800 px-2 py-0.5 rounded-full ml-2">{currentUser.role}</span>
                </div>
                <button
                    onClick={openSettingsModal}
                    className="text-text-400 hover:text-text-100 p-2 rounded-full hover:bg-bg-700 transition-colors"
                    aria-label="打开设置"
                >
                    <SettingsIcon />
                </button>
                 <button
                    onClick={logout}
                    className="text-sm text-text-300 hover:text-red-400 bg-bg-800/50 hover:bg-red-500/20 px-3 py-2 rounded-md transition-colors"
                >
                    登出
                </button>
            </div>
        )}
      </div>
    </header>
  );
};

export default Header;