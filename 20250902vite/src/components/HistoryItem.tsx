import React from 'react';
import { Block } from '../types';
import { useStore } from '../store/useStore';
import { hasPermission, ATOMIC_PERMISSIONS } from '../utils/permissions';
import { SaveIcon } from './AIIcons';


interface HistoryItemProps {
  block: Block;
  isLatest: boolean;
  onSelectBlock: () => void;
  onRollback: (block: Block) => void;
}

const RollbackIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
    </svg>
);

const SnapshotIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const WarningIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);


const HistoryItem: React.FC<HistoryItemProps> = ({ block, isLatest, onSelectBlock, onRollback }) => {
  const currentUser = useStore(state => state.currentUser);
  const hasRollbackPermission = hasPermission(currentUser, ATOMIC_PERMISSIONS.ROLLBACK_EXECUTE);
  const isAutoAudit = block.data.changeType === 'auto_audit';
  const isNonCompliant = block.data.compliance_status === 'failed';
  const isStartupConfig = block.data.is_startup_config === true;

  const containerClasses = `
    p-4 rounded-lg hover:bg-bg-800 transition-all duration-200 border
    ${isStartupConfig ? 'bg-emerald-900/20 border-emerald-500/30' : 
      isNonCompliant ? 'bg-red-900/20 border-red-500/30' : 'bg-bg-800/50 border-transparent'}
  `;
  
  return (
    <div className={containerClasses}>
        <div className="flex justify-between items-start">
            <div className="flex-1 pr-4">
                <p className="font-bold text-text-100 flex items-center gap-2">
                    <span>版本 {block.data.version}</span>
                    {isStartupConfig && (
                        <span className="flex items-center gap-1 text-xs text-emerald-300 bg-emerald-900/50 px-2 py-0.5 rounded-full" title="此配置已固化至设备的启动配置中。">
                            <SaveIcon />
                            已固化
                        </span>
                    )}
                    {isNonCompliant && (
                        <span className="flex items-center gap-1 text-xs text-red-400 bg-red-900/50 px-2 py-0.5 rounded-full" title="此快照包含不合规的配置。">
                            <WarningIcon />
                            不合规
                        </span>
                    )}
                    {block.data.changeType === 'rollback' && <span className="text-xs text-yellow-400 bg-yellow-900/50 px-2 py-0.5 rounded-full">回滚点</span>}
                    {isAutoAudit && (
                        <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-900/50 px-2 py-0.5 rounded-full" title="此记录是因会话意外断开而由系统自动生成的快照。">
                            <SnapshotIcon />
                            自动快照
                        </span>
                    )}
                </p>
                <p className="text-sm text-text-300 mt-1">
                    {block.data.summary}
                </p>
                 <p className="text-xs text-text-400 mt-2">
                    <span className="font-semibold">操作员:</span> <span className="font-mono">{block.data.operator}</span>
                </p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-sm text-text-300">{new Date(block.timestamp).toLocaleString()}</p>
                <p className="font-mono text-xs text-primary-400 mt-1 truncate" title={block.hash}>
                    {block.hash.substring(0, 16)}...
                </p>
            </div>
        </div>
        <div className="mt-3 flex justify-end items-center gap-2">
            {hasRollbackPermission && !isLatest && (
                 <button
                    onClick={() => onRollback(block)}
                    disabled={isAutoAudit || isNonCompliant}
                    title={isAutoAudit ? "无法回滚至系统自动生成的快照" : isNonCompliant ? "无法回滚至一个已知不合规的版本" : ""}
                    className="flex items-center gap-1.5 text-sm bg-yellow-600/50 text-yellow-200 px-3 py-1 rounded-md hover:bg-yellow-600 hover:text-white transition-colors disabled:bg-bg-700 disabled:text-text-500 disabled:cursor-not-allowed"
                >
                    <RollbackIcon />
                    回滚至此版本
                </button>
            )}
            <button
                onClick={onSelectBlock}
                className="text-sm bg-primary-600/50 text-primary-200 px-3 py-1 rounded-md hover:bg-primary-600 hover:text-white transition-colors"
            >
                查看 AI 分析 & 详情
            </button>
        </div>
    </div>
  );
};

export default HistoryItem;