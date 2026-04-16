import React, { useState, Suspense } from 'react';
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
import Loader from './components/Loader';

// Heavy components lazy-loaded to reduce initial bundle size
const TopologyView = React.lazy(() => import('./components/TopologyView'));
const TerminalContainer = React.lazy(() => import('./components/TerminalContainer'));


type MainView = 'dashboard' | 'topology' | 'terminal';

// --- Defined OUTSIDE App so the component identity is stable across re-renders.
// --- If defined inside App, every App re-render creates a new function reference,
// --- causing React to unmount+remount BackgroundLayers and reset CSS animations.
const THEME_BLOBS: Record<string, [string, string, string]> = {
  'deep-space':    ['rgba(147,51,234,0.40)',  'rgba(37,99,235,0.34)',  'rgba(6,182,212,0.30)'],
  'proton-purple': ['rgba(139,92,246,0.48)',  'rgba(79,70,229,0.38)',  'rgba(45,212,191,0.28)'],
  'ocean-deep':    ['rgba(6,182,212,0.44)',   'rgba(14,64,138,0.50)',  'rgba(20,184,166,0.32)'],
  'volcanic':      ['rgba(249,115,22,0.50)',  'rgba(220,38,38,0.38)',  'rgba(245,158,11,0.42)'],
  'starry-indigo': ['rgba(99,102,241,0.50)',  'rgba(79,70,229,0.42)',  'rgba(139,92,246,0.36)'],
  'aurora-green':  ['rgba(20,184,166,0.48)',  'rgba(34,197,94,0.38)',  'rgba(6,182,212,0.28)'],
  'oled-black':    ['rgba(34,211,238,0.28)',  'rgba(22,163,74,0.22)',  'rgba(99,102,241,0.22)'],
  'cyberpunk':     ['rgba(236,72,153,0.50)',  'rgba(34,211,238,0.42)', 'rgba(139,92,246,0.38)'],
  'forest-night':  ['rgba(34,197,94,0.48)',   'rgba(20,184,166,0.36)', 'rgba(74,222,128,0.30)'],
  'midnight-gold': ['rgba(245,158,11,0.50)',  'rgba(249,115,22,0.38)', 'rgba(251,191,36,0.36)'],
  'rose-gold':     ['rgba(251,113,133,0.50)', 'rgba(244,63,94,0.38)',  'rgba(245,158,11,0.30)'],
  'night-violet':  ['rgba(167,139,250,0.48)', 'rgba(99,102,241,0.38)', 'rgba(34,211,238,0.26)'],
};

const BackgroundLayers: React.FC<{ bgTheme: string }> = React.memo(({ bgTheme }) => {
  const blobs = THEME_BLOBS[bgTheme];
  const hasBlobs = Boolean(blobs);
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none select-none">
      <div className="absolute inset-0 bg-bg-950 transition-colors duration-500"></div>
      {hasBlobs && blobs && (
        <>
          {/* 零尺寸 wrapper 锚定屏幕中心，动画驱动 wrapper 旋转 → blob 绕屏幕中心公转 */}
          <div className="aurora-orbit-1" style={{ position: 'absolute', left: '50%', top: '50%' }}>
            <div className="aurora-blob rounded-full mix-blend-screen" style={{
              position: 'absolute', width: '60vw', height: '60vw',
              left: '-25vw', top: '-25vw', backgroundColor: blobs[0],
            }} />
          </div>
          <div className="aurora-orbit-2" style={{ position: 'absolute', left: '50%', top: '50%' }}>
            <div className="aurora-blob rounded-full mix-blend-screen" style={{
              position: 'absolute', width: '60vw', height: '60vw',
              left: '-25vw', top: '-25vw', backgroundColor: blobs[1],
            }} />
          </div>
          <div className="aurora-orbit-3" style={{ position: 'absolute', left: '50%', top: '50%' }}>
            <div className="aurora-blob rounded-full mix-blend-screen" style={{
              position: 'absolute', width: '60vw', height: '60vw',
              left: '-25vw', top: '-25vw', backgroundColor: blobs[2],
            }} />
          </div>
        </>
      )}
      <div className={`absolute inset-0 bg-grid-pattern ${hasBlobs ? 'opacity-40' : 'opacity-20'}`}></div>
    </div>
  );
});

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
    logout,
    deleteConfirmDeviceId,
    cancelDeleteDevice,
    deleteDevice,
    isResetConfirmOpen,
    cancelResetData,
    resetData,
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
    logout: state.logout,
    openDeviceIds: state.openDeviceIds,
    activeDeviceId: state.activeDeviceId,
    setActiveDeviceTab: state.setActiveDeviceTab,
    closeDeviceTab: state.closeDeviceTab,
    devices: state.devices,
    isWriteStartupModalOpen: state.isWriteStartupModalOpen,
    deleteConfirmDeviceId: state.deleteConfirmDeviceId,
    cancelDeleteDevice: state.cancelDeleteDevice,
    deleteDevice: state.deleteDevice,
    isResetConfirmOpen: state.isResetConfirmOpen,
    cancelResetData: state.cancelResetData,
    resetData: state.resetData,
  }));

  const agentApiUrl = settings.agentApiUrl;
  const isLoadingRef = React.useRef(isLoading);
  isLoadingRef.current = isLoading;

  React.useEffect(() => {
    init();
  }, [init]);

  // Listen for 401 events from apiFetch — avoids hard redirect that disrupts active use
  React.useEffect(() => {
    const handler = () => logout();
    window.addEventListener('chaintrace:unauthorized', handler);
    return () => window.removeEventListener('chaintrace:unauthorized', handler);
  }, [logout]);

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
  

  if (!currentUser) {
    return (
      <div className="h-screen w-screen flex items-center justify-center relative">
        <BackgroundLayers bgTheme={settings.bgTheme} />
        <Toaster position="top-center" toastOptions={{ className: '!bg-bg-900/90 !text-text-100 border border-white/10 backdrop-blur-md' }} />
        <Login />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col relative">
      <BackgroundLayers bgTheme={settings.bgTheme} />
      
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
            <Suspense fallback={<div className="flex-grow flex items-center justify-center"><Loader /></div>}>
              <TerminalContainer />
            </Suspense>
          </div>
        )}
        {mainView === 'topology' && (
          <Suspense fallback={<div className="flex-grow flex items-center justify-center"><Loader /></div>}>
            <TopologyView />
          </Suspense>
        )}
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
      
      {deleteConfirmDeviceId && (
        <ConfirmationModal
          isOpen={!!deleteConfirmDeviceId}
          onClose={cancelDeleteDevice}
          onConfirm={() => deleteDevice(deleteConfirmDeviceId)}
          title="确认删除设备"
          confirmText="确认删除"
          confirmButtonVariant="danger"
        >
          <p className="text-sm text-text-300">
            您确定要删除此设备及其所有历史配置记录吗？此操作不可恢复。
          </p>
        </ConfirmationModal>
      )}

      {isResetConfirmOpen && (
        <ConfirmationModal
          isOpen={isResetConfirmOpen}
          onClose={cancelResetData}
          onConfirm={resetData}
          title="确认重置数据"
          confirmText="确认重置"
          confirmButtonVariant="danger"
        >
          <p className="text-sm text-text-300">
            您确定要重置所有设备和区块链数据吗？此操作不可恢复。
          </p>
        </ConfirmationModal>
      )}

      {isWriteStartupModalOpen && <WriteStartupModal />}
      <ApiKeyInstructionsModal />
    </div>
  );
};

export default App;