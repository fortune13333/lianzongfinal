import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmButtonVariant?: 'primary' | 'danger' | 'warning';
}

const WarningIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);


const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = '确认',
  cancelText = '取消',
  confirmButtonVariant = 'primary',
}) => {
  if (!isOpen) {
    return null;
  }

  const getButtonClasses = () => {
    switch (confirmButtonVariant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700';
      case 'primary':
      default:
        return 'bg-primary-600 hover:bg-primary-700';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
    >
      <div
        className="bg-bg-900 rounded-lg shadow-2xl w-full max-w-md border border-bg-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-bg-800">
                <WarningIcon />
            </div>
            <div className="flex-1">
              <h2 id="confirmation-dialog-title" className="text-lg font-bold text-text-100">
                {title}
              </h2>
              <div className="mt-2 text-sm text-text-300 [&_strong]:text-text-100">{children}</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-bg-950/50 border-t border-bg-700 flex justify-end items-center gap-4 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="bg-bg-700 hover:bg-bg-600 text-text-100 font-bold py-2 px-4 rounded-md transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`text-white font-bold py-2 px-4 rounded-md transition-colors ${getButtonClasses()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;