import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Block, SessionUser, Policy, Device } from '../types';
import { verifyChain } from '../utils/crypto';
import { joinDeviceSessionAPI, getActiveSessionsAPI, leaveDeviceSessionAPI } from '../utils/session';
import HistoryItem from './HistoryItem';
import BlockDetailsModal from './BlockDetailsModal';
import VerificationModal, { VerificationResult } from './VerificationModal';
import { CheckCircleIcon } from './AIIcons';
import InteractiveTerminal from './InteractiveTerminal';

interface DeviceDetailsProps {
  device: Device;
  isActive: boolean;
}

const AppliedPolicies: React.FC<{ appliedPolicyIds: string[], allPolicies: Policy[] }> = ({ appliedPolicyIds, allPolicies }) => {
    const policies = useMemo(() => {
        const policyMap = new Map(allPolicies.map(p => [p.id, p]));
        return appliedPolicyIds.map(id => policyMap.get(id)).filter(Boolean) as Policy[];
    }, [appliedPolicyIds, allPolicies]);

    if (policies.length === 0) {
        return (
            <div className="text-xs text-text-500 italic">
                未应用任何合规策略。
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            {policies.map(policy => (
                <span key={policy.id} className="text-xs font-medium bg-bg-800 text-text-300 px-2 py-1 rounded-full">
                    {policy.name}
                </span>
            ))}
        </div>
    );
};


const DeviceDetails: React.FC<DeviceDetailsProps> = ({ device, isActive }) => {
  const {
    blockchains,
    currentUser,
    settings,
    policies,
    promptRollback,
  } = useStore(state => ({
    blockchains: state.blockchains,
    currentUser: state.currentUser!,
    settings: state.settings,
    policies: state.policies,
    promptRollback: state.promptRollback,
  }));

  const [isVerifying, setIsVerifying] = useState(false);
  
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [activeSessions, setActiveSessions] = useState<SessionUser[]>([]);
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const deviceChain = useMemo(() => blockchains[device.id] || [], [blockchains, device.id]);

  useEffect(() => {
    if (!isActive || !settings.agentApiUrl) return;
    
    const deviceId = device.id;
    const agentApiUrl = settings.agentApiUrl;
    
    const sessionHeartbeat = async () => {
      try {
        await joinDeviceSessionAPI(deviceId, currentUser.username, sessionId, agentApiUrl);
        const sessions = await getActiveSessionsAPI(deviceId, agentApiUrl);
        setActiveSessions(sessions);
      } catch (error) {
        console.error("Session heartbeat failed:", error);
      }
    };

    sessionHeartbeat();
    const intervalId = setInterval(sessionHeartbeat, 3000);

    return () => {
      clearInterval(intervalId);
      if (agentApiUrl && deviceId && sessionId) {
        leaveDeviceSessionAPI(deviceId, sessionId, agentApiUrl);
      }
    };
  }, [isActive, device.id, sessionId, currentUser.username, settings.agentApiUrl]);


  const handleVerifyChain = async () => {
    const chain = blockchains[device.id];
    if (!chain) return;

    setIsVerificationModalOpen(true);
    setIsVerifying(true);
    setVerificationResults(chain.map(block => ({ index: block.index, status: 'pending' })));

    await verifyChain(chain, (index, status, details) => {
      setVerificationResults(prev => prev.map(r => r.index === index ? { ...r, status, details } : r));
    });
    
    setIsVerifying(false);
  };
  
  const handleSelectBlock = (block: Block) => {
    setSelectedBlock(block);
  };

  const otherSessions = activeSessions.filter(s => s.sessionId !== sessionId);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ display: isActive ? 'flex' : 'none' }}>
      {/* Top section with headers. It will not grow. */}
      <div className="flex-shrink-0 flex justify-between items-center mb-4">
          <div>
              <h2 className="text-3xl font-bold text-text-100">{device.name}</h2>
              <p className="text-text-400 font-mono">{device.ipAddress} ({device.type})</p>
              {otherSessions.length > 0 && (
                  <div className="mt-2 text-xs text-amber-400 animate-pulse">
                      同时查看: {otherSessions.map(s => s.username).join(', ')}
                  </div>
              )}
          </div>
          <div className="flex items-center gap-2">
              <button
                  onClick={handleVerifyChain}
                  className="flex items-center gap-2 text-sm bg-bg-800 hover:bg-bg-700 text-text-100 font-bold py-2 px-3 rounded-md transition-colors"
                  aria-label="验证链完整性"
              >
                  <CheckCircleIcon />
                  <span>验证链完整性</span>
              </button>
          </div>
      </div>
      
      {/* Main content layout that grows to fill remaining space, now using a horizontal grid */}
      <div className="flex-grow grid grid-cols-10 gap-6 min-h-0">
        
        {/* History Section: takes 4/10 of available space */}
        <div className="col-span-4 flex flex-col min-h-0 bg-bg-900 rounded-lg shadow-md border border-bg-800">
            <h3 className="flex-shrink-0 text-xl font-semibold text-text-200 border-b border-bg-800 p-4">
                配置历史 ({deviceChain.length})
            </h3>

            <div className="flex-shrink-0 p-4 border-b border-bg-800">
              <h4 className="text-xs font-semibold text-text-400 uppercase tracking-wider mb-2">应用的合规策略</h4>
              <AppliedPolicies appliedPolicyIds={device.policyIds || []} allPolicies={policies} />
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 space-y-4 min-h-0">
                {deviceChain.slice().reverse().map((block, index) => (
                    <HistoryItem
                    key={block.hash}
                    block={block}
                    isLatest={index === 0}
                    onSelectBlock={() => handleSelectBlock(block)}
                    onRollback={() => promptRollback(block)}
                    />
                ))}
            </div>
        </div>
        
        {/* Terminal Section: takes 6/10 of available space */}
        <div className="col-span-6 flex flex-col min-h-0">
          <InteractiveTerminal device={device} sessionId={sessionId} />
        </div>
      </div>
      
      {/* Modals */}
      {selectedBlock && (
        <BlockDetailsModal 
            block={selectedBlock}
            prevConfig={deviceChain.find(b => b.index === selectedBlock.index - 1)?.data.config || ''}
            onClose={() => setSelectedBlock(null)}
        />
      )}
      {isVerificationModalOpen && (
        <VerificationModal 
            results={verificationResults}
            chain={deviceChain}
            isVerifying={isVerifying}
            onClose={() => setIsVerificationModalOpen(false)}
        />
      )}
    </div>
  );
};

export default DeviceDetails;