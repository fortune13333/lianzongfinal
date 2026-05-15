import React, { useState, useEffect } from 'react';
import { NotificationRule } from '../../types';
import { useStore } from '../../store/useStore';

interface Props {
    ruleToEdit: NotificationRule | null;
    onClose: () => void;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
    device_offline: '设备离线',
    brute_force: '暴力破解',
    compliance_fail: '合规失败',
    system_error: '系统错误',
};

const CHANNEL_LABELS: Record<string, string> = {
    email: '邮件 (SMTP)',
    wechat_work: '企业微信',
    dingtalk: '钉钉',
};

const AlertRuleModal: React.FC<Props> = ({ ruleToEdit, onClose }) => {
    const { createNotificationRule, updateNotificationRule, testNotificationRule } = useStore(
        state => ({
            createNotificationRule: state.createNotificationRule,
            updateNotificationRule: state.updateNotificationRule,
            testNotificationRule: state.testNotificationRule,
        })
    );

    const [name, setName] = useState('');
    const [eventType, setEventType] = useState('device_offline');
    const [channel, setChannel] = useState('email');
    const [isEnabled, setIsEnabled] = useState(true);

    // Email config
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState('465');
    const [senderEmail, setSenderEmail] = useState('');
    const [senderPassword, setSenderPassword] = useState('');
    const [recipientEmails, setRecipientEmails] = useState('');

    // Webhook config (WeChat / DingTalk)
    const [webhookUrl, setWebhookUrl] = useState('');
    const [dingtalkSecret, setDingtalkSecret] = useState('');

    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (ruleToEdit) {
            setName(ruleToEdit.name);
            setEventType(ruleToEdit.event_type);
            setChannel(ruleToEdit.channel);
            setIsEnabled(ruleToEdit.is_enabled);
            const cfg = ruleToEdit.channel_config || {};
            if (ruleToEdit.channel === 'email') {
                setSmtpHost(cfg.smtp_host || '');
                setSmtpPort(cfg.smtp_port || '465');
                setSenderEmail(cfg.sender_email || '');
                setSenderPassword(cfg.sender_password || '');
                setRecipientEmails(cfg.recipient_emails || '');
            } else {
                setWebhookUrl(cfg.webhook_url || '');
                setDingtalkSecret(cfg.secret || '');
            }
        } else {
            setName('');
            setEventType('device_offline');
            setChannel('email');
            setIsEnabled(true);
            setSmtpHost('');
            setSmtpPort('465');
            setSenderEmail('');
            setSenderPassword('');
            setRecipientEmails('');
            setWebhookUrl('');
            setDingtalkSecret('');
        }
    }, [ruleToEdit]);

    const buildChannelConfig = (): string => {
        if (channel === 'email') {
            return JSON.stringify({
                smtp_host: smtpHost,
                smtp_port: parseInt(smtpPort) || 465,
                sender_email: senderEmail,
                sender_password: senderPassword,
                recipient_emails: recipientEmails,
            });
        }
        if (channel === 'dingtalk') {
            const cfg: Record<string, string> = { webhook_url: webhookUrl };
            if (dingtalkSecret) cfg.secret = dingtalkSecret;
            return JSON.stringify(cfg);
        }
        return JSON.stringify({ webhook_url: webhookUrl });
    };

    const isValid = (): boolean => {
        if (!name.trim()) return false;
        if (channel === 'email') {
            return !!smtpHost.trim() && !!senderEmail.trim() && !!senderPassword.trim() && !!recipientEmails.trim();
        }
        return !!webhookUrl.trim();
    };

    const handleSave = async () => {
        if (!isValid()) return;
        setSaving(true);
        const payload: NotificationRule = {
            id: ruleToEdit?.id || name.trim().toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
            name: name.trim(),
            event_type: eventType as NotificationRule['event_type'],
            channel: channel as NotificationRule['channel'],
            channel_config: JSON.parse(buildChannelConfig()),
            is_enabled: isEnabled,
        };
        if (ruleToEdit) {
            await updateNotificationRule(ruleToEdit.id, payload);
        } else {
            await createNotificationRule(payload);
        }
        setSaving(false);
        onClose();
    };

    const handleTest = async () => {
        if (!ruleToEdit) return;
        setTesting(true);
        await testNotificationRule(ruleToEdit.id);
        setTesting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-bg-700">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-text-100 mb-6">
                        {ruleToEdit ? '编辑告警规则' : '创建告警规则'}
                    </h3>

                    {/* Name */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-text-300 mb-1">规则名称</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-bg-800 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="例如：设备离线邮件告警"
                        />
                    </div>

                    {/* Event Type */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-text-300 mb-1">事件类型</label>
                        <select
                            value={eventType}
                            onChange={e => setEventType(e.target.value)}
                            className="w-full bg-bg-800 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>

                    {/* Channel */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-text-300 mb-1">通知通道</label>
                        <select
                            value={channel}
                            onChange={e => setChannel(e.target.value)}
                            className="w-full bg-bg-800 border border-bg-700 rounded-md p-2 text-text-200 focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                            {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>

                    {/* Channel-specific config */}
                    {channel === 'email' && (
                        <div className="space-y-3 mb-4 p-3 bg-bg-800/50 rounded-md">
                            <h4 className="text-sm font-medium text-text-200">SMTP 邮件配置</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-text-400 mb-1">SMTP 服务器</label>
                                    <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                                        className="w-full bg-bg-700 border border-bg-600 rounded p-1.5 text-text-200 text-sm" placeholder="smtp.example.com" />
                                </div>
                                <div>
                                    <label className="block text-xs text-text-400 mb-1">端口</label>
                                    <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                                        className="w-full bg-bg-700 border border-bg-600 rounded p-1.5 text-text-200 text-sm" placeholder="465" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-text-400 mb-1">发件邮箱</label>
                                <input type="email" value={senderEmail} onChange={e => setSenderEmail(e.target.value)}
                                    className="w-full bg-bg-700 border border-bg-600 rounded p-1.5 text-text-200 text-sm" placeholder="alert@company.com" />
                            </div>
                            <div>
                                <label className="block text-xs text-text-400 mb-1">邮箱密码/授权码</label>
                                <input type="password" value={senderPassword} onChange={e => setSenderPassword(e.target.value)}
                                    className="w-full bg-bg-700 border border-bg-600 rounded p-1.5 text-text-200 text-sm" placeholder="••••••••" />
                            </div>
                            <div>
                                <label className="block text-xs text-text-400 mb-1">收件邮箱（多个用逗号分隔）</label>
                                <input type="text" value={recipientEmails} onChange={e => setRecipientEmails(e.target.value)}
                                    className="w-full bg-bg-700 border border-bg-600 rounded p-1.5 text-text-200 text-sm" placeholder="admin@company.com,ops@company.com" />
                            </div>
                        </div>
                    )}

                    {(channel === 'wechat_work' || channel === 'dingtalk') && (
                        <div className="space-y-3 mb-4 p-3 bg-bg-800/50 rounded-md">
                            <h4 className="text-sm font-medium text-text-200">
                                {channel === 'wechat_work' ? '企业微信' : '钉钉'} Webhook 配置
                            </h4>
                            <div>
                                <label className="block text-xs text-text-400 mb-1">Webhook URL</label>
                                <input type="text" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                                    className="w-full bg-bg-700 border border-bg-600 rounded p-1.5 text-text-200 text-sm"
                                    placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
                            </div>
                            {channel === 'dingtalk' && (
                                <div>
                                    <label className="block text-xs text-text-400 mb-1">签名密钥（可选）</label>
                                    <input type="text" value={dingtalkSecret} onChange={e => setDingtalkSecret(e.target.value)}
                                        className="w-full bg-bg-700 border border-bg-600 rounded p-1.5 text-text-200 text-sm"
                                        placeholder="SEC..." />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Enabled toggle */}
                    <div className="mb-6 flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} className="sr-only peer" />
                            <div className="w-11 h-6 bg-bg-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                        <span className="text-sm text-text-300">{isEnabled ? '已启用' : '已停用'}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-4 border-t border-bg-700">
                        <div>
                            {ruleToEdit && (
                                <button
                                    onClick={handleTest}
                                    disabled={testing}
                                    className="text-sm bg-bg-700 hover:bg-bg-600 text-text-200 font-medium py-2 px-4 rounded-md disabled:opacity-50"
                                >
                                    {testing ? '测试中...' : '测试发送'}
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="text-sm bg-bg-700 hover:bg-bg-600 text-text-200 font-medium py-2 px-4 rounded-md">
                                取消
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!isValid() || saving}
                                className="text-sm bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? '保存中...' : ruleToEdit ? '保存' : '创建'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlertRuleModal;