import React from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
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


const App: React.FC = () => {
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
    isWriteStartupModalOpen: state.isWriteStartupModalOpen,
  }));
  
  const agentApiUrl = settings.agentApiUrl;
  const isLoadingRef = React.useRef(isLoading);
  isLoadingRef.current = isLoading;
  
  React.useEffect(() => {
    init();
  }, [init]);

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
      
      <main className={`container mx-auto p-4 md:p-8 flex-grow flex flex-col min-h-0 ${openDeviceIds.length > 0 ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {openDeviceIds.length > 0 ? (
          <TerminalContainer />
        ) : (
          <Dashboard />
        )}
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