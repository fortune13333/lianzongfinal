import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../utils/apiUtils';
import Loader from './Loader';
import { useStore } from '../store/useStore';

interface LoginProps {
  // All props removed and replaced by useStore hook
}

const ChainIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const Login: React.FC<LoginProps> = () => {
  const { login, agentApiUrl } = useStore(state => ({
    login: state.login,
    agentApiUrl: state.settings.agentApiUrl,
  }));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentAgentUrl, setCurrentAgentUrl] = useState(agentApiUrl || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setCurrentAgentUrl(agentApiUrl || '');
  }, [agentApiUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgentUrl.trim()) {
      toast.error('代理 API 地址不能为空。');
      return;
    }
    setIsLoading(true);

    try {
      const url = createApiUrl(currentAgentUrl, '/api/login');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: '认证失败，请检查代理地址是否正确。' }));
        throw new Error(errData.detail || '用户名或密码无效。');
      }
      const data = await response.json();
      // Store JWT token in sessionStorage
      sessionStorage.setItem('chaintrace_token', data.access_token);
      login(data.user, currentAgentUrl);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '发生未知错误。';
        toast.error(`登录失败: ${errorMessage}`, { duration: 5000 });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-bg-900 border border-bg-800 p-8 rounded-lg shadow-2xl">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-4 mb-4">
            <ChainIcon />
            <div>
                <h1 className="text-3xl font-bold text-text-100 tracking-tight">链踪</h1>
                <p className="text-md text-text-400">网络配置守护者</p>
            </div>
        </div>
        <p className="text-text-300">请登录以继续</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label 
            htmlFor="username" 
            className="block text-sm font-medium text-text-300 mb-2"
          >
            用户名
          </label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-bg-950 border border-bg-700 rounded-md p-3 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required
            autoComplete="username"
            disabled={isLoading}
          />
        </div>
        <div>
          <label 
            htmlFor="password" 
            className="block text-sm font-medium text-text-300 mb-2"
          >
            密码
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-bg-950 border border-bg-700 rounded-md p-3 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required
            autoComplete="current-password"
            disabled={isLoading}
          />
        </div>
         <div>
          <label 
            htmlFor="agentUrl" 
            className="block text-sm font-medium text-text-300 mb-2"
          >
            代理 API 地址
          </label>
          <input
            type="text"
            id="agentUrl"
            value={currentAgentUrl}
            onChange={(e) => setCurrentAgentUrl(e.target.value)}
            className="w-full bg-bg-950 border border-bg-700 rounded-md p-3 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required
            placeholder="http://localhost:8000"
            disabled={isLoading}
          />
        </div>
        <div>
          <button
            type="submit"
            className="w-full flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-bg-600"
            disabled={isLoading}
          >
            {isLoading ? <Loader /> : '登录'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;