import React, { useState } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import TopologyView from './components/TopologyView';
import SettingsModal from './components/SettingsModal';
import DeviceEditModal from './components/DeviceEditModal';
import Login from './components/Login';
import ConfirmationModal from './components/ConfirmationModal';
import WriteStartupModal from './components/WriteStartupModal';
import { Toaster } from 'react-hot-toast';
import AIStatusBanner from './components/AIStatusBanner';
import ApiKeyInstructionsModal from './components/ApiKeyInstructionsModal';
import { useStore } from './store/useStore';
import TerminalContainer from './components/TerminalContainer';


type MainView = 'dashboard' | 'topology' | 'terminal';

const App: React.FC = () => {
  const [mainView, setMainView] = useState<MainView>('dashboard');

  const {
    currentUser,
    isLoading,
    settings,
    aiStatus,
    openApiKeyModal,
    rollbackTarget,
    cancelRollback,
    executeRollback,
    init,
    fetchData,
    openDeviceIds,
    activeDeviceId,
    setActiveDeviceTab,
    closeDeviceTab,
    devices,
    isWriteStartupModalOpen,
  } = useStore(state => ({
    currentUser: state.currentUser,
    isLoading: state.isLoading,
    settings: state.settings,
    aiStatus: state.aiStatus,
    openApiKeyModal: state.openApiKeyModal,
    rollbackTarget: state.rollbackTarget,
    cancelRollback: state.cancelRollback,
    executeRollback: state.executeRollback,
    init: state.init,
    fetchData: state.fetchData,
    openDeviceIds: state.openDeviceIds,
    activeDeviceId: state.activeDeviceId,
    setActiveDeviceTab: state.setActiveDeviceTab,
    closeDeviceTab: state.closeDeviceTab,
    devices: state.devices,
    isWriteStartupModalOpen: state.isWriteStartupModalOpen,
  }));
  
  const agentApiUrl = settings.agentApiUrl;
  const isLoadingRef = React.useRef(isLoading);
  isLoadingRef.current = isLoading;

  React.useEffect(() => {
    init();
  }, [init]);

  // When all terminal tabs are closed, return to dashboard view.
  React.useEffect(() => {
    if (openDeviceIds.length === 0 && mainView === 'terminal') {
      setMainView('dashboard');
    }
  }, [openDeviceIds.length, mainView]);

  // When a new device tab is opened, switch to terminal view automatically.
  const prevOpenCountRef = React.useRef(openDeviceIds.length);
  React.useEffect(() => {
    if (openDeviceIds.length > prevOpenCountRef.current) {
      setMainView('terminal');
    }
    prevOpenCountRef.current = openDeviceIds.length;
  }, [openDeviceIds.length]);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute('data-bg-theme', settings.bgTheme);
    // Remove hardcoded class here, we handle it in the JSX structure
    document.body.className = 'bg-bg-950 text-text-300 font-sans overflow-hidden'; 
  }, [settings.theme, settings.bgTheme]);

  React.useEffect(() => {
    if (currentUser && agentApiUrl) {
      fetchData(); // Initial fetch
      const intervalId = setInterval(() => {
        if (!document.hidden && !isLoadingRef.current) {
          fetchData(true); // Silent refresh
        }
      }, 5000);
      return () => clearInterval(intervalId);
    }
  }, [agentApiUrl, currentUser, fetchData]);
  
  // --- Background Component ---
  const BackgroundLayers = () => (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none select-none">
      {/* 1. Base Background Color (Driven by CSS variable --color-bg-950) */}
      <div className="absolute inset-0 bg-bg-950 transition-colors duration-500"></div>
      
      {/* 2. Aurora / Nebula Gradients (Only visible in Deep Space theme) */}
      {settings.bgTheme === 'deep-space' && (
        <>
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
            <div className="absolute top-[10%] right-[-10%] w-[35%] h-[35%] bg-blue-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000"></div>
            <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000"></div>
        </>
      )}
      
      {/* 3. Dot Matrix Pattern Overlay (Visible in all themes, opacity adjusted by CSS usually, but here fixed) */}
      <div className={`absolute inset-0 bg-grid-pattern ${settings.bgTheme === 'deep-space' ? 'opacity-40' : 'opacity-20'}`}></div>
    </div>
  );

  if (!currentUser) {
    return (
      <div className="h-screen w-screen flex items-center justify-center relative">
        <BackgroundLayers />
        <Toaster position="top-center" toastOptions={{ className: '!bg-bg-900/90 !text-text-100 border border-white/10 backdrop-blur-md' }} />
        <Login />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col relative">
      <BackgroundLayers />
      
      <Toaster position="top-center" toastOptions={{ className: '!bg-bg-900/90 !text-text-100 border border-white/10 backdrop-blur-md' }} />
      
      {!aiStatus.isOk && (
        <AIStatusBanner 
          message={aiStatus.message} 
          errorCode={aiStatus.code} 
          onShowInstructions={openApiKeyModal} 
        />
      )}
      
      <Header />
      
      {/* Always-visible tab bar: left fixed tabs | right device terminal tabs */}
      <div className="container mx-auto px-4 md:px-8 pt-2 flex-shrink-0">
        <div className="flex items-end gap-1 border-b border-bg-800">
          {/* Left: fixed view tabs */}
          {(['dashboard', 'topology'] as const).map(v => (
            <button
              key={v}
              onClick={() => setMainView(v)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap
                ${mainView === v
                  ? 'border-primary-500 text-primary-300 bg-bg-900/50'
                  : 'border-transparent text-text-400 hover:text-text-200 hover:bg-bg-900/30'
                }`}
            >
              {v === 'dashboard' ? '受管设备' : '网络拓扑'}
            </button>
          ))}

          {/* Divider — only when there are open terminal tabs */}
          {openDeviceIds.length > 0 && (
            <div className="w-px h-5 bg-bg-700 mx-1 self-center flex-shrink-0" />
          )}

          {/* Right: device terminal tabs */}
          {openDeviceIds.map(id => {
            const deviceName = devices.find(d => d.id === id)?.name ?? id;
            const isActive = mainView === 'terminal' && activeDeviceId === id;
            return (
              <button
                key={id}
                onClick={() => { setActiveDeviceTab(id); setMainView('terminal'); }}
                className={`group flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap max-w-[160px]
                  ${isActive
                    ? 'border-green-500 text-green-300 bg-bg-900/50'
                    : 'border-transparent text-text-400 hover:text-text-200 hover:bg-bg-900/30'
                  }`}
              >
                {isActive && <span className="text-green-400 text-xs">●</span>}
                <span className="truncate">{deviceName}</span>
                <span
                  role="button"
                  aria-label="关闭终端"
                  onClick={e => { e.stopPropagation(); closeDeviceTab(id); }}
                  className="ml-0.5 text-text-500 hover:text-red-400 leading-none flex-shrink-0"
                >
                  ×
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <main className={`container mx-auto p-4 md:p-8 flex-grow flex flex-col min-h-0 ${mainView === 'terminal' || mainView === 'topology' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* TerminalContainer stays mounted (CSS hidden) to preserve WebSocket/SSH */}
        {openDeviceIds.length > 0 && (
          <div className={`flex-grow flex flex-col min-h-0 ${mainView === 'terminal' ? '' : 'hidden'}`}>
            <TerminalContainer />
          </div>
        )}
        {mainView === 'topology' && <TopologyView />}
        {mainView === 'dashboard' && <Dashboard />}
      </main>
      
      <SettingsModal />
      <DeviceEditModal />
      
      {rollbackTarget && (
        <ConfirmationModal
          isOpen={!!rollbackTarget} 
          onClose={cancelRollback} 
          onConfirm={executeRollback}
          title="确认回滚操作" 
          confirmText="确认回滚" 
          confirmButtonVariant="warning"
        >
          <p className="text-sm text-text-300">
            您确定要将设备 <strong className="font-bold text-white">{rollbackTarget.data.deviceId}</strong> 的配置回滚到 <strong className="font-bold text-white">版本 {rollbackTarget.data.version}</strong> 吗？
          </p>
          <p className="mt-2 text-xs text-text-400">
            此操作将在区块链上创建一个新的配置记录，而不是删除历史记录。
          </p>
        </ConfirmationModal>
      )}
      
      {isWriteStartupModalOpen && <WriteStartupModal />}
      <ApiKeyInstructionsModal />
    </div>
  );
};

export default App;