import React from 'react';
import { Block, ComplianceReport } from '../types';
import { BrainIcon, CheckCircleIcon, WarningShieldIcon, XCircleSolid } from './AIIcons';


interface BlockDetailsModalProps {
  block: Block;
  prevConfig: string;
  onClose: () => void;
}

const computeLCS = (oldLines: string[], newLines: string[]): number[][] => {
    const n = oldLines.length, m = newLines.length;
    const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) dp[i][j] = 1 + dp[i - 1][j - 1];
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp;
};

type DiffItem = { type: 'common' | 'added' | 'removed'; leftLine: string | null; rightLine: string | null; };

const buildDiff = (dp: number[][], oldLines: string[], newLines: string[], i: number, j: number): DiffItem[] => {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        const result = buildDiff(dp, oldLines, newLines, i - 1, j - 1);
        result.push({ type: 'common', leftLine: oldLines[i - 1], rightLine: newLines[j - 1] });
        return result;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        const result = buildDiff(dp, oldLines, newLines, i, j - 1);
        result.push({ type: 'added', leftLine: null, rightLine: newLines[j - 1] });
        return result;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        const result = buildDiff(dp, oldLines, newLines, i - 1, j);
        result.push({ type: 'removed', leftLine: oldLines[i - 1], rightLine: null });
        return result;
    } else return [];
};

