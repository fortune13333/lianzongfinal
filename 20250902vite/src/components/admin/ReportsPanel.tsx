import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { createApiUrl } from '../../utils/apiUtils';
import { apiFetch } from '../../utils/apiFetch';
import { useStore } from '../../store/useStore';

const ReportsPanel: React.FC = () => {
    const { agentApiUrl, devices } = useStore(state => ({
        agentApiUrl: state.settings.agentApiUrl,
        devices: state.devices,
    }));

    const [auditStart, setAuditStart] = useState('');
    const [auditEnd, setAuditEnd] = useState('');
    const [auditLoading, setAuditLoading] = useState(false);

    const [complianceDeviceId, setComplianceDeviceId] = useState('');
    const [complianceLoading, setComplianceLoading] = useState(false);

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleExportAudit = async () => {
        if (!auditStart || !auditEnd) {
            toast.error('请选择开始和结束日期。');
            return;
        }
        setAuditLoading(true);
        const toastId = toast.loading('正在生成审计报告...');
        try {
            const url = createApiUrl(agentApiUrl!, `/api/report/audit?start=${auditStart}&end=${auditEnd}`);
            const res = await apiFetch(url);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || `服务器错误 ${res.status}`);
            }
            const blob = await res.blob();
            downloadBlob(blob, `audit_report_${auditStart}_${auditEnd}.pdf`);
            toast.success('审计报告已下载。', { id: toastId });
        } catch (e) {
            toast.error(`导出失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
        } finally {
            setAuditLoading(false);
        }
    };

    const handleExportCompliance = async () => {
        if (!complianceDeviceId) {
            toast.error('请选择一台设备。');
            return;
        }
        setComplianceLoading(true);
        const toastId = toast.loading('正在生成合规报告...');
        try {
            const url = createApiUrl(agentApiUrl!, `/api/report/compliance?device_id=${complianceDeviceId}`);
            const res = await apiFetch(url);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || `服务器错误 ${res.status}`);
            }
            const blob = await res.blob();
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            downloadBlob(blob, `compliance_${complianceDeviceId}_${today}.pdf`);
            toast.success('合规报告已下载。', { id: toastId });
        } catch (e) {
            toast.error(`导出失败: ${e instanceof Error ? e.message : '未知错误'}`, { id: toastId });
        } finally {
            setComplianceLoading(false);
        }
    };

    const inputCls = 'bg-bg-950 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm';

    return (
        <div className="space-y-6">
            {/* Audit report */}
            <div className="bg-bg-950/50 p-5 rounded-md">
                <h3 className="font-semibold text-text-100 mb-1">审计日志报告</h3>
                <p className="text-sm text-text-400 mb-4">导出指定时间范围内所有操作员的操作记录，生成带电子印章的 PDF 报告。</p>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-xs text-text-400 mb-1 block">开始日期</label>
                        <input type="date" value={auditStart} onChange={e => setAuditStart(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="text-xs text-text-400 mb-1 block">结束日期</label>
                        <input type="date" value={auditEnd} onChange={e => setAuditEnd(e.target.value)} className={inputCls} />
                    </div>
                    <button
                        onClick={handleExportAudit}
                        disabled={auditLoading}
                        className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-wait"
                    >
                        {auditLoading ? '生成中...' : '导出审计报告'}
                    </button>
                </div>
            </div>

            {/* Compliance report */}
            <div className="bg-bg-950/50 p-5 rounded-md">
                <h3 className="font-semibold text-text-100 mb-1">区块链合规检查报告</h3>
                <p className="text-sm text-text-400 mb-4">导出指定设备的区块链完整性验证结果，包含所有配置版本的哈希链校验和合规状态。</p>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-xs text-text-400 mb-1 block">选择设备</label>
                        <select
                            value={complianceDeviceId}
                            onChange={e => setComplianceDeviceId(e.target.value)}
                            className={`${inputCls} min-w-48`}
                        >
                            <option value="">-- 请选择设备 --</option>
                            {devices.map(d => (
                                <option key={d.id} value={d.id}>{d.name} ({d.ipAddress})</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleExportCompliance}
                        disabled={complianceLoading}
                        className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-wait"
                    >
                        {complianceLoading ? '生成中...' : '导出合规报告'}
                    </button>
                </div>
            </div>

            <p className="text-xs text-text-500">
                注意：PDF 报告功能需要专业版或企业版 License，且后端须在 Docker 环境中部署（WeasyPrint 依赖系统库）。
            </p>
        </div>
    );
};

export default ReportsPanel;
