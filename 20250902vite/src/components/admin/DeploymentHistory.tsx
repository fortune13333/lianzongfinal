import React, { useState } from 'react';
import { DeploymentRecord, Device } from '../../types';
import { CheckCircleSolid, XCircleSolid } from '../AIIcons';

interface DeploymentHistoryProps {
    deploymentHistory: DeploymentRecord[];
    devices: Device[];
}

const DeploymentHistory: React.FC<DeploymentHistoryProps> = ({ deploymentHistory, devices }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    
    const devicesMap = new Map(devices.map(d => [d.id, d.name]));

    if (deploymentHistory.length === 0) {
        return (
            <div className="text-center py-10 text-text-400">
                <p>没有模板部署记录。</p>
            </div>
        );
    }

    return (
        <div className="bg-bg-950/50 rounded-md">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-text-300">
                    <thead className="text-xs text-text-400 uppercase bg-bg-800/50">
                        <tr>
                            <th className="px-6 py-3">时间</th>
                            <th className="px-6 py-3">操作员</th>
                            <th className="px-6 py-3">模板</th>
                            <th className="px-6 py-3">状态</th>
                            <th className="px-6 py-3">结果摘要</th>
                            <th className="px-6 py-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deploymentHistory.map(record => (
                            <React.Fragment key={record.id}>
                                <tr className="border-b border-bg-800 hover:bg-bg-800/50">
                                    <td className="px-6 py-4 text-xs text-text-400 font-mono">{new Date(record.timestamp).toLocaleString()}</td>
                                    <td className="px-6 py-4 font-medium text-text-100">{record.operator}</td>
                                    <td className="px-6 py-4">{record.template_name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${record.status === 'Completed' ? 'bg-emerald-900 text-emerald-300' : 'bg-yellow-900 text-yellow-300'}`}>
                                            {record.status === 'Completed' ? '成功' : '部分失败'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">{record.summary}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                                            className="font-medium text-primary-400 hover:underline"
                                        >
                                            {expandedId === record.id ? '收起' : '查看详情'}
                                        </button>
                                    </td>
                                </tr>
                                {expandedId === record.id && (
                                    <tr className="bg-bg-950">
                                        <td colSpan={6} className="p-4">
                                            <div className="bg-bg-800 p-4 rounded-md">
                                                <h4 className="font-semibold text-text-200 mb-2">部署详情</h4>
                                                <ul className="space-y-2 max-h-48 overflow-y-auto">
                                                    {record.results.map((result, index) => (
                                                        <li key={index} className="flex items-start gap-3 text-xs">
                                                            {result.status === 'success' 
                                                                ? <CheckCircleSolid className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" /> 
                                                                : <XCircleSolid className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                                                            }
                                                            <div className="font-mono">
                                                                <span className="font-semibold text-text-100">{devicesMap.get(result.device_id) || result.device_id}: </span>
                                                                <span className={result.status === 'success' ? 'text-text-300' : 'text-red-400'}>{result.message}</span>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DeploymentHistory;