const SideBySideDiffView: React.FC<{ oldConfig: string; newConfig: string; block: Block }> = ({ oldConfig, newConfig, block }) => {
    
    const diff = React.useMemo(() => {
        const validOldLines = oldConfig.trim() === '' ? [] : oldConfig.split('\n');
        const validNewLines = newConfig.trim() === '' ? [] : newConfig.split('\n');
        const dp = computeLCS(validOldLines, validNewLines);
        return buildDiff(dp, validOldLines, validNewLines, validOldLines.length, validNewLines.length);
    }, [oldConfig, newConfig]);
    
    let leftLineNum = 1, rightLineNum = 1;

    return (
        <div className="bg-bg-950 rounded-md text-xs font-mono overflow-auto max-h-[50vh] border border-bg-700">
            <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-bg-950/80 backdrop-blur-sm z-10">
                    <tr>
                        <th className="w-10 p-2 text-text-500 text-right font-normal select-none">-</th>
                        <th className="p-2 text-left font-semibold text-text-300 border-r border-bg-700">原始配置 (版本 {block.data.version - 1})</th>
                        <th className="w-10 p-2 text-text-500 text-right font-normal select-none">+</th>
                        <th className="p-2 text-left font-semibold text-text-300">新配置 (版本 {block.data.version})</th>
                    </tr>
                </thead>
                <tbody>
                    {diff.map((item, index) => {
                        const rowClass = item.type === 'removed' ? 'bg-red-900/40' : item.type === 'added' ? 'bg-emerald-900/40' : 'hover:bg-bg-800/50';
                        const leftCellClass = item.type === 'removed' ? 'bg-red-500/20' : '';
                        const rightCellClass = item.type === 'added' ? 'bg-emerald-500/20' : '';
                        const currentLeftNum = item.leftLine !== null ? leftLineNum++ : '';
                        const currentRightNum = item.rightLine !== null ? rightLineNum++ : '';
                        return (
                            <tr key={index} className={rowClass}>
                                <td className={`p-1 w-10 text-right text-text-500 select-none ${leftCellClass}`}>{currentLeftNum}</td>
                                <td className={`p-1 pr-4 whitespace-pre-wrap break-all border-r border-bg-700 ${leftCellClass}`}><span className={item.type === 'removed' ? 'text-red-300' : 'text-text-300'}>{item.leftLine ?? ' '}</span></td>
                                <td className={`p-1 w-10 text-right text-text-500 select-none ${rightCellClass}`}>{currentRightNum}</td>
                                <td className={`p-1 pl-4 whitespace-pre-wrap break-all ${rightCellClass}`}><span className={item.type === 'added' ? 'text-emerald-300' : 'text-text-300'}>{item.rightLine ?? ' '}</span></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const SecurityAssessment: React.FC<{ risks: any }> = ({ risks }) => {
    // Coerce risks to a string for robust handling. This prevents crashes if the API returns null, an array, or other non-string types.
    const risksAsString = Array.isArray(risks)
        ? risks.join('\n')
        : (risks === null || risks === undefined)
        ? '无'
        : String(risks);

    const lowerCaseRisks = risksAsString.toLowerCase();
    const hasNoRisks = ['未发现', '没有明显', '无', 'n/a', 'none'].some(term => lowerCaseRisks.includes(term));

    if (hasNoRisks) {
        return <div className="flex items-start gap-2 text-emerald-400"><CheckCircleIcon /> <p>{risksAsString}</p></div>;
    }
    
    return <div className="flex items-start gap-2 text-yellow-400"><WarningShieldIcon /> <p className="whitespace-pre-wrap">{risksAsString}</p></div>;
}

const ComplianceReportSection: React.FC<{ report: ComplianceReport }> = ({ report }) => {
    const isFailed = report.overall_status === 'failed';
    return (
        <div className={`bg-bg-950/50 p-4 rounded-md space-y-3 text-sm border ${isFailed ? 'border-red-500/30' : 'border-emerald-500/30'}`}>
            <div className="flex justify-between items-center">
                <h4 className="font-semibold text-text-300">总体状态</h4>
                <div className={`flex items-center gap-2 font-bold px-2 py-1 rounded-md text-xs ${isFailed ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                    {isFailed ? <XCircleSolid className="h-4 w-4" /> : <CheckCircleIcon />}
                    {isFailed ? '失败' : '通过'}
                </div>
            </div>
            <hr className="border-bg-700"/>
            <div>
                <h4 className="font-semibold text-text-400 mb-2">详细结果</h4>
                <div className="space-y-2">
                    {report.results.map(result => (
                        <div key={result.policy_id} className="flex items-start gap-3">
                            <div>{result.status === 'passed' ? <CheckCircleIcon /> : <XCircleSolid className="text-red-400" />}</div>
                            <div className="flex-1">
                                <p className="font-semibold text-text-300">{result.policy_name}</p>
                                <p className="text-xs text-text-400">{result.details}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
};

// FIX: Made component more robust to handle malformed `analysis` data from older rollbacks.
// It now checks for property existence before access and has a safe fallback for unknown object shapes.
const AnalysisSection: React.FC<{ content: any }> = ({ content }) => {
    if (typeof content === 'string') {
        return <p className="text-text-200 whitespace-pre-wrap">{content}</p>;
    }

    if (typeof content === 'object' && content !== null) {
        // This is the fix for existing malformed data from older rollbacks.
        // Check for the keys mentioned in the React error log.
        if ('rollback_purpose' in content && 'rollback_plan' in content) {
            const purpose = String(content.rollback_purpose);
            const plan = content.rollback_plan;
            // The plan itself could be a string or maybe an array of strings. Be safe.
            const planText = Array.isArray(plan) ? plan.join('\n') : String(plan);

            return (
                <div className="text-text-200 space-y-2">
                    <p className="whitespace-pre-wrap">{purpose}</p>
                    <div>
                        <p className="font-semibold mb-1">回滚计划 (Rollback Plan):</p>
                        <pre className="bg-bg-950 p-3 rounded-md font-mono text-sm whitespace-pre-wrap">{planText}</pre>
                    </div>
                </div>
            );
        }
        
        // Fallback for other unexpected object shapes. Let's pretty-print it.
        try {
            return <pre className="text-text-200 whitespace-pre-wrap">{JSON.stringify(content, null, 2)}</pre>;
        } catch {
            return <p className="text-text-400 italic">无法显示的分析内容 (无效对象)。</p>;
        }
    }
    
    return <p className="text-text-400 italic">无可用分析。</p>;
};


const BlockDetailsModal: React.FC<BlockDetailsModalProps> = ({ block, prevConfig, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-details-title"
    >
      <div className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 bg-bg-900/80 backdrop-blur-sm p-4 border-b border-bg-700 flex justify-between items-center z-10">
          <h2 id="block-details-title" className="text-xl font-bold text-text-100">区块 #{block.index} - 版本 {block.data.version}</h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none" aria-label="关闭">&times;</button>
        </div>
        
        <div className="flex-grow p-6 space-y-6 overflow-y-auto">
          {block.data.compliance_report && (
             <div>
                <h3 className="text-lg font-semibold text-text-300 mb-3 flex items-center gap-2"><WarningShieldIcon /> 合规性审计报告</h3>
                <ComplianceReportSection report={block.data.compliance_report} />
              </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-text-300 mb-3 flex items-center gap-2"><BrainIcon /> AI 智能分析</h3>
            <div className="bg-bg-950/50 p-4 rounded-md space-y-4 text-sm">
              <div><h4 className="font-semibold text-text-400 mb-1">变更摘要</h4><p className="text-text-200">{block.data.summary}</p></div>
              <hr className="border-bg-700"/>
              <div><h4 className="font-semibold text-text-400 mb-1">详细分析</h4><AnalysisSection content={block.data.analysis} /></div>
              <hr className="border-bg-700"/>
              <div><h4 className="font-semibold text-text-400 mb-1">安全评估</h4><SecurityAssessment risks={block.data.security_risks} /></div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-text-300 mb-3">配置差异</h3>
            <SideBySideDiffView oldConfig={prevConfig} newConfig={block.data.config} block={block}/>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-semibold text-text-300 mb-2">区块元数据</h4>
              <ul className="space-y-2 bg-bg-950/50 p-3 rounded-md">
                <li className="flex justify-between"><span className="text-text-400">时间戳:</span> <span className="text-text-200">{new Date(block.timestamp).toLocaleString()}</span></li>
                <li className="flex justify-between"><span className="text-text-400">操作员:</span> <span className="font-mono bg-bg-700 px-2 py-0.5 rounded">{block.data.operator}</span></li>
                <li className="flex justify-between"><span className="text-text-400">变更类型:</span> <span className="font-mono bg-bg-700 px-2 py-0.5 rounded">{block.data.changeType}</span></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-text-300 mb-2">链哈希值</h4>
              <ul className="space-y-2 font-mono text-xs bg-bg-950/50 p-3 rounded-md">
                <li><span className="text-text-400">当前哈希:</span> <span className="text-emerald-400 block break-all">{block.hash}</span></li>
                <li className="mt-2"><span className="text-text-400">前一哈希:</span> <span className="text-yellow-400 block break-all">{block.prev_hash}</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockDetailsModal;