import React from 'react';
import { BrainIcon } from './AIIcons';

interface ConfigCheckReportModalProps {
  isOpen: boolean;
  report: string;
  onClose: () => void;
}

const ConfigCheckReportModal: React.FC<ConfigCheckReportModalProps> = ({ isOpen, report, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-check-report-title"
    >
      <div
        className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-bg-700 flex justify-between items-center flex-shrink-0">
          <h2 id="config-check-report-title" className="text-xl font-bold text-text-100 flex items-center gap-2">
            <BrainIcon />
            AI 配置体检报告
          </h2>
          <button onClick={onClose} className="text-text-400 hover:text-text-100 text-3xl leading-none">&times;</button>
        </div>

        <div className="p-6 flex-grow overflow-y-auto">
          <p className="text-sm text-text-300 whitespace-pre-wrap">{report}</p>
        </div>

        <div className="p-4 bg-bg-950/50 border-t border-bg-700 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigCheckReportModal;